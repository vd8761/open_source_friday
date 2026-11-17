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
async function setup({ recaptcha = true, limit = 100, alertPitch, onSpeakerThanksQueued } = {}) {
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
    now: () => Date.parse('2026-11-02T12:00:00Z'), applicationLimit: rateLimit({ limit, windowMs: 3600000 }), alertPitch, onSpeakerThanksQueued }));
  app.use('/api/admin', createV2AdminRouter({ pool, authenticateToken: auth, onSpeakerThanksQueued }));
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
    // Public speakers are listed by domain only, without their episodes.
    assert.equal(ari.episodes, undefined);
    assert.equal(ari.is_featured, false);
    assert.equal((await call('PUT', `/admin/speakers/${a.body.id}/featured`, { is_featured: true })).status, 401);
    assert.equal((await call('PUT', `/admin/speakers/${a.body.id}/featured`, { is_featured: 'yes' }, true)).status, 400);
    assert.equal((await call('PUT', `/admin/speakers/${a.body.id}/featured`, { is_featured: true }, true)).body.is_featured, true);
    assert.equal((await call('GET', '/speakers')).body.speakers.find(s => s.id === a.body.id).is_featured, true);
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
    // The count follows the admin speaker list (published only), including speakers who have not spoken yet.
    await call('POST', '/admin/speakers', { name: 'Future Speaker' }, true);
    await call('POST', '/admin/speakers', { name: 'Hidden Speaker', is_published: false }, true);
    const { stats } = (await call('GET', '/stats')).body;
    assert.equal(stats.episodes_shipped, 3);
    assert.equal(stats.speakers_count, 1);
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
  const alerts = [];
  const { call, actions, close } = await setup({ limit: 3, alertPitch: async p => { alerts.push(p); return 1; } });
  const pitch = { link: 'https://www.linkedin.com/in/asha/', mobile_number: '+91 98765 43210', preferred_call_time: '1 PM–4 PM', name: 'Asha', email: 'Asha@Example.com', role_company: 'SRE, Example', title: 'On-call without tears', abstract: 'What I learned.', domain: 'cloud_computing', preferred_fridays: ['2026-11-06'], recaptcha_token: 'ok' };
  try {
    assert.equal((await call('POST', '/speaker-applications', { ...pitch, recaptcha_token: 'bad' })).status, 400);
    assert.equal(actions.at(-1), 'speaker_application');
    assert.equal((await call('POST', '/speaker-applications', { ...pitch, preferred_fridays: ['2026-11-05'] })).status, 400);
    const ok = await call('POST', '/speaker-applications', pitch);
    assert.equal(ok.status, 200);
    // The team is alerted once per accepted pitch, with the domain's name.
    await new Promise(r => setTimeout(r, 50));
    assert.equal(alerts.length, 1);
    assert.deepEqual([alerts[0].title, alerts[0].email, alerts[0].domain_label], ['On-call without tears', 'asha@example.com', 'Cloud Computing']);
    assert.equal((await call('GET', '/admin/speaker-applications/new-count', null, true)).body.count, 1);
    const limited = await call('POST', '/speaker-applications', pitch);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    const list = (await call('GET', '/admin/speaker-applications?status=new', null, true)).body;
    assert.equal(list.total, 1);
    assert.equal(list.data[0].email, 'asha@example.com');
    const full = (await call('GET', `/admin/speaker-applications/${list.data[0].id}`, null, true)).body.application;
    assert.equal(full.link, pitch.link);
    assert.equal(list.data[0].mobile_number, '+919876543210');
    assert.equal(full.preferred_call_time, pitch.preferred_call_time);
    assert.equal(alerts[0].link, pitch.link);
    assert.equal(alerts[0].mobile_number, '+919876543210');
    assert.equal(alerts[0].preferred_call_time, pitch.preferred_call_time);
    assert.deepEqual(full.preferred_fridays.map(d => new Date(d).toISOString().slice(0, 10)), ['2026-11-06']);
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

test('admins add, rename and hide domains; speakers, episodes, tips and pitches accept new ones', async () => {
  const { db, call, close } = await setup();
  try {
    await initV2DB(db);
    assert.deepEqual((await call('GET', '/domains')).body.domains.map(d => d.key), ['ai_engineer', 'cloud_computing', 'open_source', 'digital_skills']);
    assert.equal((await call('POST', '/admin/domains', { label: 'Data & Analytics' })).status, 401);
    const added = await call('POST', '/admin/domains', { label: ' Data & Analytics ' }, true);
    assert.deepEqual(added.body.domain, { key: 'data_and_analytics', label: 'Data & Analytics', sort: 5, is_active: true });
    assert.equal((await call('POST', '/admin/domains', { label: 'data & analytics' }, true)).status, 409);
    assert.equal((await call('POST', '/admin/domains', { label: '!!!' }, true)).status, 400);
    assert.equal((await call('POST', '/admin/domains', { label: 'x'.repeat(41) }, true)).status, 400);

    const sp = await call('POST', '/admin/speakers', { name: 'New Person', domains: ['data_and_analytics', 'open_source'] }, true);
    assert.equal(sp.status, 200);
    assert.equal((await call('POST', '/admin/speakers', { name: 'Other', domains: ['not_a_domain'] }, true)).status, 400);
    const ep = (await db.query('SELECT id FROM episodes WHERE episode_number=4')).rows[0].id;
    assert.equal((await call('PUT', `/admin/episodes/${ep}/v2-details`, { domain: 'data_and_analytics' }, true)).status, 200);
    assert.equal((await call('POST', '/admin/tips', { text: 'Tip', domain: 'data_and_analytics' }, true)).status, 200);

    const admin = (await call('GET', '/admin/domains', null, true)).body.domains.find(d => d.key === 'data_and_analytics');
    assert.equal(admin.speaker_count, 1); assert.equal(admin.episode_count, 1);

    // Renaming keeps the key; hiding removes it from the website and from new pitches, but existing links stay.
    const hidden = await call('PUT', '/admin/domains/data_and_analytics', { label: 'Data and AI', is_active: false }, true);
    assert.deepEqual([hidden.body.domain.key, hidden.body.domain.label, hidden.body.domain.is_active], ['data_and_analytics', 'Data and AI', false]);
    assert.ok(!(await call('GET', '/domains')).body.domains.some(d => d.key === 'data_and_analytics'));
    assert.deepEqual((await db.query("SELECT domains FROM speakers WHERE name='New Person'")).rows[0].domains, ['data_and_analytics', 'open_source']);
    assert.equal((await call('PUT', '/admin/domains/missing', { label: 'X' }, true)).status, 404);
  } finally { await close(); }
});


test('speaker contact requirements reject missing details, website links and invalid callback windows without storing a pitch', async () => {
  const { call, db, close } = await setup();
  const pitch = { name: 'Asha', email: 'asha@example.com', role_company: 'Engineer', title: 'Building', abstract: 'Practical ideas', domain: 'open_source', recaptcha_token: 'ok', link: 'https://www.linkedin.com/in/asha/', mobile_number: '+919876543210', preferred_call_time: '9 AM–12 PM' };
  try {
    for (const change of [{ link: 'https://example.com' }, { link: 'https://linkedin.com.evil.example/in/asha/' }, { link: 'javascript:alert(1)' }, { link: 'https://linkedin.com/company/example/' }, { mobile_number: '' }, { mobile_number: '9876543210' }, { mobile_number: '+91abc' }, { preferred_call_time: '' }, { preferred_call_time: 'midnight' }]) {
      const result = await call('POST', '/speaker-applications', { ...pitch, ...change });
      assert.equal(result.status, 400, JSON.stringify(change));
    }
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM speaker_applications')).rows[0].n, 0);
  } finally { await close(); }
});


test('speaker enquiries deduplicate by email OR mobile, keep separate fields, and only alert on first save', async () => {
  const alerts=[];let receiptQueues=0;
  const {call,db,close}=await setup({alertPitch:async p=>alerts.push(p),onSpeakerThanksQueued:()=>receiptQueues++});
  const pitch={name:'Asha',email:' ASHA@example.com ',speaker_role:'Engineer',company:'Example',link:null,title:'First idea',abstract:'Practical examples',domain:'open_source',recaptcha_token:'ok',mobile_number:'+91 98765 43210',preferred_call_time:'1 PM–4 PM'};
  try {
    for(const fields of [{speaker_role:''},{company:''},{mobile_number:''}]) assert.equal((await call('POST','/speaker-applications',{...pitch,...fields})).status,400);
    assert.equal((await call('POST','/speaker-applications',pitch)).status,200);
    assert.equal((await call('POST','/speaker-applications',{...pitch,title:'Different session',mobile_number:'+919876543211'})).body.duplicate,true);
    assert.equal((await call('POST','/speaker-applications',{...pitch,email:'other@example.com',title:'Another session'})).body.duplicate,true);
    await new Promise(r=>setTimeout(r,20));
    assert.equal(alerts.length,1);assert.equal(receiptQueues,1);
    const rows=(await db.query('SELECT * FROM speaker_applications')).rows;
    assert.equal(rows.length,1);assert.equal(rows[0].speaker_role,'Engineer');assert.equal(rows[0].company,'Example');assert.equal(rows[0].link,null);assert.equal(rows[0].thank_you_status,'pending');
    assert.equal(alerts[0].speaker_role,'Engineer');assert.equal(alerts[0].company,'Example');
    await call('DELETE',`/admin/speaker-applications/${rows[0].id}`,null,true);
    assert.equal((await call('POST','/speaker-applications',pitch)).body.duplicate,true);
    assert.equal((await call('GET','/admin/speaker-applications/new-count',null,true)).body.count,0);
  } finally {await close();}
});

test('speaker table filters, private preview, full filtered export, trash restore and explicit permanent removal', async () => {
  const {call,db,close}=await setup();
  try {
    // Existing duplicates remain intact; migration never deletes or rewrites submitted contact data.
    for(let i=0;i<14;i++) await db.query(`INSERT INTO speaker_applications(name,email,role_company,speaker_role,company,title,domain,abstract,status,mobile_number,preferred_call_time,created_at)
      VALUES($1,$2,'Engineer, Studio','Engineer','Studio',$3,$4,'Detailed idea',$5,$6,'5 PM–8 PM',$7)`,[i===0?'=FORMULA':'Speaker '+i,`person${i}@example.com`,'Session '+i,i===0?'open_source':'cloud_computing',i===13?'contacted':'new',`+9198765432${String(i).padStart(2,'0')}`,i===0?'2026-11-01T20:00:00Z':'2026-11-02T12:00:00Z']);
    assert.equal((await call('GET','/admin/speaker-applications')).status,401);
    assert.equal((await call('GET','/admin/speaker-applications/1')).status,401);
    assert.equal((await call('GET','/admin/speaker-applications/export')).status,401);
    const list=(await call('GET','/admin/speaker-applications',null,true)).body;
    assert.equal(list.total,13);assert.equal(list.data.length,10);assert.ok(list.data.every(r=>r.status==='new'));
    assert.ok(!('abstract' in list.data[0]));
    assert.equal((await call('GET','/admin/speaker-applications?status=',null,true)).body.total,14);
    assert.equal((await call('GET','/admin/speaker-applications?domain=open_source&from=2026-11-02&to=2026-11-02',null,true)).body.total,1);
    assert.equal((await call('GET','/admin/speaker-applications?search=person1%40example.com',null,true)).body.total,1);
    assert.equal((await call('GET','/admin/speaker-applications?search=%25',null,true)).body.total,0);
    const csv=await call('GET','/admin/speaker-applications/export?status=&sort=name',null,true);
    assert.equal(csv.status,200);assert.equal(csv.body.toString().split('\r\n').length,15);
    assert.ok(csv.body.toString().includes('"Role","Company"'));assert.ok(csv.body.toString().includes("'=FORMULA"));assert.ok(csv.body.toString().includes('person13@example.com'));
    const preview=(await call('GET','/admin/speaker-applications/1',null,true)).body.application;
    assert.equal(preview.abstract,'Detailed idea');assert.equal(preview.preferred_call_time,'5 PM–8 PM');assert.equal(preview.speaker_role,'Engineer');
    assert.equal((await call('DELETE','/admin/speaker-applications/1/permanent',{confirm:'DELETE'},true)).status,404);
    assert.equal((await call('DELETE','/admin/speaker-applications/1',null,true)).status,200);
    assert.equal((await call('GET','/admin/speaker-applications?trash=true&status=',null,true)).body.total,1);
    assert.ok((await call('GET','/admin/speaker-applications/1',null,true)).body.application.deleted_at);
    assert.equal((await call('PATCH','/admin/speaker-applications/1',{status:'scheduled'},true)).status,404);
    assert.equal((await call('POST','/admin/speaker-applications/1/restore',{},true)).status,200);
    assert.equal((await call('PATCH','/admin/speaker-applications/1',{status:'scheduled'},true)).status,200);
    await call('DELETE','/admin/speaker-applications/1',null,true);
    const ids=(await call('GET','/admin/speaker-applications/trash-ids',null,true)).body.ids;
    assert.deepEqual(ids,[1]);
    await call('DELETE','/admin/speaker-applications/2',null,true);
    assert.equal((await call('POST','/admin/speaker-applications/empty-trash',{ids},true)).status,400);
    const empty=await call('POST','/admin/speaker-applications/empty-trash',{confirm:'EMPTY TRASH',ids:[...ids,3]},true);
    assert.equal(empty.body.deleted,1); // Active #3 and newly trashed #2 are retained.
    assert.equal((await call('GET','/admin/speaker-applications/1',null,true)).status,404);
    assert.equal((await call('DELETE','/admin/speaker-applications/2/permanent',{},true)).status,400);
    assert.equal((await call('DELETE','/admin/speaker-applications/2/permanent',{confirm:'DELETE'},true)).status,200);
    for(const query of ['sort=DROP','status=bad','from=2026-02-30']) assert.equal((await call('GET','/admin/speaker-applications?'+query,null,true)).status,400);
  } finally {await close();}
});

test('legacy enquiries block repeats without removing earlier duplicates; DB unique keys prevent racing inserts', async () => {
  const {db,call,close}=await setup();
  const {saveSpeakerPitch}=require('../speaker-applications');
  const p={name:'Asha',email:'asha@example.com',role_company:'Engineer',speaker_role:'Engineer',company:'Studio',link:null,title:'Idea',domain:'open_source',abstract:'Notes',preferred_fridays:[],mobile_number:'+919876543210',preferred_call_time:'9 AM–12 PM'};
  try {
    const pool={connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
    assert.ok(await saveSpeakerPitch(pool,p));
    assert.equal(await saveSpeakerPitch(pool,{...p,title:'New idea'}),null);
    const row=(await db.query('SELECT * FROM speaker_applications')).rows[0];
    await assert.rejects(db.query(`INSERT INTO speaker_applications(name,email,role_company,title,abstract,dedupe_key) VALUES('Other','other@example.com','Role','Other','Idea',$1)`,[row.dedupe_key]),e=>e.code==='23505');
    await assert.rejects(db.query(`INSERT INTO speaker_applications(name,email,role_company,title,abstract,mobile_dedupe_key) VALUES('Other','other@example.com','Role','Other','Idea',$1)`,[row.mobile_dedupe_key]),e=>e.code==='23505');
    await db.query(`INSERT INTO speaker_applications(name,email,role_company,title,abstract) VALUES('Legacy','legacy@example.com','Role','Old idea','Notes'),('Legacy','legacy@example.com','Role','Duplicate old idea','Notes')`);
    const result=await call('POST','/speaker-applications',{...p,email:'LEGACY@example.com',mobile_number:'+919876543299',recaptcha_token:'ok'});
    assert.equal(result.body.duplicate,true);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM speaker_applications')).rows[0].n,3);
  } finally {await close();}
});


test('admin may queue one thank-you for an old enquiry; sent, queued, uncertain or trashed enquiries cannot be sent again', async () => {
  let runs=0;const {db,call,close}=await setup({onSpeakerThanksQueued:()=>runs++});
  try {
    await db.query(`INSERT INTO speaker_applications(name,email,role_company,title,abstract) VALUES('Old speaker','old@example.com','Engineer','Idea','Notes')`);
    assert.equal((await call('POST','/admin/speaker-applications/1/thank-you',{})).status,401);
    assert.equal((await call('POST','/admin/speaker-applications/1/thank-you',{},true)).status,200);
    assert.equal((await call('POST','/admin/speaker-applications/1/thank-you',{},true)).status,409);
    await new Promise(r=>setTimeout(r,10));assert.equal(runs,1);
    for(const status of ['sent','sending','unknown']) {
      await db.query('UPDATE speaker_applications SET thank_you_status=$1 WHERE id=1',[status]);
      assert.equal((await call('POST','/admin/speaker-applications/1/thank-you',{},true)).status,409);
    }
    await db.query("UPDATE speaker_applications SET thank_you_status='pending' WHERE id=1");
    await call('DELETE','/admin/speaker-applications/1',null,true);
    assert.equal((await db.query('SELECT thank_you_status FROM speaker_applications WHERE id=1')).rows[0].thank_you_status,'skipped');
    assert.equal((await call('POST','/admin/speaker-applications/1/thank-you',{},true)).status,409);
  } finally {await close();}
});
