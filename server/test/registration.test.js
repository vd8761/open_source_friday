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
let releases = 0;
let storedSilent = false;
let reminderRows = [];
const pushNotifications = [];
async function poolQuery(sql, values) {
  queries.push({ sql, values });
  if (sql.includes('SELECT status, meeting_id')) return { rows: [{ status: zoomJobStatus, meeting_id: '12345678901', invitation_status: zoomJobStatus === 'registered' ? 'zoom_managed' : invitationStatus }] };
  if (sql.includes('INSERT INTO episodes')) return { rows: [{ id: 16, episode_number: values[0], title: values[1], is_silent: values[14] }] };
  if (sql.includes('SELECT * FROM episodes WHERE is_active')) return { rows: reminderRows };
  if (sql.includes('SELECT * FROM push_subscriptions')) return { rows: [{ endpoint: 'test-endpoint', p256dh: 'key', auth: 'auth' }] };
  if (sql.includes('INSERT INTO push_notification_history') || sql.includes('UPDATE episodes SET reminder_sent')) return { rows: [] };
  if (sql.includes('SELECT COUNT(*) FROM admins')) return { rows: [{ count: '1' }] };
  if (/^\s*(CREATE|ALTER)/.test(sql)) return { rows: [] };
  if (sql.includes("WHERE status = 'registered' AND invitation_status <> 'zoom_managed'")) { if (zoomJobStatus === 'registered') invitationStatus = 'zoom_managed'; return { rows: [] }; }
  throw new Error('Registration must use a checked out client');
}
const db = {
  async query(sql, values) {
    queries.push({ sql, values });
    if (!sql.includes('INSERT') && sql.includes('SELECT er.id, e.zoom_meeting_id')) return { rows: registered ? [{ id: 42, zoom_meeting_id: '12345678901', event_mode: 'Online' }] : [] };
    if (sql.includes('SELECT j.*')) return { rows: zoomJobStatus === 'registered' ? [] : [{ registration_id: 42, email: 'stored@example.com', full_name: 'Stored Student', meeting_id: '12345678901', status: 'pending', attempts: 0 }] };
    if (sql.includes("SET status = 'registered'")) { zoomJobStatus = 'registered'; invitationStatus = 'zoom_managed'; }
    if (sql.includes("invitation_status = 'sent'")) invitationStatus = 'sent';
    if (sql.includes("invitation_status = 'pending'")) invitationStatus = 'pending';
    if (sql.includes('SELECT * FROM episodes')) return { rows: [{ id: 1, is_active: !closed, is_silent: storedSilent, is_registration_open: true, zoom_meeting_id: '12345678901', event_mode: 'Online', event_date: '2026-12-01', episode_number: 5 }] };
    if (sql.includes('SET episode_number =')) { storedSilent = values[15]; return { rows: [{ id: 1, is_silent: storedSilent }] }; }
    if (sql.includes('SELECT id FROM episode_registrations')) return { rows: duplicate ? [{ id: 10 }] : [] };
    if (sql.includes('SELECT id FROM students')) return { rows: firstTimeStudent ? [] : [{ id: 7 }] };
    if (sql.includes('INSERT INTO students')) return { rows: [{ id: 7 }] };
    if (sql.includes('SELECT email, full_name FROM students')) return { rows: [{ email: 'stored@example.com', full_name: 'Stored Student' }] };
    if (queueFailure && sql.includes('INSERT INTO zoom_registration_jobs')) throw new Error('outbox unavailable');
    return { rows: [] };
  },
  release() { releases++; },
};
Module._load = function(name, ...args) {
  if (name === './zoom') return { ...originalLoad.call(this, name, ...args), createZoomClient: () => ({ configured: () => zoomConfigured, addRegistrant: async (id, student) => { zoomRequests.push({ id, email: student.email, full_name: student.full_name }); return { registrantId: 'r1', joinUrl: 'https://zoom.us/private' }; } }) };
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
  const response = await register({ is_existing: false });
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
  const response = await register({ is_existing: false, email: 'stored@example.com', full_name: 'Stored Student' });
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
  const time = new Date(Date.now() + minutesAway * 60000);
  const pad = value => String(value).padStart(2, '0');
  return { id: 16, episode_number: 16, title: 'Test', is_silent: isSilent,
    event_date: `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`,
    event_time: `${pad(time.getHours())}:${pad(time.getMinutes())}` };
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
  assert.deepEqual(await response.json(), { success: true, silent_mode: true });
});

test('startup clears legacy SMTP failures for successful Zoom registrations without sending anything', async () => {
  queries.length = 0; zoomRequests.length = 0; zoomJobStatus = 'registered'; invitationStatus = 'failed';
  await initDB();
  assert.equal(invitationStatus, 'zoom_managed');
  assert.equal(zoomRequests.length, 0);
  assert.ok(queries.some(q => q.sql.includes("WHERE status = 'registered' AND invitation_status <> 'zoom_managed'")));
});
