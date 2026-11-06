const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { initOutreachDB } = require('../outreach-schema');
const { initWhatsAppConsent } = require('../whatsapp-consent');
const { initV2DB } = require('../v2-data');
const { createV2AdminRouter } = require('../v2-routes');

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE admins(id INTEGER PRIMARY KEY); INSERT INTO admins VALUES(1);
    CREATE TABLE students(id SERIAL PRIMARY KEY,full_name TEXT,email TEXT UNIQUE,whatsapp_number TEXT,country_code TEXT DEFAULT '+91',college TEXT);
    CREATE TABLE episodes(id SERIAL PRIMARY KEY,episode_number INTEGER UNIQUE,title TEXT,description TEXT,event_date TIMESTAMP,event_time TEXT,event_mode TEXT DEFAULT 'Online',
      presenter_name TEXT,presenter_designation TEXT,presenter_photo_url TEXT,cover_photo_url TEXT,is_active BOOLEAN DEFAULT TRUE,is_registration_open BOOLEAN DEFAULT TRUE,is_test BOOLEAN DEFAULT FALSE,archived_at TIMESTAMPTZ,zoom_meeting_id TEXT);
    CREATE TABLE episode_registrations(id SERIAL PRIMARY KEY,episode_id INTEGER REFERENCES episodes(id),student_id INTEGER REFERENCES students(id),registered_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE zoom_registration_jobs(registration_id INTEGER PRIMARY KEY,meeting_id TEXT,status TEXT DEFAULT 'pending',invitation_status TEXT);
    INSERT INTO students(full_name,email,college) VALUES ('Kavya Raman','kavya@example.com','PSG Tech'),('Arun Kumar','arun@example.com','Anna University');
    INSERT INTO episodes(episode_number,title,event_date,event_time,zoom_meeting_id) VALUES
      (16,'Past talk','2026-10-30','7:00 PM - 8:00 PM','93368298213'),(17,'Next talk','2099-11-13','7:00 PM - 8:00 PM','93368298214');
    INSERT INTO episode_registrations(episode_id,student_id) VALUES (1,2);`);
  await initWhatsAppConsent(db); await initOutreachDB(db); await initV2DB(db);
  await db.exec(`INSERT INTO attendance_participants(id,episode_id,name,email,duration_seconds) VALUES
    ('${'a'.repeat(64)}',1,'Kavya R','kavya@example.com',2400),('${'b'.repeat(64)}',1,'Meena S','meena@example.com',3000);`);
  const pool = { query: (...a) => db.query(...a), connect: async () => ({ query: (...a) => db.query(...a), release() {} }) };
  let zoomRuns = 0;
  const app = express(); app.use(express.json());
  const auth = (req, res, next) => req.headers.authorization === 'Bearer admin' ? (req.user = { id: 1 }, next()) : res.status(401).json({ success: false });
  app.use('/api/admin', createV2AdminRouter({ pool, authenticateToken: auth, onZoomQueued: () => zoomRuns++ }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  const call = async (method, p, body, admin = true) => { const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer admin' } : {}) }, body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  return { db, call, zoomRuns: () => zoomRuns, close: () => new Promise(r => server.close(r)) };
}

test('contact search finds any student and flags who is already registered', async () => {
  const { call, close } = await setup();
  try {
    assert.equal((await call('GET', '/students/search?q=kav', null, false)).status, 401);
    const r = (await call('GET', '/students/search?q=a&episode_id=1')).body.students;
    assert.deepEqual(r.map(s => [s.full_name, s.already_registered]), [['Arun Kumar', true], ['Kavya Raman', false]]);
    assert.deepEqual((await call('GET', '/students/search?q=PSG')).body.students, []);
    assert.equal((await call('GET', '/students/search?q=kavya@')).body.students[0].email, 'kavya@example.com');
  } finally { await close(); }
});

test('adding a contact to an upcoming Zoom event queues their Zoom registration; a past event does not', async () => {
  const { db, call, zoomRuns, close } = await setup();
  try {
    const up = await call('POST', '/episodes/2/participants', { student_id: 1 });
    assert.equal(up.status, 200);
    assert.equal(up.body.zoom_queued, true);
    assert.equal(zoomRuns(), 1);
    assert.equal((await db.query('SELECT added_by_admin_id FROM episode_registrations WHERE id=$1', [up.body.registration_id])).rows[0].added_by_admin_id, 1);
    assert.equal((await db.query('SELECT meeting_id FROM zoom_registration_jobs WHERE registration_id=$1', [up.body.registration_id])).rows[0].meeting_id, '93368298214');
    assert.equal((await call('POST', '/episodes/2/participants', { student_id: 1 })).status, 409);

    const past = await call('POST', '/episodes/1/participants', { student_id: 1 });
    assert.equal(past.body.zoom_queued, false);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM zoom_registration_jobs WHERE registration_id=$1', [past.body.registration_id])).rows[0].n, 0);
    assert.equal(zoomRuns(), 1);
  } finally { await close(); }
});

test('a direct Zoom registrant is added (new contact from Zoom name/email) and their session linked in one step', async () => {
  const { db, call, close } = await setup();
  try {
    const r = await call('POST', '/episodes/1/participants', { participant_id: 'b'.repeat(64) });
    assert.equal(r.status, 200);
    assert.equal(r.body.created, true);
    const student = (await db.query('SELECT full_name,email FROM students WHERE id=$1', [r.body.student_id])).rows[0];
    assert.deepEqual(student, { full_name: 'Meena S', email: 'meena@example.com' });
    const p = (await db.query("SELECT registration_id,match_method FROM attendance_participants WHERE id=$1", ['b'.repeat(64)])).rows[0];
    assert.deepEqual([p.registration_id, p.match_method], [r.body.registration_id, 'manual']);
    assert.equal((await db.query("SELECT action FROM attendance_audit WHERE registration_id=$1", [r.body.registration_id])).rows[0].action, 'manual_match');
    assert.equal((await call('POST', '/episodes/1/participants', { participant_id: 'b'.repeat(64) })).status, 409);

    // An existing contact picked for a Zoom participant reuses that student.
    const k = await call('POST', '/episodes/1/participants', { participant_id: 'a'.repeat(64), student_id: 1 });
    assert.equal(k.body.student_id, 1);
    assert.equal((await call('POST', '/episodes/1/participants', { full_name: 'X', email: 'not-an-email' })).status, 400);
  } finally { await close(); }
});
