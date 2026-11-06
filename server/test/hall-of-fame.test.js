const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { initOutreachDB } = require('../outreach-schema');
const { initWhatsAppConsent } = require('../whatsapp-consent');
const { initV2DB } = require('../v2-data');
const { createV2PublicRouter, createV2AdminRouter } = require('../v2-routes');

const photo = 'data:image/jpeg;base64,' + Buffer.from('student-face').toString('base64');
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE admins(id INTEGER PRIMARY KEY); INSERT INTO admins VALUES(1);
    CREATE TABLE students(id SERIAL PRIMARY KEY,full_name TEXT,email TEXT UNIQUE,whatsapp_number TEXT,country_code TEXT DEFAULT '+91',college TEXT);
    CREATE TABLE episodes(id SERIAL PRIMARY KEY,episode_number INTEGER UNIQUE,title TEXT,description TEXT,event_date TIMESTAMP,event_time TEXT,event_mode TEXT DEFAULT 'Online',
      presenter_name TEXT,presenter_designation TEXT,presenter_photo_url TEXT,cover_photo_url TEXT,is_active BOOLEAN DEFAULT TRUE,is_registration_open BOOLEAN DEFAULT TRUE,is_test BOOLEAN DEFAULT FALSE,archived_at TIMESTAMPTZ,zoom_meeting_id TEXT);
    CREATE TABLE episode_registrations(id SERIAL PRIMARY KEY,episode_id INTEGER REFERENCES episodes(id),student_id INTEGER REFERENCES students(id),registered_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE zoom_registration_jobs(registration_id INTEGER PRIMARY KEY,meeting_id TEXT,status TEXT,invitation_status TEXT);
    INSERT INTO students(full_name,email,college) VALUES ('Kavya Raman','kavya@example.com','PSG Tech'),('Arun Kumar','arun@example.com','Anna University'),('Early Admin','early@example.com',NULL);
    INSERT INTO episodes(episode_number,title,event_date,event_time) VALUES (15,'Older','2026-10-23','7:00 PM - 8:00 PM'),(16,'Latest','2026-10-30','7:00 PM - 8:00 PM');`);
  await initWhatsAppConsent(db); await initOutreachDB(db); await initV2DB(db);
  // Arun registered first; Early Admin was added by an admin even earlier and must not win "first to register".
  await db.exec(`INSERT INTO episode_registrations(episode_id,student_id,registered_at,added_by_admin_id) VALUES
      (2,3,'2026-10-20T03:00:00Z',1),(2,2,'2026-10-24T03:42:00Z',NULL),(2,1,'2026-10-25T10:00:00Z',NULL);
    INSERT INTO attendance_syncs(episode_id,meeting_uuid,source,report_complete) VALUES (2,'u','zoom',TRUE);
    INSERT INTO attendance_participants(id,episode_id,registration_id,duration_seconds) VALUES ('p1',2,3,3480),('p2',2,2,1200);`);
  const pool = { query: (...a) => db.query(...a), connect: async () => ({ query: (...a) => db.query(...a), release() {} }) };
  const app = express(); app.use(express.json({ limit: '5mb' }));
  const auth = (req, res, next) => req.headers.authorization === 'Bearer admin' ? (req.user = { id: 1 }, next()) : res.status(401).json({ success: false });
  app.use('/api', createV2PublicRouter({ pool, verifyRecaptcha: async () => true }));
  app.use('/api/admin', createV2AdminRouter({ pool, authenticateToken: auth }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body, admin = false) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer admin' } : {}) }, body: body && JSON.stringify(body) });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  return { db, call, close: () => new Promise(r => server.close(r)) };
}

test('admin sees suggestions from registrations and Zoom minutes; admin-added registrations never win first to register', async () => {
  const { call, close } = await setup();
  try {
    assert.equal((await call('GET', '/admin/episodes/2/hall-of-fame')).status, 401);
    const r = (await call('GET', '/admin/episodes/2/hall-of-fame', null, true)).body;
    assert.equal(r.suggestions.first_to_register.display_name, 'Arun Kumar');
    assert.equal(r.suggestions.first_to_register.stat, 'Registered 24 Oct, 9:12 AM IST');
    assert.deepEqual([r.suggestions.stayed_longest.display_name, r.suggestions.stayed_longest.stat], ['Kavya Raman', '58 min on the call']);
    assert.equal(r.suggestions.most_interactive, null);
    assert.equal(r.attendees.length, 3);
  } finally { await close(); }
});

test('awards go public only with consent and publish; photos are served only for published awards', async () => {
  const { call, close } = await setup();
  try {
    const entry = { registration_id: 3, display_name: 'Kavya Raman', college: 'PSG Tech', stat: 'Asked 4 questions', photo_url: photo, consent_confirmed: false, is_published: true };
    assert.equal((await call('PUT', '/admin/episodes/2/hall-of-fame/most_interactive', entry, true)).status, 400);
    assert.equal((await call('PUT', '/admin/episodes/2/hall-of-fame/best_dressed', entry, true)).status, 400);
    assert.equal((await call('PUT', '/admin/episodes/2/hall-of-fame/most_interactive', { ...entry, registration_id: 999 }, true)).status, 400);
    const saved = await call('PUT', '/admin/episodes/2/hall-of-fame/most_interactive', { ...entry, is_published: false }, true);
    assert.equal(saved.status, 200);
    assert.equal((await call('GET', '/hall-of-fame')).body.hall_of_fame, null);
    assert.equal((await call('GET', `/hall-of-fame/${saved.body.id}/photo`)).status, 404);

    // Saving without photo_url keeps the stored photo.
    await call('PUT', '/admin/episodes/2/hall-of-fame/most_interactive', { ...entry, photo_url: undefined, consent_confirmed: true, is_published: true }, true);
    await call('PUT', '/admin/episodes/1/hall-of-fame/first_to_register', { display_name: 'Older Winner', consent_confirmed: true, is_published: true }, true);
    await call('PUT', '/admin/episodes/2/hall-of-fame/first_to_register', { registration_id: 2, display_name: 'Arun Kumar', stat: 'Registered 24 Oct', consent_confirmed: true, is_published: true }, true);
    const pub = (await call('GET', '/hall-of-fame')).body.hall_of_fame;
    assert.equal(pub.episode_number, 16);
    assert.equal(pub.event_date, '2026-10-30');
    assert.deepEqual(pub.awards.map(a => [a.label, a.display_name]), [['First to register', 'Arun Kumar'], ['Interacted the most', 'Kavya Raman']]);
    assert.equal(pub.awards[0].photo_url, null);
    assert.equal((await call('GET', pub.awards[1].photo_url.replace(/^\/api/, ''))).body.toString(), 'student-face');
    assert.equal((await call('GET', '/admin/episodes/2/hall-of-fame', null, true)).body.awards.find(a => a.award === 'most_interactive').photo_url, photo);

    assert.equal((await call('DELETE', '/admin/episodes/2/hall-of-fame/most_interactive', null, true)).status, 200);
    assert.deepEqual((await call('GET', '/hall-of-fame')).body.hall_of_fame.awards.map(a => a.award), ['first_to_register']);
  } finally { await close(); }
});
