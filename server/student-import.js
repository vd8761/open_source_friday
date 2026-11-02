const { InputError, readCsv } = require('./outreach-csv');
const fields = require('./registration-profile-fields.json');

// Adds old student records to the master list. Not tied to any episode, so nothing is sent anywhere.
// A row matching an existing student (email, or WhatsApp number + country code) only fills that
// student's blank fields; existing values are never overwritten.
const KEYS = fields.map(f => f.key);
const ALIASES = {
  full_name: ['full_name', 'name', 'student_name'], email: ['email', 'email_address', 'mail'],
  whatsapp_number: ['whatsapp_number', 'whatsapp', 'phone', 'mobile', 'phone_number', 'mobile_number'],
  country_code: ['country_code', 'code', 'dial_code'], gender: ['gender'], college: ['college', 'college_name', 'institution'],
  degree: ['degree'], department: ['department', 'branch', 'department_branch'], year_of_study: ['year_of_study', 'year', 'study_year'],
  is_dos_club_member: ['is_dos_club_member', 'dos_club_member', 'member', 'dos_member'], excited_topic: ['excited_topic', 'topic', 'topic_of_interest', 'interests'],
};
const text = v => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
// Stored values match the v1.0 registration form so admin filters keep working.
const GENDER = { male: 'Male', m: 'Male', female: 'Female', f: 'Female', other: 'Other' };
const MEMBER = { yes: 'Yes', y: 'Yes', true: 'Yes', no: 'No', n: 'No', false: 'No', 'not yet': 'No' };
function year(v) {
  const s = v.toLowerCase();
  if (/^(passed out|passed|graduated|alumni|completed)$/.test(s)) return 'Passed Out';
  const m = s.match(/^([1-4])(st|nd|rd|th)?( year)?$/);
  return m ? ['1st Year', '2nd Year', '3rd Year', '4th Year'][Number(m[1]) - 1] : null;
}

function normalize(input) {
  const v = Object.fromEntries(KEYS.map(k => [k, text(input[k])]));
  const errors = {}, notes = [];
  v.email = v.email.toLowerCase();
  v.whatsapp_number = v.whatsapp_number.replace(/[\s()-]/g, '');
  if (v.country_code && !v.country_code.startsWith('+')) v.country_code = `+${v.country_code}`;
  if (v.whatsapp_number && !v.country_code) { v.country_code = '+91'; notes.push('country code assumed +91'); }
  if (!v.full_name) errors.full_name = 'Name is required';
  if (!v.email && !v.whatsapp_number) errors.email = 'Email or WhatsApp number is required';
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = 'Invalid email';
  if (v.whatsapp_number && !/^\d{4,15}$/.test(v.whatsapp_number)) errors.whatsapp_number = 'Invalid WhatsApp number';
  if (v.country_code && !/^\+\d{1,4}$/.test(v.country_code)) errors.country_code = 'Invalid country code';
  if (v.gender) v.gender = GENDER[v.gender.toLowerCase()] || (errors.gender = 'Use Male, Female or Other', v.gender);
  if (v.year_of_study) v.year_of_study = year(v.year_of_study) || (errors.year_of_study = 'Use 1st–4th Year or Passed Out', v.year_of_study);
  if (v.is_dos_club_member) v.is_dos_club_member = MEMBER[v.is_dos_club_member.toLowerCase()] || (errors.is_dos_club_member = 'Use Yes or No', v.is_dos_club_member);
  for (const k of KEYS) if (v[k].length > (k === 'excited_topic' ? 2000 : 255)) errors[k] = 'Too long';
  return { values: v, errors, notes };
}

