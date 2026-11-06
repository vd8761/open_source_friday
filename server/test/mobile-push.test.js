const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { createMobilePushRouter, sendToMobileDevices, fcmMessage, verifyAppCheck } = require('../mobile-push');

const token = n => `fcm-token-${String(n).padStart(20, '0')}`;

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, '../db/migrations/008_mobile_devices.up.sql'), 'utf8'));
  const pool = { query: (...a) => db.query(...a) };
  const app = express();
  app.use(express.json());
  app.use('/api', createMobilePushRouter({ pool, verifyAppCheck: async t => t === 'valid-app-check' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = async (p, body, appCheck) => {
    const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const tokens = async () => (await db.query('SELECT token, platform FROM mobile_devices ORDER BY id')).rows;
  return { pool, post, tokens, close: () => new Promise(r => server.close(r)) };
}

test('devices register only from the app, re-register idempotently and can be removed', async () => {
  const t = await setup();
  try {
    assert.equal((await t.post('/push/devices', { token: token(1) })).status, 401);
    assert.equal((await t.post('/push/devices', { token: token(1) }, 'forged')).status, 401);
    assert.equal((await t.post('/push/devices', { token: 'short' }, 'valid-app-check')).status, 400);
    assert.equal((await t.post('/push/devices', { token: token(1) }, 'valid-app-check')).status, 200);
    assert.equal((await t.post('/push/devices', { token: token(1), platform: 'ios' }, 'valid-app-check')).status, 200);
    assert.deepEqual(await t.tokens(), [{ token: token(1), platform: 'ios' }]);
    assert.equal((await t.post('/push/devices/remove', { token: token(1) })).status, 200);
    assert.deepEqual(await t.tokens(), []);
  } finally { await t.close(); }
});

test('sends to allowed devices in batches and drops dead tokens', async () => {
  const t = await setup();
  try {
    for (let i = 1; i <= 3; i++) await t.pool.query('INSERT INTO mobile_devices (token) VALUES ($1)', [token(i)]);
    const calls = [];
    const messaging = {
      async sendEachForMulticast(message) {
        calls.push(message);
        return { responses: message.tokens.map(tk => tk === token(2)
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) };
      },
    };
    const payload = { title: 'New Episode', body: 'EP 18', url: '/register/episode-18', tag: 'new-episode-18' };
    assert.equal(await sendToMobileDevices({ pool: t.pool, payload, messaging, allowed: row => row.id !== 3 }), 1);
    assert.deepEqual(calls[0].tokens, [token(1), token(2)]);
    assert.equal(calls[0].notification.title, 'New Episode');
    assert.equal(calls[0].data.url, '/register/episode-18');
    assert.deepEqual((await t.tokens()).map(r => r.token), [token(1), token(3)]);
    assert.equal(await sendToMobileDevices({ pool: t.pool, payload, messaging: null }), 0);
  } finally { await t.close(); }
});

test('FCM message uses the app channel and string data', () => {
  const m = fcmMessage({ title: 'Hi', body: 'There', url: '/', tag: 'x' });
  assert.equal(m.android.notification.channelId, 'announcements');
  assert.equal(m.android.notification.tag, 'x');
  assert.deepEqual(m.data, { url: '/', tag: 'x' });
});

test('App Check is refused without Firebase configured', async () => {
  assert.equal(await verifyAppCheck('anything', null), false);
});
