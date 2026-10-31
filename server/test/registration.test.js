const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const queries = [];
const zoomRequests = [];
let duplicate = false;
let zoomConfigured = false;
let registered = true;
let invitationStatus = 'pending';
let zoomJobStatus = 'registered';
process.env.JWT_SECRET = 'test-only-secret';
let closed = false;
let queueFailure = false;
let firstTimeStudent = false;
const completeStudent = { id: 7, email: 'stored@example.com', full_name: 'Stored Student', country_code: '+91', whatsapp_number: '9000000000', gender: 'Female', college: 'Example College', degree: 'B.E.', department: 'Computer Science', year_of_study: '2nd Year', is_dos_club_member: 'No', excited_topic: 'Open source' };
let storedStudent = { ...completeStudent };
let releases = 0;
let storedSilent = false;
let reminderRows = [];
let registrationDate = '2026-12-01';
let registrationTime = '8:00 PM - 9:00 PM';
const validatedMeetings = [];
const pushNotifications = [];
async function poolQuery(sql, values) {
  queries.push({ sql, values });
  if (sql.includes('FROM students WHERE LOWER(BTRIM(email))')) return { rows: [storedStudent].filter(s => s.email?.trim().toLowerCase() === values[0] || (s.whatsapp_number === values[0] && s.country_code === values[1])) };
  if (sql.includes('SELECT id FROM episode_registrations')) return { rows: duplicate ? [{ id: 10 }] : [] };
  if (sql.includes('SELECT status, meeting_id')) return { rows: [{ status: zoomJobStatus, meeting_id: '12345678901', invitation_status: zoomJobStatus === 'registered' ? 'zoom_managed' : invitationStatus }] };
  if (sql.includes('INSERT INTO episodes')) return { rows: [{ id: 16, episode_number: values[0], title: values[1], is_silent: values[14], is_test: values[15] }] };
  if (sql.includes('SELECT * FROM episodes WHERE is_active')) return { rows: reminderRows };
  if (sql.includes('SELECT * FROM push_subscriptions')) return { rows: [{ endpoint: 'test-endpoint', p256dh: 'key', auth: 'auth' }] };
  if (sql.includes('UPDATE episodes SET reminder_sent') || sql.includes('UPDATE episodes SET starting_now_sent')) {
    const flag = sql.includes('starting_now_sent') ? 'starting_now_sent' : 'reminder_sent';
    const row = reminderRows.find(r => r.id === values[0] && !r[flag] && !r.is_silent && r.event_date === values[1] && r.event_time === values[2]);
    if (!row) return { rows: [] };
    row[flag] = true; return { rows: [{ id: row.id }] };
  }
  if (sql.includes('INSERT INTO push_notification_history')) return { rows: [] };
  if (sql.includes('SELECT COUNT(*) FROM admins')) return { rows: [{ count: '1' }] };
  if (/^\s*(CREATE|ALTER)/.test(sql)) return { rows: [] };
  if (sql.includes("WHERE status = 'registered' AND invitation_status <> 'zoom_managed'")) { if (zoomJobStatus === 'registered') invitationStatus = 'zoom_managed'; return { rows: [] }; }
  throw new Error('Registration must use a checked out client');
}
const db = {
  async query(sql, values) {
    queries.push({ sql, values });
    if (!sql.includes('INSERT') && sql.includes('SELECT er.id, e.zoom_meeting_id')) return { rows: registered ? [{ id: 42, zoom_meeting_id: '12345678901', event_mode: 'Online' }] : [] };
    if (sql.includes('SELECT j.*')) return { rows: zoomJobStatus === 'registered' || invitationStatus === 'rate_limited' ? [] : [{ registration_id: 42, email: 'stored@example.com', full_name: 'Stored Student', meeting_id: '12345678901', status: 'pending', attempts: 0 }] };
    if (sql.includes("SET status = 'registered'")) { zoomJobStatus = 'registered'; invitationStatus = 'zoom_managed'; }
    if (sql.includes("invitation_status = 'sent'")) invitationStatus = 'sent';
    if (sql.includes("invitation_status = 'pending'")) invitationStatus = 'pending';
    if (sql.includes('SELECT * FROM episodes')) return { rows: [{ id: 1, is_active: !closed, is_silent: storedSilent, is_registration_open: true, zoom_meeting_id: '12345678901', event_mode: 'Online', event_date: registrationDate, event_time: registrationTime, episode_number: 5 }] };
    if (sql.includes('SET episode_number =')) { storedSilent = values[15]; return { rows: [{ id: 1, is_silent: storedSilent }] }; }
    if (sql.includes('SELECT id FROM episode_registrations')) return { rows: duplicate ? [{ id: 10 }] : [] };
    if (sql.includes('FROM students WHERE id=$1 FOR UPDATE')) return { rows: [{ ...storedStudent }] };
    if (sql.includes('FROM students WHERE LOWER(BTRIM(email))')) return { rows: firstTimeStudent ? [] : [{ ...storedStudent }] };
    if (sql.includes('SELECT id FROM students')) return { rows: [] };
    if (sql.startsWith('UPDATE students SET')) {
      const keys = sql.slice('UPDATE students SET '.length).split(' WHERE ')[0].split(', ').map(value => value.split('=')[0]);
      keys.forEach((key, i) => { storedStudent[key] = values[i]; }); return { rows: [] };
    }
    if (sql.includes('INSERT INTO students')) return { rows: [{ id: 7 }] };
    if (sql.includes('SELECT email, full_name')) return { rows: [{ ...storedStudent }] };
    if (queueFailure && sql.includes('INSERT INTO zoom_registration_jobs')) throw new Error('outbox unavailable');
    return { rows: [] };
  },
  release() { releases++; },
};
Module._load = function(name, ...args) {
  if (name === './zoom') return { ...originalLoad.call(this, name, ...args), createZoomClient: () => ({ configured: () => zoomConfigured, validateMeeting: async (...args) => { validatedMeetings.push(args); }, addRegistrant: async (id, student) => { zoomRequests.push({ id, email: student.email, full_name: student.full_name }); return { registrantId: 'r1', joinUrl: 'https://zoom.us/private' }; } }) };
  if (name === 'pg') return { Pool: class { connect() { return Promise.resolve(db); } query(sql, values) { return poolQuery(sql, values); } } };
  if (name === 'node-cron') return { schedule() {} };
  if (name === 'web-push') return { setVapidDetails() {}, async sendNotification(subscription, payload) { pushNotifications.push(JSON.parse(payload)); } };
  if (name === 'nodemailer') throw new Error('The application must not load an email sender');
  return originalLoad.call(this, name, ...args);
};
const { app, sendEpisodeReminders, initDB } = require('../server');
Module._load = originalLoad;
let server;
let base;
const nativeFetch = global.fetch;
before(async () => {
  global.fetch = async (url, options) => url === 'https://www.google.com/recaptcha/api/siteverify'
    ? { json: async () => ({ success: options.body.get('response') === 'valid', score: 0.9 }) }
    : nativeFetch(url, options);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { global.fetch = nativeFetch; await new Promise(resolve => server.close(resolve)); });
async function register(overrides = {}) {
  queries.length = 0; zoomRequests.length = 0; releases = 0;
  return nativeFetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episode_id: 1, is_existing: true, student_id: 7, email: 'untrusted@example.com', full_name: 'Untrusted', recaptcha_token: 'valid', ...overrides }) });
}
test('existing student registration confirms and commits its outbox without sending application emails', async () => {
  const response = await register();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).zoom_status, 'pending');
  const sql = queries.map(q => q.sql);
  assert.ok(sql[0] === 'BEGIN');
  assert.ok(sql[1].includes('FOR UPDATE'));
  assert.ok(sql.findIndex(q => q.includes('INSERT INTO zoom_registration_jobs')) < sql.indexOf('COMMIT'));
  assert.equal(zoomRequests.length, 0); // Enrollment starts from the committed outbox, not before confirmation.
  assert.equal(releases, 1);
});
test('new student lookup enters the same enrollment outbox', async () => {
  const response = await register({ ...completeStudent, is_existing: false });
  assert.equal(response.status, 201);
  assert.equal(zoomRequests.length, 0);
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO zoom_registration_jobs')));
});
test('duplicate and closed registrations roll back without queueing Zoom', async () => {
  for (const kind of ['duplicate', 'closed']) {
    duplicate = kind === 'duplicate'; closed = kind === 'closed';
    const response = await register();
    assert.equal(response.status, 400);
    assert.ok(queries.some(q => q.sql === 'ROLLBACK'));
    assert.ok(!queries.some(q => q.sql.includes('INSERT INTO zoom_registration_jobs')));
    assert.equal(zoomRequests.length, 0);
    assert.equal(releases, 1);
  }
  duplicate = closed = false;
});
test('outbox database failure rolls back registration instead of silently losing Zoom work', async () => {
  queueFailure = true;
  const response = await register();
  queueFailure = false;
  assert.equal(response.status, 500);
  assert.ok(queries.some(q => q.sql === 'ROLLBACK'));
  assert.ok(!queries.some(q => q.sql === 'COMMIT'));
  assert.equal(zoomRequests.length, 0);
  assert.equal(releases, 1);
});
test('failed CAPTCHA performs no registration database work', async () => {
  const response = await register({ recaptcha_token: 'invalid' });
  assert.equal(response.status, 400);
  assert.equal(queries.length, 0);
});