// Works out what each row would do. Read-only; `applyPlan` writes it.
async function planRows(db, rows) {
  const seen = new Map();
  const plan = [];
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const { values, errors, notes } = normalize(row);
    const keys = [values.email && `e:${values.email}`, values.whatsapp_number && `p:${values.country_code}${values.whatsapp_number}`].filter(Boolean);
    const dup = keys.map(k => seen.get(k)).find(Boolean);
    if (dup) errors.email = `Same person as row ${dup} in this file`;
    keys.forEach(k => seen.set(k, line));
    if (Object.keys(errors).length) { plan.push({ line, status: 'error', values, errors, notes }); continue; }
    const byEmail = values.email ? (await db.query('SELECT * FROM students WHERE LOWER(BTRIM(email))=$1', [values.email])).rows : [];
    const byPhone = values.whatsapp_number ? (await db.query('SELECT * FROM students WHERE whatsapp_number=$1 AND country_code=$2', [values.whatsapp_number, values.country_code])).rows : [];
    const ids = new Set([...byEmail, ...byPhone].map(s => s.id));
    if (ids.size > 1) { plan.push({ line, status: 'error', values, errors: { email: 'Email and WhatsApp number belong to different existing students' }, notes }); continue; }
    const existing = byEmail[0] || byPhone[0];
    if (!existing) { plan.push({ line, status: 'new', values, notes }); continue; }
    const fills = KEYS.filter(k => values[k] && !text(existing[k]));
    // Filling a blank email or number must not take one already used by another student.
    for (const [k, sql, args] of [['email', 'SELECT id FROM students WHERE LOWER(BTRIM(email))=$1 AND id<>$2', [values.email, existing.id]],
      ['whatsapp_number', 'SELECT id FROM students WHERE whatsapp_number=$1 AND country_code=$2 AND id<>$3', [values.whatsapp_number, values.country_code, existing.id]]]) {
      if (fills.includes(k) && (await db.query(sql, args)).rows.length) { plan.push({ line, status: 'error', values, errors: { [k]: 'Already used by another student' }, notes }); fills.length = 0; break; }
    }
    if (plan.at(-1)?.line === line) continue;
    // A filled number brings its country code with it.
    if (fills.includes('whatsapp_number') && !fills.includes('country_code')) fills.push('country_code');
    plan.push({ line, status: fills.length ? 'update' : 'unchanged', student_id: existing.id, name: existing.full_name, values, fills, notes });
  }
  return plan;
}

async function applyPlan(db, plan) {
  for (const p of plan) {
    if (p.status === 'new') {
      const keys = KEYS.filter(k => p.values[k]);
      p.student_id = (await db.query(`INSERT INTO students (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, keys.map(k => p.values[k]))).rows[0].id;
    } else if (p.status === 'update') {
      // Re-check blanks at write time so a concurrent edit is never overwritten.
      await db.query(`UPDATE students SET ${p.fills.map((k, i) => `${k}=CASE WHEN ${k} IS NULL OR BTRIM(${k})='' THEN $${i + 1} ELSE ${k} END`).join(', ')} WHERE id=$${p.fills.length + 1}`,
        [...p.fills.map(k => p.values[k]), p.student_id]);
    }
  }
  return plan;
}

const summary = plan => Object.fromEntries(['new', 'update', 'unchanged', 'error'].map(s => [s, plan.filter(p => p.status === s).length]));

function rowsFromCsv(csv) {
  const { columns, rows } = readCsv(csv);
  const pick = Object.fromEntries(KEYS.map(k => [k, ALIASES[k].find(a => columns.includes(a))]));
  if (!pick.full_name || (!pick.email && !pick.whatsapp_number)) throw new InputError('The CSV needs a name column and an email or WhatsApp number column. Download the template for the expected headers.');
  return rows.map(r => Object.fromEntries(KEYS.map(k => [k, pick[k] ? r[pick[k]] : ''])));
}

const TEMPLATE = `${KEYS.join(',')}\n`;

async function withTransaction(pool, fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const r = await fn(db); await db.query('COMMIT'); return r; }
  catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; }
  finally { db.release(); }
}

// Admin routes, mounted under /api/admin behind authenticateToken.
function registerStudentImportRoutes(router, { pool, route }) {
  router.get('/contacts/import-template', (req, res) => { res.type('text/csv').attachment('student-import-template.csv').send(TEMPLATE); });
  router.post('/contacts', route(async req => withTransaction(pool, async db => {
    const plan = await planRows(db, [req.body || {}]);
    const p = plan[0];
    if (p.status === 'error') { const e = new InputError(Object.values(p.errors)[0], 400); e.fieldErrors = p.errors; throw e; }
    await applyPlan(db, plan);
    return { status: p.status, student_id: p.student_id, fills: p.fills || [], notes: p.notes };
  })));
  // dry_run (default) returns the preview; dry_run=false applies the whole file in one transaction.
  router.post('/contacts/import', route(async req => withTransaction(pool, async db => {
    const rows = rowsFromCsv(req.body?.csv);
    const plan = await planRows(db, rows);
    const counts = summary(plan);
    if (req.body?.dry_run === false) {
      if (counts.error) throw new InputError(`Fix the ${counts.error} row(s) with errors, or remove them from the file, before importing.`);
      await applyPlan(db, plan);
    }
    return { dry_run: req.body?.dry_run !== false, summary: counts, rows: plan.map(({ line, status, values, errors, notes, fills, name }) => ({ line, status, name: values.full_name || name, email: values.email, whatsapp: values.whatsapp_number && `${values.country_code} ${values.whatsapp_number}`, errors, notes, fills })) };
  })));
}

module.exports = { normalize, planRows, applyPlan, rowsFromCsv, registerStudentImportRoutes, TEMPLATE };
