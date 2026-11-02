const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runtimeFlags, guardZoom, guardSender, pushAllowed } = require('../runtime-flags');
const { processZoomJobs } = require('../zoom-jobs');
const { processEpisodeReminders } = require('../episode-reminders');

const realZoom = calls => ({
  configured: () => true,
  validateMeeting: async id => calls.push(['validate', id]),
  attendance: async () => calls.push(['attendance']),
  addRegistrant: async (id, student) => { calls.push(['add', student.email]); return { registrantId: 'r1', joinUrl: 'https://zoom.us/private' }; },
});

test('every integration is off outside production unless explicitly enabled', () => {
  for (const env of [{}, { OSF_ENV: 'preview' }, { OSF_ENV: 'unknown' }, { OSF_ENV: 'development', ENABLE_ZOOM: 'yes' }]) {
    const f = runtimeFlags(env);
    assert.equal(f.production, false);
    assert.deepEqual([f.workers, f.zoom, f.sender, f.push], [false, false, false, false]);
  }
  const prod = runtimeFlags({ OSF_ENV: 'production' });
  assert.deepEqual([prod.workers, prod.zoom, prod.sender, prod.push], [true, true, true, true]);
  assert.equal(runtimeFlags({ OSF_ENV: 'production', ENABLE_PUSH: 'false' }).push, false);
  assert.deepEqual(runtimeFlags({ ZOOM_TEST_ALLOWLIST: ' A@x.com, b@x.com ,' }).zoomTestAllowlist, ['a@x.com', 'b@x.com']);
});

test('disabled Zoom makes no Zoom calls and leaves queued registrations pending', async () => {
  const calls = [];
  const zoom = guardZoom(realZoom(calls), runtimeFlags({ OSF_ENV: 'preview' }));
  assert.equal(zoom.configured(), false);
  assert.match(zoom.disabledReason, /dry-run/);
  await zoom.validateMeeting('12345678901');
  await assert.rejects(zoom.addRegistrant('12345678901', { email: 'a@x.com' }), /dry-run/);
  await assert.rejects(zoom.attendance('12345678901'), /dry-run/);
  let connected = false;
  await processZoomJobs({ connect: async () => { connected = true; } }, zoom, 1);
  assert.equal(connected, false);
  assert.deepEqual(calls, []);
});

test('enabled Zoom outside production enrolls only allowlisted test emails', async () => {
  const calls = [];
  const zoom = guardZoom(realZoom(calls), runtimeFlags({ OSF_ENV: 'preview', ENABLE_ZOOM: 'true', ZOOM_TEST_ALLOWLIST: 'owner.test@example.com' }));
  await zoom.addRegistrant('12345678901', { email: ' Owner.Test@Example.com ' });
  await assert.rejects(zoom.addRegistrant('12345678901', { email: 'student@college.edu' }), /ZOOM_TEST_ALLOWLIST/);
  assert.deepEqual(calls, [['add', ' Owner.Test@Example.com ']]);
});

test('production Zoom is passed through unchanged, and can still be switched off', async () => {
  const real = realZoom([]);
  assert.equal(guardZoom(real, runtimeFlags({ OSF_ENV: 'production' })), real);
  assert.equal(guardZoom(real, runtimeFlags({ OSF_ENV: 'production', ENABLE_ZOOM: 'false' })).configured(), false);
});

test('disabled Sender reports itself unconfigured so campaigns cannot start', () => {
  const sender = { configured: () => true, identity: () => ({ from_email: 'info@descienceosclub.com', configured: true }) };
  const off = guardSender(sender, runtimeFlags({}));
  assert.equal(off.configured(), false);
  assert.equal(off.identity().configured, false);
  assert.match(off.disabledReason, /cannot start/);
  assert.equal(guardSender(sender, runtimeFlags({ OSF_ENV: 'production' })), sender);
});

test('push outside production reaches only allowlisted subscription ids', () => {
  assert.equal(pushAllowed(runtimeFlags({}), { id: 1 }), false);
  const test = runtimeFlags({ OSF_ENV: 'preview', ENABLE_PUSH: 'true', PUSH_TEST_ALLOWLIST: '7' });
  assert.equal(pushAllowed(test, { id: 7 }), true);
  assert.equal(pushAllowed(test, { id: 8 }), false);
  assert.equal(pushAllowed(runtimeFlags({ OSF_ENV: 'production' }), { id: 8 }), true);
});

test('reminder grace extends only the late edge and keeps the per-minute default', async () => {
  const start = Date.parse('2026-12-04T13:30:00Z'); // 7:00 PM IST
  const episode = { id: 1, event_date: '2026-12-04', event_time: '7:00 PM - 8:00 PM', reminder_sent: false, starting_now_sent: false };
  const run = async (minutesAway, grace) => {
    const sent = [];
    const pool = { query: async sql => sql.startsWith('SELECT') ? { rows: [{ ...episode }] } : { rows: [{ id: 1 }] } };
    await processEpisodeReminders(pool, async p => sent.push(p.title), start - minutesAway * 60000, grace);
    return sent.length;
  };
  assert.equal(await run(24, 0), 0);
  assert.equal(await run(24, 10), 1);
  assert.equal(await run(35, 10), 0);
  assert.equal(await run(-8, 10), 1);
  assert.equal(await run(-13, 10), 0);
});