test('admin send requires authentication and an existing student registration', async () => {
  const path = `${base}/api/admin/episodes/1/registrations/7/zoom-invitation`;
  let response = await nativeFetch(path, { method: 'POST' });
  assert.equal(response.status, 401);
  zoomConfigured = true; registered = false;
  const token = require('jsonwebtoken').sign({ id: 1 }, process.env.JWT_SECRET);
  response = await nativeFetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 404);
  registered = true; zoomConfigured = false;
});
test('admin retry never re-registers or emails a student already registered with Zoom', async () => {
  zoomConfigured = true; zoomJobStatus = 'registered'; zoomRequests.length = 0;
  const token = require('jsonwebtoken').sign({ id: 1 }, process.env.JWT_SECRET);
  const path = `${base}/api/admin/episodes/1/registrations/7/zoom-invitation`;
  for (let i = 0; i < 2; i++) {
    const response = await nativeFetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.invitation_status, 'zoom_managed');
    assert.match(result.message, /Zoom handles the confirmation email/);
  }
  assert.equal(zoomRequests.length, 0);
  zoomConfigured = false;
});
test('admin enrollment uses the saved student identity and lets Zoom handle confirmation', async () => {
  zoomConfigured = true; zoomJobStatus = 'pending'; zoomRequests.length = 0;
  const response = await nativeFetch(`${base}/api/admin/episodes/1/registrations/7/zoom-invitation`, { method: 'POST', headers: adminHeaders() });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).invitation_status, 'zoom_managed');
  assert.deepEqual(zoomRequests, [{ id: '12345678901', email: 'stored@example.com', full_name: 'Stored Student' }]);
  zoomConfigured = false;
});

