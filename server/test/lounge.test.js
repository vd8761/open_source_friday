const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { PGlite } = require('@electric-sql/pglite');
const { initOutreachDB } = require('../outreach-schema');
const { initWhatsAppConsent } = require('../whatsapp-consent');
const { initV2DB } = require('../v2-data');
const { createLoungeRouter, createCodeMailer } = require('../lounge');
const { createV2AdminRouter, rateLimit } = require('../v2-routes');

const SECRET = 'test-jwt-secret';
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE admins(id INTEGER PRIMARY KEY); INSERT INTO admins VALUES(1);
    CREATE TABLE students(id SERIAL PRIMARY KEY,full_name TEXT,email TEXT,whatsapp_number TEXT,country_code TEXT);
    CREATE TABLE episodes(id SERIAL PRIMARY KEY,episode_number INTEGER UNIQUE,title TEXT,description TEXT,event_date TIMESTAMP,event_time TEXT,event_mode TEXT DEFAULT 'Online',
      presenter_name TEXT,presenter_designation TEXT,presenter_photo_url TEXT,cover_photo_url TEXT,is_active BOOLEAN DEFAULT TRUE,is_registration_open BOOLEAN DEFAULT TRUE,is_test BOOLEAN DEFAULT FALSE,archived_at TIMESTAMPTZ,zoom_meeting_id TEXT);
    CREATE TABLE episode_registrations(id SERIAL PRIMARY KEY,episode_id INTEGER REFERENCES episodes(id),student_id INTEGER REFERENCES students(id),registered_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE zoom_registration_jobs(registration_id INTEGER PRIMARY KEY,status TEXT,invitation_status TEXT);
    INSERT INTO students(full_name,email) VALUES ('Present P','present@example.com'),('Partial Q','partial@example.com'),('Absent R','absent@example.com'),('Never S','never@example.com');
    INSERT INTO episodes(episode_number,title,event_date,event_time,archived_at) VALUES (16,'Resume Masterclass','2026-10-30','7:00 PM - 8:00 PM',NOW());
    INSERT INTO episode_registrations(episode_id,student_id) VALUES (1,1),(1,2),(1,3);`);
  await initWhatsAppConsent(db); await initOutreachDB(db); await initV2DB(db);
  // Present by admin override; partial by a short Zoom stay; absent: report complete, never joined.
  await db.exec(`INSERT INTO attendance_syncs(episode_id,meeting_uuid,source,report_complete) VALUES (1,'u','zoom',TRUE);
    INSERT INTO attendance_overrides(registration_id,status,note) VALUES (1,'present','Reviewed');
    INSERT INTO attendance_participants(id,episode_id,registration_id,duration_seconds) VALUES ('p2',1,2,600);
    UPDATE episodes SET recap='Public summary.',lounge_notes='Speaker notes.',recording_url='https://youtu.be/x',materials='[{"title":"Slides","url":"https://drive.google.com/x"}]' WHERE id=1;`);
  const pool = { query: (...a) => db.query(...a), connect: async () => ({ query: (...a) => db.query(...a), release() {} }) };
  const sent = [];
  const app = express(); app.use(express.json());
  app.use('/api', createLoungeRouter({ pool, secret: SECRET, verifyRecaptcha: async t => t === 'ok', sendCode: async (email, name, code) => sent.push({ email, code }), limiter: rateLimit({ limit: 100, windowMs: 60000 }) }));
  const adminAuth = (req, res, next) => { try { jwt.verify(String(req.headers.authorization).replace('Bearer ', ''), SECRET); next(); } catch { res.status(401).json({ success: false }); } };
  app.use('/api/admin', createV2AdminRouter({ pool, authenticateToken: adminAuth }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body, token) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  return { db, call, sent, close: () => new Promise(r => server.close(r)) };
}

test('only students marked present are emailed a code; others see the reason without any email', async () => {
  const { db, call, sent, close } = await setup();
  try {
    assert.equal((await call('POST', '/lounge/request-code', { email: 'present@example.com', episode: 16, recaptcha_token: 'bad' })).status, 400);
    for (const [email, reason] of [['nobody@example.com', 'not_registered'], ['never@example.com', 'not_registered'], ['absent@example.com', 'absent'], ['partial@example.com', 'partial']]) {
      const r = (await call('POST', '/lounge/request-code', { email, episode: 16, recaptcha_token: 'ok' })).body;
      assert.deepEqual([r.sent, r.reason], [false, reason]);
      assert.doesNotMatch(r.message, /\d+\s*(min|minute)|30/i);
    }
    assert.equal(sent.length, 0);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM lounge_codes')).rows[0].n, 0);
    const ok = (await call('POST', '/lounge/request-code', { email: ' Present@Example.com ', episode: 16, recaptcha_token: 'ok' })).body;
    assert.equal(ok.sent, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0].code, /^\d{6}$/);
    assert.ok(!JSON.stringify((await db.query('SELECT * FROM lounge_codes')).rows).includes(sent[0].code));
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    assert.equal((await call('POST', '/lounge/verify', { email: 'present@example.com', episode: 16, code: wrong })).status, 400);
    const verified = await call('POST', '/lounge/verify', { email: 'present@example.com', episode: 16, code: sent[0].code });
    assert.equal(verified.status, 200);
    assert.equal((await call('POST', '/lounge/verify', { email: 'present@example.com', episode: 16, code: sent[0].code })).status, 400); // single use
    const granted = await call('GET', '/lounge/episodes/16', null, verified.body.token);
    assert.deepEqual(granted.body, { success: true, access: 'granted', notes: 'Speaker notes.', recording_url: 'https://youtu.be/x', materials: [{ title: 'Slides', url: 'https://drive.google.com/x' }] });
    // Attendance is re-checked on every visit: if an admin changes it, the lounge closes.
    await db.exec("UPDATE attendance_overrides SET status='absent' WHERE registration_id=1");
    const denied = (await call('GET', '/lounge/episodes/16', null, verified.body.token)).body;
    assert.deepEqual([denied.access, denied.reason], ['denied', 'absent']);
    assert.ok(!('notes' in denied) && !('materials' in denied));
    assert.equal((await call('GET', '/lounge/episodes/16')).status, 401);
    // Unlocking Episode 16 never opens another episode's lounge; a code for 16 cannot unlock 15.
    await db.exec("UPDATE attendance_overrides SET status='present' WHERE registration_id=1; INSERT INTO episodes(episode_number,title,event_date,event_time) VALUES (15,'Niche domains','2026-10-23','7:00 PM - 8:00 PM')");
    const cross = await call('GET', '/lounge/episodes/15', null, verified.body.token);
    assert.equal(cross.status, 401);
    assert.match(cross.body.error, /Episode 15/);
    await call('POST', '/lounge/request-code', { email: 'present@example.com', episode: 16, recaptcha_token: 'ok' });
    assert.equal((await call('POST', '/lounge/verify', { email: 'present@example.com', episode: 15, code: sent.at(-1).code })).status, 400);
  } finally { await close(); }
});

test('codes are limited per student and sessions cannot cross into admin', async () => {
  const { call, sent, close } = await setup();
  try {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await call('POST', '/lounge/request-code', { email: 'present@example.com', episode: 16, recaptcha_token: 'ok' })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    assert.equal(sent.length, 3);
    const token = (await call('POST', '/lounge/verify', { email: 'present@example.com', episode: 16, code: sent.at(-1).code })).body.token;
    assert.equal((await call('GET', '/admin/episodes/1/lounge', null, token)).status, 401);
    const admin = jwt.sign({ id: 1 }, SECRET);
    assert.equal((await call('GET', '/lounge/episodes/16', null, admin)).status, 401);
    // Admin editing: links must be https, materials need a title and link.
    assert.equal((await call('PUT', '/admin/episodes/1/lounge', { recording_url: 'http://insecure' }, admin)).status, 400);
    assert.equal((await call('PUT', '/admin/episodes/1/lounge', { materials: [{ title: '', url: 'https://x.y' }] }, admin)).status, 400);
    assert.equal((await call('PUT', '/admin/episodes/1/lounge', { recap: 'New recap', materials: [{ title: 'Repo', url: 'https://github.com/x' }, { title: '', url: '' }] }, admin)).status, 200);
    assert.deepEqual((await call('GET', '/admin/episodes/1/lounge', null, admin)).body.lounge, { recap: 'New recap', lounge_notes: '', recording_url: '', materials: [{ title: 'Repo', url: 'https://github.com/x' }] });
  } finally { await close(); }
});

test('code emails go out only when enabled, and only to the test allowlist outside production', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push(JSON.parse(opts.body).to.email); return { ok: true, json: async () => ({ success: true, emailId: 'e1' }) }; };
  const preview = { production: false };
  assert.equal(await createCodeMailer({ env: {}, flags: preview, fetchImpl })('a@x.com', 'A', '123456', 16), false);
  const on = createCodeMailer({ env: { ENABLE_EMAIL_CODES: 'true', TEST_EMAIL_ALLOWLIST: 'owner@x.com', SENDER_API_TOKEN: 't' }, flags: preview, fetchImpl });
  assert.equal(await on('student@x.com', 'S', '123456', 16), false);
  assert.equal(await on('Owner@x.com', 'O', '123456', 16), true);
  assert.equal(await createCodeMailer({ env: { SENDER_API_TOKEN: 't' }, flags: { production: true }, fetchImpl })('anyone@x.com', 'A', '123456', 16), true);
  assert.deepEqual(calls, ['Owner@x.com', 'anyone@x.com']);
  const refused = createCodeMailer({ env: { SENDER_API_TOKEN: 't' }, flags: { production: true }, fetchImpl: async () => ({ ok: true, json: async () => ({ success: false }) }) });
  await assert.rejects(refused('a@x.com', 'A', '123456', 16), /did not accept/);
});
