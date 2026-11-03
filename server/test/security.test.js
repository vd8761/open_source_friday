const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const { PGlite } = require('@electric-sql/pglite');
const { allowedOrigin, corsOptions, securityHeaders, createLoginGuard, MAX_FAILURES } = require('../security');
const { rateLimit } = require('../v2-routes');
const { initV2DB } = require('../v2-data');

test('only the OSF site, its previews and the app may call the API from a browser', () => {
  const prod = allowedOrigin({}, { production: true });
  const preview = allowedOrigin({ ALLOWED_ORIGINS: 'https://dev.osf.example' }, { production: false });
  for (const o of [undefined, 'https://osf.descienceosclub.com', 'capacitor://localhost', 'https://localhost']) assert.equal(prod(o), true, o);
  for (const o of ['https://evil.example', 'http://localhost:5173', 'https://open-source-friday-git-v20-main-ariyas-projects-40e5ec5b.vercel.app', 'https://osf.descienceosclub.com.evil.example']) assert.equal(prod(o), false, o);
  for (const o of ['http://localhost:5174', 'https://open-source-friday-git-v20-main-ariyas-projects-40e5ec5b.vercel.app', 'https://open-source-friday-abc123-ariyas-projects-40e5ec5b.vercel.app', 'https://dev.osf.example']) assert.equal(preview(o), true, o);
  for (const o of ['https://open-source-friday-x-someone-else.vercel.app', 'https://evil.vercel.app']) assert.equal(preview(o), false, o);
});

test('API responses carry CORS only for allowed origins, plus security headers', async () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders({ production: true }));
  app.use(cors(corsOptions({}, { production: true })));
  app.get('/x', (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/x`;
  try {
    const good = await fetch(url, { headers: { Origin: 'https://osf.descienceosclub.com' } });
    assert.equal(good.headers.get('access-control-allow-origin'), 'https://osf.descienceosclub.com');
    const bad = await fetch(url, { headers: { Origin: 'https://evil.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    assert.equal(good.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(good.headers.get('x-frame-options'), 'DENY');
    assert.match(good.headers.get('strict-transport-security'), /max-age=31536000/);
    assert.equal(good.headers.get('x-powered-by'), null);
  } finally { await new Promise(r => server.close(r)); }
});

test(`an admin username locks after ${MAX_FAILURES} wrong passwords and unlocks on success`, async () => {
  const db = new PGlite();
  await db.exec('CREATE TABLE students(id SERIAL PRIMARY KEY); CREATE TABLE episodes(id SERIAL PRIMARY KEY, episode_number INTEGER);');
  await initV2DB(db);
  const guard = createLoginGuard({ query: (...a) => db.query(...a) });
  for (let i = 0; i < MAX_FAILURES - 1; i++) await guard.failed('Admin');
  assert.equal(await guard.lockedMinutes('admin'), 0);
  await guard.failed(' ADMIN ');
  const minutes = await guard.lockedMinutes('admin');
  assert.ok(minutes >= 14 && minutes <= 15, String(minutes));
  assert.equal(await guard.lockedMinutes('someone-else'), 0);
  // Old failures outside the window start a fresh count.
  await guard.succeeded('admin');
  await guard.failed('admin');
  await db.exec("UPDATE admin_login_attempts SET first_failure_at = NOW() - INTERVAL '1 hour', failures = 4");
  await guard.failed('admin');
  assert.equal(await guard.lockedMinutes('admin'), 0);
});

test('per-IP form limits answer 429 with Retry-After once exceeded', async () => {
  let t = 0;
  const limit = rateLimit({ limit: 2, windowMs: 60000, now: () => t });
  const app = express(); app.set('trust proxy', 1);
  app.post('/f', limit, (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const post = () => fetch(`http://127.0.0.1:${server.address().port}/f`, { method: 'POST' });
  try {
    assert.deepEqual([(await post()).status, (await post()).status], [200, 200]);
    const blocked = await post();
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    t = 61000;
    assert.equal((await post()).status, 200);
  } finally { await new Promise(r => server.close(r)); }
});
