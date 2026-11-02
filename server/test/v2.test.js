const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { episodeJsonReplacer } = require('../episode-time');
const { initV2DB, computeStats, nameKey } = require('../v2-data');
const { createV2PublicRouter, createV2AdminRouter, rateLimit, futureFridays } = require('../v2-routes');

const photo = 'data:image/jpeg;base64,' + Buffer.from('jpeg-bytes').toString('base64');
async function setup({ recaptcha = true, limit = 100 } = {}) {
  const db = new PGlite();
  await db.exec(`CREATE TABLE students(id SERIAL PRIMARY KEY,full_name TEXT,email TEXT,whatsapp_number TEXT,country_code TEXT);
    CREATE TABLE episodes(id SERIAL PRIMARY KEY,episode_number INTEGER UNIQUE,title TEXT,description TEXT,event_date TIMESTAMP,
      event_time TEXT DEFAULT '7:00 PM - 8:00 PM',presenter_name TEXT,presenter_designation TEXT,presenter_photo_url TEXT,cover_photo_url TEXT,
      event_mode TEXT DEFAULT 'Online',is_active BOOLEAN DEFAULT TRUE,is_registration_open BOOLEAN DEFAULT TRUE,is_test BOOLEAN DEFAULT FALSE,archived_at TIMESTAMPTZ);
    INSERT INTO episodes(episode_number,title,description,event_date,presenter_name,presenter_designation,presenter_photo_url,cover_photo_url) VALUES
      (1,'GPU Essentials','<p>GPU</p>','2026-07-24','Ariyappan P','Product Engineer','${photo}','${photo}'),
      (2,'Live Demo','<p>Demo</p>','2026-07-31','Ariyappan','Product Engineer',NULL,NULL),
      (3,'SDLC','<p>SDLC</p>','2026-10-09','Mr. Arumugam V','Principal Software Engineer',NULL,NULL),
      (4,'Future talk','<p>Soon</p>','2099-01-02','Dr. New Speaker, PhD','CTO',NULL,NULL);
    INSERT INTO episodes(episode_number,title,event_date,presenter_name,is_test) VALUES (5,'Test event','2020-01-03','Tester',TRUE);`);
  await initV2DB(db); await initV2DB(db);
  const pool = { query: (...a) => db.query(...a), connect: async () => ({ query: (...a) => db.query(...a), release() {} }) };
  const app = express();
  app.use(express.json({ limit: '5mb' })); app.set('json replacer', episodeJsonReplacer);
  const auth = (req, res, next) => req.headers.authorization === 'Bearer admin' ? (req.user = { id: 1 }, next()) : res.status(401).json({ success: false });
  const actions = [];
  app.use('/api', createV2PublicRouter({ pool, verifyRecaptcha: async (token, action) => { actions.push(action); return recaptcha && token === 'ok'; },
    now: () => Date.parse('2026-11-02T12:00:00Z'), applicationLimit: rateLimit({ limit, windowMs: 3600000 }) }));
  app.use('/api/admin', createV2AdminRouter({ pool, authenticateToken: auth }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body, admin = false) => {
    const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer admin' } : {}) }, body: body && JSON.stringify(body) });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, body: type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()), headers: r.headers };
  };
  return { db, call, actions, close: () => new Promise(r => server.close(r)) };
}

test('migration is idempotent and the down script reverses it without touching v1 columns', async () => {
  const { db, close } = await setup();
  try {
    await db.exec(fs.readFileSync(path.join(__dirname, '../db/migrations/001_v2_core.down.sql'), 'utf8'));
    const left = (await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('speakers','episode_speakers','tips','site_settings','speaker_applications')`)).rows;
    assert.deepEqual(left, []);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_name='episodes' AND column_name IN ('domain','agenda','short_blurb')")).rows[0].n, 0);
    assert.equal((await db.query('SELECT presenter_name FROM episodes WHERE episode_number=1')).rows[0].presenter_name, 'Ariyappan P');
    await initV2DB(db);
    assert.deepEqual((await db.query("SELECT value FROM site_settings WHERE key='club_stats'")).rows[0].value, []);
  } finally { await close(); }
});

test('public episode list never embeds images and falls back to v1 presenter fields', async () => {
  const { call, close } = await setup();
  try {
    const list = await call('GET', '/v2/episodes');
    assert.equal(list.status, 200);
    assert.ok(!JSON.stringify(list.body).includes('base64'));
    const ep1 = list.body.episodes.find(e => e.episode_number === 1);
    assert.equal(ep1.cover_url, '/api/episodes/1/cover');
    assert.deepEqual(ep1.speakers, [{ id: null, name: 'Ariyappan P', designation: 'Product Engineer', company: null, legacy: true, photo_url: '/api/episodes/1/presenter-photo' }]);
    assert.equal(ep1.event_date, '2026-07-24');
    assert.ok(!('description' in ep1));
    const detail = await call('GET', '/v2/episodes/episode-1');
    assert.equal(detail.body.episode.description, '<p>GPU</p>');
    assert.equal((await call('GET', '/v2/episodes/99')).status, 404);
    const img = await call('GET', '/episodes/1/presenter-photo');
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal(img.body.toString(), 'jpeg-bytes');
  } finally { await close(); }
});

test('speakers are one record shared by many episodes; a photo change is written through to v1 columns', async () => {
  const { db, call, close } = await setup();
  try {
    assert.equal((await call('POST', '/admin/speakers', { name: 'Ariyappan P' })).status, 401);
    const a = await call('POST', '/admin/speakers', { name: 'Ariyappan P', designation: 'Product Engineer', company: 'OriginBI Mindworks Pvt Ltd', photo_url: photo, domains: ['ai_engineer'] }, true);
    const b = await call('POST', '/admin/speakers', { name: 'Arumugam V', honorific: 'Mr.', designation: 'Principal Software Engineer', company: 'Fidelity Investments' }, true);
    assert.equal((await call('POST', '/admin/speakers', { name: ' ariyappan p ' }, true)).status, 409);
    assert.equal((await call('POST', '/admin/speakers', { name: 'X', domains: ['blockchain'] }, true)).status, 400);
    for (const n of [1, 2]) assert.equal((await call('PUT', `/admin/episodes/${n}/speakers`, { speaker_ids: [a.body.id] }, true)).status, 200);
    // Co-speakers: lead first.
    assert.equal((await call('PUT', '/admin/episodes/3/speakers', { speaker_ids: [b.body.id, a.body.id] }, true)).status, 200);
    assert.equal((await call('PUT', '/admin/episodes/3/speakers', { speaker_ids: [b.body.id, b.body.id] }, true)).status, 400);
    assert.equal((await call('PUT', '/admin/episodes/3/speakers', { speaker_ids: [999] }, true)).status, 400);
    let ep3 = (await db.query('SELECT presenter_name,presenter_designation FROM episodes WHERE episode_number=3')).rows[0];
    assert.deepEqual(ep3, { presenter_name: 'Mr. Arumugam V & Ariyappan P', presenter_designation: 'Principal Software Engineer, Fidelity Investments' });
    assert.equal((await db.query('SELECT presenter_designation FROM episodes WHERE episode_number=2')).rows[0].presenter_designation, 'Product Engineer, OriginBI Mindworks Pvt Ltd');

    const newPhoto = 'data:image/png;base64,' + Buffer.from('png-bytes').toString('base64');
    const update = await call('PUT', `/admin/speakers/${a.body.id}`, { name: 'Ariyappan P', designation: 'Product Engineer', company: 'OriginBI Mindworks Pvt Ltd', photo_url: newPhoto, domains: ['ai_engineer'] }, true);
    assert.equal(update.status, 200);
    const photos = (await db.query('SELECT episode_number,presenter_photo_url FROM episodes WHERE episode_number IN (1,2) ORDER BY 1')).rows;
    assert.ok(photos.every(r => r.presenter_photo_url === newPhoto));
    // Omitting photo_url keeps the stored photo.
    await call('PUT', `/admin/speakers/${a.body.id}`, { name: 'Ariyappan P', company: 'OriginBI Mindworks Pvt Ltd' }, true);
    assert.equal((await db.query('SELECT photo_url FROM speakers WHERE id=$1', [a.body.id])).rows[0].photo_url, newPhoto);

    const pub = (await call('GET', '/speakers')).body.speakers;
    const ari = pub.find(s => s.name === 'Ariyappan P');
    assert.match(ari.photo_url, new RegExp(`^/api/speakers/${a.body.id}/photo\\?v=\\d+$`));
    assert.deepEqual(ari.episodes.map(e => e.episode_number), [1, 2, 3]);
    assert.equal(ari.is_repeat, true);
    assert.equal((await call('GET', `/speakers/${a.body.id}/photo`)).body.toString(), 'png-bytes');
    const list = (await call('GET', '/v2/episodes')).body.episodes;
    assert.deepEqual(list.find(e => e.episode_number === 3).speakers.map(s => s.name), ['Arumugam V', 'Ariyappan P']);
    // Unpublished speakers disappear from public pages.
    await call('PUT', `/admin/speakers/${b.body.id}`, { name: 'Arumugam V', is_published: false }, true);
    assert.ok(!(await call('GET', '/speakers')).body.speakers.some(s => s.name === 'Arumugam V'));
    assert.equal((await call('GET', `/speakers/${b.body.id}/photo`)).status, 404);
  } finally { await close(); }
});

test('stats are computed from data, merging speaker names and excluding test events', async () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  const ep = (n, date, keys, extra = {}) => ({ episode_number: n, event_date: date, event_time: '7:00 PM - 8:00 PM', is_active: true, speaker_keys: keys, ...extra });
  const stats = computeStats([
    ep(1, '2026-07-24', ['name:ariyappan p'], { domain: 'ai_engineer' }), ep(2, '2026-07-31', ['name:ariyappan p']),
    ep(3, '2026-10-09', ['id:7', 'id:8']), ep(4, '2099-01-02', ['id:8']), ep(5, '2026-01-01', ['name:tester'], { is_test: true }),
    ep(6, '2099-01-09', ['id:9'], { archived: true }), ep(7, '2026-06-05', ['name:ariyappan p'], { is_active: false }),
    ep(8, '2099-01-16', ['id:10'], { is_active: false }),
  ], now);
  // Deactivated past episodes still shipped; deactivated future ones are not upcoming.
  assert.equal(stats.episodes_shipped, 4);
  assert.equal(stats.upcoming_count, 1);
  assert.equal(stats.speakers_count, 3);
  assert.equal(stats.repeat_speakers, 2);
  assert.deepEqual(stats.episodes_by_domain, { ai_engineer: 1, cloud_computing: 0, open_source: 0, digital_skills: 0, unassigned: 3 });
  assert.equal(stats.next_episode.episode_number, 4);
  assert.ok(!('speaker_keys' in stats.next_episode));
  assert.equal(nameKey('Dr. Jayaprakash Natarajan, PhD'), 'jayaprakash natarajan');
  assert.equal(nameKey('Mr Sathya  Prakash Sekaran'), 'sathya prakash sekaran');
});

test('stats endpoint reads live data and editable club stats', async () => {
  const { call, close } = await setup();
  try {
    assert.equal((await call('PUT', '/admin/site-settings/club_stats', { value: [{ label: 'Members', value: '6000+' }] }, true)).status, 200);
    assert.equal((await call('PUT', '/admin/site-settings/club_stats', { value: [{ label: '', value: '1' }] }, true)).status, 400);
    const { stats } = (await call('GET', '/stats')).body;
    assert.equal(stats.episodes_shipped, 3);
    // "Ariyappan P" and "Ariyappan" stay separate until the owner-approved backfill links them.
    assert.equal(stats.speakers_count, 4);
    assert.equal(stats.next_episode.episode_number, 4);
    assert.deepEqual(stats.club_stats, [{ label: 'Members', value: '6000+' }]);
    assert.deepEqual((await call('GET', '/site-settings')).body.settings, { club_stats: [{ label: 'Members', value: '6000+' }] });
  } finally { await close(); }
});

test('episode details accept a domain, agenda and blurb', async () => {
  const { call, close } = await setup();
  try {
    assert.equal((await call('PUT', '/admin/episodes/1/v2-details', { domain: 'ai_engineer', agenda: [' What GPUs do ', 'Picking a GPU'], short_blurb: 'Why AI needs GPUs.' }, true)).status, 200);
    assert.equal((await call('PUT', '/admin/episodes/1/v2-details', { domain: 'web3' }, true)).status, 400);
    assert.equal((await call('PUT', '/admin/episodes/1/v2-details', { agenda: [''] }, true)).status, 400);
    const ep = (await call('GET', '/v2/episodes/1')).body.episode;
    assert.deepEqual([ep.domain, ep.agenda, ep.short_blurb], ['ai_engineer', ['What GPUs do', 'Picking a GPU'], 'Why AI needs GPUs.']);
  } finally { await close(); }
});

test('only published tips are public and there is one tip of the week', async () => {
  const { call, close } = await setup();
  try {
    const t1 = await call('POST', '/admin/tips', { text: 'Pick the smallest GPU that fits your model.', episode_id: 1, is_tip_of_week: true, published_at: '2026-10-01T00:00:00Z' }, true);
    const t2 = await call('POST', '/admin/tips', { text: 'Ship small, ship often.', episode_id: 3, is_tip_of_week: true, published_at: '2026-10-02T00:00:00Z' }, true);
    await call('POST', '/admin/tips', { text: 'Draft, not yet published.' }, true);
    assert.equal((await call('POST', '/admin/tips', { text: 'Bad link', episode_id: 999 }, true)).status, 400);
    const tips = (await call('GET', '/tips')).body.tips;
    assert.deepEqual(tips.map(t => [t.id, t.is_tip_of_week, t.episode_number]), [[t2.body.id, true, 3], [t1.body.id, false, 1]]);
    assert.equal((await call('DELETE', `/admin/tips/${t1.body.id}`, null, true)).status, 200);
    assert.equal((await call('DELETE', `/admin/tips/${t1.body.id}`, null, true)).status, 404);
  } finally { await close(); }
});

test('speaker pitches need reCAPTCHA for the right action, valid fields, upcoming Fridays and a rate limit', async () => {
  const { call, actions, close } = await setup({ limit: 3 });
  const pitch = { name: 'Asha', email: 'Asha@Example.com', role_company: 'SRE, Example', title: 'On-call without tears', abstract: 'What I learned.', domain: 'cloud_computing', preferred_fridays: ['2026-11-06'], recaptcha_token: 'ok' };
  try {
    assert.equal((await call('POST', '/speaker-applications', { ...pitch, recaptcha_token: 'bad' })).status, 400);
    assert.equal(actions.at(-1), 'speaker_application');
    assert.equal((await call('POST', '/speaker-applications', { ...pitch, preferred_fridays: ['2026-11-05'] })).status, 400);
    const ok = await call('POST', '/speaker-applications', pitch);
    assert.equal(ok.status, 200);
    const limited = await call('POST', '/speaker-applications', pitch);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    const list = (await call('GET', '/admin/speaker-applications?status=new', null, true)).body;
    assert.equal(list.total, 1);
    assert.equal(list.data[0].email, 'asha@example.com');
    assert.deepEqual(list.data[0].preferred_fridays.map(d => new Date(d).toISOString().slice(0, 10)), ['2026-11-06']);
    assert.equal((await call('PATCH', `/admin/speaker-applications/${list.data[0].id}`, { status: 'contacted' }, true)).body.status, 'contacted');
    assert.equal((await call('PATCH', `/admin/speaker-applications/${list.data[0].id}`, { status: 'spam' }, true)).status, 400);
  } finally { await close(); }
  const now = Date.parse('2026-11-02T12:00:00Z');
  assert.deepEqual(futureFridays(['2026-11-06', '2026-11-06'], now), ['2026-11-06']);
  for (const bad of [['2026-10-30'], ['2026-02-30'], ['x'], ['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04']])
    assert.throws(() => futureFridays(bad, now));
});

test('speaker backfill dry-runs by default and applies the owner-approved CSV in one transaction', async () => {
  const { backfill, read } = require('../scripts/backfill-speakers');
  const db = new PGlite();
  const names = { 1: 'Mohanraaj Govindaswamy', 2: 'Ariyappan P', 3: 'Ariyappan P', 4: 'Ariyappan', 5: 'Mr Sathya Prakash Sekaran', 6: 'Rajesh Kanna',
    7: 'Padmanaban Varatharajan', 8: 'Bharathiraja Thangappalam', 9: 'Bharathiraja Thangappalam', 10: 'Mr Karthikeyan Natarajan', 11: 'Mr Karthikeyan Natarajan',
    12: 'Dr. Jayaprakash Natarajan, PhD', 13: 'Mr. Arumugam V', 14: 'Mr. Arumugam V', 15: 'Mr. Selvaganapathi Ramachandran', 16: 'Mr. Selvaganapathi Ramachandran' };
  await db.exec(`CREATE TABLE students(id SERIAL PRIMARY KEY);
    CREATE TABLE episodes(id SERIAL PRIMARY KEY,episode_number INTEGER UNIQUE,title TEXT,presenter_name TEXT,presenter_designation TEXT,presenter_photo_url TEXT);
    INSERT INTO episodes(episode_number,title,presenter_name,presenter_photo_url) VALUES ${Object.entries(names).map(([n, name]) => `(${n},'Ep ${n}','${name}','data:image/jpeg;base64,${n}')`).join(',')};`);
  await initV2DB(db);
  const speakers = read(path.join(__dirname, '../../docs/v2/speakers-approved.csv'));
  const episodes = read(path.join(__dirname, '../../docs/v2/episode-domains-approved.csv'));
  const dry = await backfill(db, speakers, episodes);
  assert.deepEqual(dry.errors, []);
  assert.deepEqual(dry.plan.find(p => p.speaker === 'Ariyappan P').names_on_episodes, ['Ariyappan P', 'Ariyappan']);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM speakers')).rows[0].n, 0);

  const applied = await backfill(db, speakers, episodes, { apply: true });
  assert.deepEqual(applied.errors, []);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM speakers')).rows[0].n, 10);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM episode_speakers')).rows[0].n, 16);
  const ari = (await db.query("SELECT photo_url FROM speakers WHERE name='Ariyappan P'")).rows[0];
  assert.equal(ari.photo_url, 'data:image/jpeg;base64,4');
  const ep4 = (await db.query('SELECT presenter_name,presenter_designation,domain FROM episodes WHERE episode_number=4')).rows[0];
  assert.deepEqual(ep4, { presenter_name: 'Ariyappan P', presenter_designation: 'Product Engineer, OriginBI Mindworks Pvt Ltd', domain: 'ai_engineer' });
  // Re-running is safe: no duplicates.
  await backfill(db, speakers, episodes, { apply: true });
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM episode_speakers')).rows[0].n, 16);

  const bad = await backfill(db, [{ name: 'Ghost', episodes: '99' }], [], { apply: true });
  assert.deepEqual(bad.errors, ['Ghost: episode(s) 99 not found']);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM speakers WHERE name='Ghost'")).rows[0].n, 0);
  assert.match((await backfill(db, [{ name: 'A', episodes: '1' }, { name: 'Mr. a', episodes: '2' }])).errors[0], /duplicate/);
});

test('adding old student records fills blanks only, never overwrites, and previews before importing', async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE students(id SERIAL PRIMARY KEY,full_name TEXT,email TEXT,whatsapp_number TEXT,country_code TEXT,gender TEXT,college TEXT,degree TEXT,department TEXT,year_of_study TEXT,is_dos_club_member TEXT,excited_topic TEXT);
    INSERT INTO students(full_name,email,whatsapp_number,country_code,college) VALUES ('Asha K','asha@example.com',NULL,NULL,'Old College'),('Ravi','ravi@example.com','9000000002','+91',NULL);`);
  const pool = { query: (...a) => db.query(...a), connect: async () => ({ query: (...a) => db.query(...a), release() {} }) };
  const app = express(); app.use(express.json());
  app.use('/api/admin', createV2AdminRouter({ pool, authenticateToken: (req, res, next) => req.headers.authorization === 'Bearer admin' ? next() : res.status(401).json({ success: false }) }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const call = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/admin${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin' }, body: body && JSON.stringify(body) }); return { status: r.status, body: r.headers.get('content-type').includes('json') ? await r.json() : await r.text() }; };
  try {
    assert.match((await call('GET', '/contacts/import-template')).body, /^full_name,email,whatsapp_number,country_code/);
    // Single add: an existing email fills only blank fields.
    const one = await call('POST', '/contacts', { full_name: 'Asha Kumar', email: ' ASHA@example.com ', college: 'New College', degree: 'B.E.', gender: 'female', year_of_study: '2' });
    assert.deepEqual([one.body.status, one.body.fills], ['update', ['gender', 'degree', 'year_of_study']]);
    assert.deepEqual((await db.query("SELECT full_name,college,degree,gender,year_of_study FROM students WHERE email='asha@example.com'")).rows[0],
      { full_name: 'Asha K', college: 'Old College', degree: 'B.E.', gender: 'Female', year_of_study: '2nd Year' });
    assert.equal((await call('POST', '/contacts', { full_name: 'No Contact' })).status, 400);
    assert.equal((await call('POST', '/contacts', { full_name: 'Bad', email: 'x@y.co', gender: 'robot' })).status, 400);
    // Import: preview first, nothing written; errors block the import.
    const csv = 'Name,Email,Phone,Year\nNew One,new1@example.com,9000000101,passed out\nRavi R,,9000000002,1\nRavi again,ravi@example.com,,\nDup,new1@example.com,,\nBroken,not-an-email,,\n';
    const preview = await call('POST', '/contacts/import', { csv });
    assert.deepEqual(preview.body.summary, { new: 1, update: 1, unchanged: 1, error: 2 });
    assert.deepEqual(preview.body.rows.find(r => r.line === 2).notes, ['country code assumed +91']);
    assert.match(preview.body.rows.find(r => r.line === 5).errors.email, /row 2/);
    assert.equal((await db.query('SELECT COUNT(*)::int n FROM students')).rows[0].n, 2);
    assert.equal((await call('POST', '/contacts/import', { csv, dry_run: false })).status, 400);
    const clean = csv.split('\n').filter(l => !/^(Dup|Broken)/.test(l)).join('\n');
    const done = await call('POST', '/contacts/import', { csv: clean, dry_run: false });
    assert.deepEqual([done.status, done.body.dry_run, done.body.summary], [200, false, { new: 1, update: 1, unchanged: 1, error: 0 }]);
    assert.deepEqual((await db.query("SELECT full_name,year_of_study FROM students WHERE email='new1@example.com'")).rows[0], { full_name: 'New One', year_of_study: 'Passed Out' });
    assert.equal((await db.query("SELECT year_of_study FROM students WHERE email='ravi@example.com'")).rows[0].year_of_study, '1st Year');
    assert.equal((await call('POST', '/contacts/import', { csv: 'foo,bar\n1,2\n' })).status, 400);
  } finally { await new Promise(r => server.close(r)); }
});
