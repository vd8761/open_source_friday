const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fields = require('../registration-profile-fields.json');
const { missingProfileFields, resolveRegistrationStudent } = require('../registration-profile');

const complete = { full_name: 'Stored Student', email: 'student@example.com', whatsapp_number: '9000000000', country_code: '+91', gender: 'Female', college: 'Example College', degree: 'B.E.', department: 'Computer Science', year_of_study: '2nd Year', is_dos_club_member: 'No', excited_topic: 'Open source' };
async function database(run) {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE students(id SERIAL PRIMARY KEY, ${fields.map(({ key }) => `${key} TEXT ${['email', 'whatsapp_number'].includes(key) ? 'UNIQUE' : ''}`).join(', ')});
      CREATE TABLE episode_registrations(id SERIAL PRIMARY KEY,student_id INTEGER REFERENCES students(id),episode_id INTEGER,whatsapp_opt_in BOOLEAN);`);
    const seed = async profile => (await db.query(`INSERT INTO students(${Object.keys(profile).join(',')}) VALUES(${Object.keys(profile).map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, Object.values(profile))).rows[0].id;
    await run(db, seed);
  } finally { await db.close(); }
}

test('email-only imports require contact and academic details, including whitespace-only gaps', () => {
  const missing = missingProfileFields({ full_name: 'Imported Student', email: 'imported@example.com', college: '  ' });
  assert.ok(missing.includes('whatsapp_number') && missing.includes('college') && missing.includes('year_of_study'));
  assert.ok(!missing.includes('full_name') && !missing.includes('email'));
  assert.deepEqual(missingProfileFields(complete), []);
});
test('completion keeps the same student, saved name/email, event history and previous consent', () => database(async (db, seed) => {
  const id = await seed({ full_name: 'Imported Name', email: complete.email });
  await db.query('INSERT INTO episode_registrations(student_id,episode_id,whatsapp_opt_in) VALUES($1,9,NULL)', [id]);
  const result = await resolveRegistrationStudent(db, { ...complete, full_name: 'Replacement Name', is_existing: true, student_id: id });
  assert.equal(result.id, id);
  const stored = (await db.query('SELECT * FROM students WHERE id=$1', [id])).rows[0];
  assert.equal(stored.full_name, 'Imported Name'); assert.equal(stored.whatsapp_number, complete.whatsapp_number);
  assert.deepEqual(missingProfileFields(stored), []);
  assert.equal((await db.query('SELECT count(*)::int n FROM students')).rows[0].n, 1);
  assert.deepEqual((await db.query('SELECT student_id,episode_id,whatsapp_opt_in FROM episode_registrations')).rows, [{ student_id: id, episode_id: 9, whatsapp_opt_in: null }]);
}));
test('a new mobile followed by the saved email completes the imported profile instead of duplicating it', () => database(async (db, seed) => {
  const id = await seed({ full_name: 'Imported Name', email: complete.email, country_code: '+91' });
  const result = await resolveRegistrationStudent(db, { ...complete, email: ' STUDENT@EXAMPLE.COM ', whatsapp_number: '9123 4567', country_code: '+65', is_existing: false });
  assert.equal(result.id, id); assert.equal(result.country_code, '+65'); assert.equal(result.whatsapp_number, '91234567');
  assert.equal((await db.query('SELECT count(*)::int n FROM students')).rows[0].n, 1);
}));
test('a phone lookup can supply a missing email and country without changing the existing number', () => database(async (db, seed) => {
  const id = await seed({ full_name: complete.full_name, whatsapp_number: complete.whatsapp_number });
  const result = await resolveRegistrationStudent(db, { ...complete, is_existing: true, student_id: id });
  assert.equal(result.id, id); assert.equal(result.email, complete.email); assert.deepEqual(missingProfileFields(result), []);
}));
test('incomplete or invalid direct submissions create neither a profile nor a profile update', () => database(async (db, seed) => {
  const id = await seed({ full_name: complete.full_name, email: complete.email });
  for (const input of [{ is_existing: true, student_id: id, email: complete.email }, { ...complete, whatsapp_number: 'invalid', is_existing: true, student_id: id }, { full_name: 'New', email: 'new@example.com', is_existing: false }]) {
    await assert.rejects(resolveRegistrationStudent(db, input), error => error.status === 422 && Boolean(error.fieldErrors.whatsapp_number));
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM students')).rows[0].n, 1);
  assert.equal((await db.query('SELECT whatsapp_number FROM students WHERE id=$1', [id])).rows[0].whatsapp_number, null);
}));
test('complete returning profiles keep their saved details and confirmation shortcut', () => database(async (db, seed) => {
  const id = await seed(complete);
  const result = await resolveRegistrationStudent(db, { is_existing: true, student_id: id, email: 'untrusted@example.com', college: 'Replacement' });
  assert.equal(result.id, id); assert.equal(result.email, complete.email); assert.equal(result.college, complete.college);
}));
test('email/mobile conflicts do not merge two students or overwrite either profile', () => database(async (db, seed) => {
  const id = await seed({ full_name: 'Imported', email: complete.email });
  await seed({ ...complete, email: 'other@example.com' });
  for (const is_existing of [true, false]) await assert.rejects(resolveRegistrationStudent(db, { ...complete, is_existing, student_id: id }), error => error.status === 409);
  assert.equal((await db.query('SELECT whatsapp_number FROM students WHERE id=$1', [id])).rows[0].whatsapp_number, null);
}));
test('knowing only an ID cannot modify an incomplete profile', () => database(async (db, seed) => {
  const id = await seed({ full_name: 'Imported', email: 'another@example.com' });
  await assert.rejects(resolveRegistrationStudent(db, { ...complete, is_existing: true, student_id: id }), error => error.status === 409);
}));
test('a newly filled form cannot silently replace a saved contact or record consent for another number', () => database(async (db, seed) => {
  await seed(complete);
  for (const changed of [{ whatsapp_number: '9111111111' }, { email: 'new@example.com' }]) {
    await assert.rejects(resolveRegistrationStudent(db, { ...complete, ...changed, is_existing: false }), error => error.status === 409);
  }
}));
test('registration transaction rollback also rolls back profile completion', () => database(async (db, seed) => {
  const id = await seed({ full_name: 'Imported', email: complete.email });
  await db.query('BEGIN');
  await resolveRegistrationStudent(db, { ...complete, is_existing: true, student_id: id });
  await db.query('INSERT INTO episode_registrations(student_id,episode_id) VALUES($1,99)', [id]);
  await db.query('ROLLBACK');
  assert.equal((await db.query('SELECT whatsapp_number FROM students WHERE id=$1', [id])).rows[0].whatsapp_number, null);
  assert.equal((await db.query('SELECT count(*)::int n FROM episode_registrations')).rows[0].n, 0);
}));