test('first-time student is saved before their registration and invitation job', async () => {
  firstTimeStudent = true;
  const response = await register({ ...completeStudent, is_existing: false });
  firstTimeStudent = false;
  assert.equal(response.status, 201);
  const sql = queries.map(q => q.sql);
  const studentInsert = sql.findIndex(q => q.includes('INSERT INTO students'));
  const registrationInsert = sql.findIndex(q => q.includes('INSERT INTO episode_registrations'));
  const invitationInsert = sql.findIndex(q => q.includes('INSERT INTO zoom_registration_jobs'));
  assert.ok(studentInsert >= 0 && studentInsert < registrationInsert && registrationInsert < invitationInsert);
});

function adminHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${require('jsonwebtoken').sign({ id: 1 }, process.env.JWT_SECRET)}` };
}
const episodeBody = { episode_number: 16, title: 'Internal Test', presenter_name: 'Test Host', event_date: '2026-12-01', event_time: '8:00 PM - 9:00 PM', event_mode: 'Online' };
test('silent episode creation persists silent mode and sends no subscriber announcement', async () => {
  pushNotifications.length = 0; queries.length = 0;
  const response = await nativeFetch(`${base}/api/episodes`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ ...episodeBody, is_silent: true }) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).episode.is_silent, true);
  assert.equal(pushNotifications.length, 0);
  assert.ok(!queries.some(q => q.sql.includes('push_subscriptions') || q.sql.includes('push_notification_history')));
});
test('regular episodes still announce by default and when silent mode is explicitly false', async () => {
  for (const extras of [{}, { is_silent: false }]) {
    pushNotifications.length = 0;
    const response = await nativeFetch(`${base}/api/episodes`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ ...episodeBody, ...extras }) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).episode.is_silent, false);
    assert.equal(pushNotifications.length, 1);
    assert.equal(pushNotifications[0].title, '🎉 New Episode Announced!');
  }
});
test('silent mode cannot be accidentally enabled using string booleans', async () => {
  for (const method of ['POST', 'PUT']) {
    const response = await nativeFetch(`${base}/api/episodes${method === 'PUT' ? '/1' : ''}`, { method, headers: adminHeaders(), body: JSON.stringify({ ...episodeBody, is_silent: 'false' }) });
    assert.equal(response.status, 400);
  }
});
test('editing an episode preserves omitted silent mode and supports switching it off', async () => {
  storedSilent = true;
  for (const [extras, expected] of [[{}, true], [{ is_silent: false }, false], [{ is_silent: true }, true]]) {
    const response = await nativeFetch(`${base}/api/episodes/1`, { method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ ...episodeBody, ...extras }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).episode.is_silent, expected);
  }
  storedSilent = false;
});
function reminderEpisode(minutesAway, isSilent) {
  const time = new Date(Date.now() + minutesAway * 60000 + 330 * 60000);
  return { id: 16, episode_number: 16, title: 'Test', is_silent: isSilent,
    event_date: time.toISOString().slice(0,10), event_time: time.toISOString().slice(11,16) };
}
test('silent episodes suppress both reminder types; ordinary reminders still send', async () => {
  for (const minutesAway of [30, 0]) {
    pushNotifications.length = 0;
    reminderRows = [reminderEpisode(minutesAway, true)];
    await sendEpisodeReminders();
    assert.equal(pushNotifications.length, 0);
    reminderRows = [reminderEpisode(minutesAway, false)];
    await sendEpisodeReminders();
    assert.equal(pushNotifications.length, 1);
  }
  reminderRows = [];
});
test('silent episodes still confirm student registration and queue the Zoom invitation', async () => {
  storedSilent = true; pushNotifications.length = 0;
  const response = await register();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).zoom_status, 'pending');
  assert.equal(zoomRequests.length, 0);
  assert.ok(queries.some(q => q.sql.includes('INSERT INTO zoom_registration_jobs')));
  assert.equal(pushNotifications.length, 0);
  storedSilent = false;
});
test('authenticated capability check lets the frontend fail safely against older backends', async () => {
  const path = `${base}/api/admin/episode-capabilities`;
  assert.equal((await nativeFetch(path)).status, 401);
  const response = await nativeFetch(path, { headers: adminHeaders() });
  assert.deepEqual(await response.json(), { success: true, silent_mode: true, schedule_validation: true, event_timezone: 'Asia/Kolkata', registration_close_minutes_after_start: 30, test_events: true });
});

test('startup clears legacy SMTP failures for successful Zoom registrations without sending anything', async () => {
  queries.length = 0; zoomRequests.length = 0; zoomJobStatus = 'registered'; invitationStatus = 'failed';
  await initDB();
  assert.equal(invitationStatus, 'zoom_managed');
  assert.equal(zoomRequests.length, 0);
  assert.ok(queries.some(q => q.sql.includes("WHERE status = 'registered' AND invitation_status <> 'zoom_managed'")));
});

test('manual enrollment preserves an active Zoom cooldown', async () => {
  zoomConfigured = true; zoomJobStatus = 'pending'; invitationStatus = 'rate_limited';
  zoomRequests.length = 0; queries.length = 0;
  try {
    const response = await nativeFetch(`${base}/api/admin/episodes/1/registrations/7/zoom-invitation`, { method: 'POST', headers: adminHeaders() });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).invitation_status, 'rate_limited');
    assert.equal(zoomRequests.length, 0);
    const update = queries.find(q => q.sql.includes('next_attempt_at = NOW(), last_error = NULL'));
    assert.match(update.sql, /invitation_status <> 'rate_limited' OR next_attempt_at <= NOW\(\)/);
    assert.ok(queries.find(q => q.sql.includes('SELECT j.*')).sql.includes('j.next_attempt_at <= NOW()'));
  } finally { zoomConfigured = false; zoomJobStatus = 'registered'; invitationStatus = 'zoom_managed'; }
});


test('registration API rejects a past schedule even when the admin Open flag is still true', async () => {
  registrationDate = '2020-01-01';
  try {
    const response = await register();
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /30 minutes after/);
    assert.ok(!queries.some(q => q.sql.includes('INSERT INTO episode_registrations')));
    assert.ok(!queries.some(q => q.sql.includes('INSERT INTO zoom_registration_jobs')));
  } finally { registrationDate = '2026-12-01'; }
});
test('invalid episode schedules fail before an episode is created or updated', async () => {
  for (const method of ['POST', 'PUT']) for (const event_time of ['13:00 PM - 2:00 PM', '8:00 PM - 8:00 PM', '9:00 PM - 8:00 PM']) {
    queries.length = 0;
    const response = await nativeFetch(`${base}/api/episodes${method === 'PUT' ? '/1' : ''}`, { method, headers: adminHeaders(), body: JSON.stringify({ ...episodeBody, event_time, is_silent: true }) });
    assert.equal(response.status, 400);
    assert.ok(!queries.some(q => q.sql.includes('INSERT INTO episodes') || q.sql.includes('SET episode_number =')));
  }
});
test('rescheduling revalidates the existing Zoom meeting and pauses running invitations in the transaction', async () => {
  queries.length = 0; validatedMeetings.length = 0;
  const response = await nativeFetch(`${base}/api/episodes/1`, { method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ ...episodeBody, event_date: '2026-12-02', is_silent: true }) });
  assert.equal(response.status, 200);
  assert.deepEqual(validatedMeetings[0], ['12345678901', { event_date: '2026-12-02', event_time: episodeBody.event_time }]);
  const pause = queries.findIndex(q => q.sql.includes('Episode schedule changed'));
  assert.ok(pause > 0 && pause < queries.findIndex(q => q.sql === 'COMMIT'));
  assert.match(queries.find(q => q.sql.includes('SET episode_number =')).sql, /starting_now_sent = CASE WHEN/);
});


test('test status is explicit at creation and cannot be used to relabel a real event', async () => {
  const created=await nativeFetch(`${base}/api/episodes`,{method:'POST',headers:adminHeaders(),body:JSON.stringify({...episodeBody,is_silent:true,is_test:true})});
  assert.equal(created.status,201);assert.equal((await created.json()).episode.is_test,true);
  const changed=await nativeFetch(`${base}/api/episodes/1`,{method:'PUT',headers:adminHeaders(),body:JSON.stringify({...episodeBody,is_test:true})});
  assert.equal(changed.status,409);assert.match((await changed.json()).error,/fixed when/);
});
test('past real events cannot be rescheduled or have registration history deleted', async () => {
  registrationDate='2020-01-01';
  try {
    const edited=await nativeFetch(`${base}/api/episodes/1`,{method:'PUT',headers:adminHeaders(),body:JSON.stringify({...episodeBody,event_date:'2099-01-01'})});
    assert.equal(edited.status,409);
    queries.length=0;
    const removed=await nativeFetch(`${base}/api/admin/episodes/1/registrations/7`,{method:'DELETE',headers:adminHeaders()});
    assert.equal(removed.status,409);
    assert.ok(!queries.some(q=>q.sql.includes('DELETE FROM episode_registrations')));
  } finally {registrationDate='2026-12-01';}
});

test('registration API accepts until 30 minutes after start and rejects the first millisecond past the cutoff',async()=>{
  const originalNow=Date.now;
  const start=require('../episode-time').episodeStart({event_date:registrationDate,event_time:registrationTime});
  try {
    for(const offset of [-60*60000,0,15*60000,30*60000]) {
      Date.now=()=>start+offset;
      const response=await register();assert.equal(response.status,201,`offset ${offset}`);
      assert.ok(queries.some(q=>q.sql.includes('INSERT INTO zoom_registration_jobs')));
    }
    Date.now=()=>start+30*60000+1;
    const response=await register();assert.equal(response.status,400);
    assert.match((await response.json()).error,/30 minutes after/);
    assert.ok(!queries.some(q=>q.sql.includes('INSERT INTO episode_registrations')));
    assert.ok(!queries.some(q=>q.sql.includes('INSERT INTO zoom_registration_jobs')));
  } finally {Date.now=originalNow;}
});


test('WhatsApp consent is optional, event-scoped, versioned and stored with the registration transaction',async()=>{
  const {NOTICE_VERSION,NOTICE_TEXT}=require('../whatsapp-consent');
  for(const choice of [undefined,false,true]) {
    const response=await register(choice===undefined?{}:{whatsapp_opt_in:choice,whatsapp_notice_version:NOTICE_VERSION,whatsapp_notice_text:'untrusted text',whatsapp_number:'untrusted phone'});
    assert.equal(response.status,201);
    assert.equal((await response.json()).whatsapp_opt_in,choice??null);
    const insert=queries.find(q=>q.sql.includes('INSERT INTO episode_registrations'));
    assert.equal(insert.values[2],choice??null);
    assert.equal(insert.values[3],choice===undefined?null:NOTICE_VERSION);
    assert.equal(insert.values[4],choice===undefined?null:NOTICE_TEXT);
    assert.equal(insert.values[5],choice===undefined?null:'+91 9000000000');
    assert.equal(insert.values[6],choice===undefined?null:'public_registration_form');
    assert.ok(queries.findIndex(q=>q===insert)<queries.findIndex(q=>q.sql==='COMMIT'));
    assert.ok(queries.some(q=>q.sql.includes('INSERT INTO zoom_registration_jobs')));
  }
});
test('invalid WhatsApp choices and obsolete notices do not create a registration or Zoom work',async()=>{
  const {NOTICE_VERSION}=require('../whatsapp-consent');
  for(const body of [{whatsapp_opt_in:'true',whatsapp_notice_version:NOTICE_VERSION},{whatsapp_opt_in:true},{whatsapp_opt_in:true,whatsapp_notice_version:'old'},{whatsapp_opt_in:null}]) {
    const response=await register(body);assert.equal(response.status,400);assert.equal(queries.length,0);
  }
});
test('an outbox failure rolls back an affirmative WhatsApp choice too',async()=>{
  queueFailure=true;
  try {const response=await register({whatsapp_opt_in:true,whatsapp_notice_version:require('../whatsapp-consent').NOTICE_VERSION});assert.equal(response.status,500);assert.ok(queries.some(q=>q.sql.includes('INSERT INTO episode_registrations')&&q.values[2]===true));assert.ok(queries.some(q=>q.sql==='ROLLBACK'));assert.ok(!queries.some(q=>q.sql==='COMMIT'));}
  finally {queueFailure=false;}
});

test('lookup distinguishes imported incomplete profiles without publishing academic details', async () => {
  try {
    for (const incomplete of [true, false]) {
      storedStudent = incomplete ? { id: 7, full_name: 'Imported Student', email: 'stored@example.com' } : { ...completeStudent };
      queries.length = 0;
      const response = await nativeFetch(`${base}/api/students/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: ' STORED@EXAMPLE.COM ', countryCode: '+91', episode_id: 1 }) });
      const result = await response.json();
      assert.equal(response.status, 200); assert.equal(result.profile_complete, !incomplete);
      assert.equal(result.missing_fields.includes('whatsapp_number'), incomplete);
      assert.equal(result.missing_fields.includes('college'), incomplete);
      assert.ok(!Object.hasOwn(result.student, 'college'));
      assert.ok(!queries.some(q => q.sql.includes('INSERT INTO episode_registrations') || q.sql.includes('INSERT INTO zoom_registration_jobs')));
    }
  } finally { storedStudent = { ...completeStudent }; }
});
test('API cannot confirm an incomplete returning profile or enqueue a Zoom invitation', async () => {
  storedStudent = { id: 7, full_name: 'Imported Student', email: 'stored@example.com' };
  try {
    const response = await register({ email: 'stored@example.com' }); const result = await response.json();
    assert.equal(response.status, 422); assert.ok(result.missing_fields.includes('whatsapp_number'));
    assert.ok(queries.some(q => q.sql === 'ROLLBACK'));
    assert.ok(!queries.some(q => q.sql.includes('UPDATE students') || q.sql.includes('INSERT INTO episode_registrations') || q.sql.includes('INSERT INTO zoom_registration_jobs')));
  } finally { storedStudent = { ...completeStudent }; }
});
test('completion saves the selected mobile and consent before committing registration and Zoom work', async () => {
  storedStudent = { id: 7, full_name: 'Imported Student', email: 'stored@example.com' };
  try {
    const response = await register({ ...completeStudent, country_code: '+65', whatsapp_number: '91234567', whatsapp_opt_in: true, whatsapp_notice_version: require('../whatsapp-consent').NOTICE_VERSION });
    assert.equal(response.status, 201); assert.equal(storedStudent.full_name, 'Imported Student');
    const update = queries.findIndex(q => q.sql.startsWith('UPDATE students SET'));
    const registration = queries.findIndex(q => q.sql.includes('INSERT INTO episode_registrations'));
    const zoom = queries.findIndex(q => q.sql.includes('INSERT INTO zoom_registration_jobs'));
    assert.ok(update >= 0 && update < registration && registration < zoom && zoom < queries.findIndex(q => q.sql === 'COMMIT'));
    assert.equal(queries[registration].values[5], '+65 91234567');
    assert.ok(!queries.some(q => q.sql.includes('INSERT INTO students')));
  } finally { storedStudent = { ...completeStudent }; }
});
