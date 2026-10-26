const { test } = require('node:test');
const assert = require('node:assert/strict');
const { processZoomJobs } = require('../zoom-jobs');
function database(job, failUpdate = false) {
  const calls = [];
  const db = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (failUpdate && sql.includes("status = 'registered'")) throw new Error('database unavailable');
    // Simulate the SELECT's pending-only filter.
    return { rows: sql.includes('SELECT j.*') && job && job.status !== 'registered' ? [job] : [] };
  }, release: () => calls.push({ sql: 'RELEASE' }) };
  return { calls, pool: { connect: async () => db } };
}
const job = { registration_id: 42, meeting_id: '12345678901', email: 'ada@example.com', full_name: 'Ada', attempts: 0 };
test('successful enrollment records Zoom-managed confirmation without an application email sender', async () => {
  const { pool, calls } = database(job);
  await processZoomJobs(pool, { configured: () => true, addRegistrant: async (id, student) => {
    assert.equal(id, job.meeting_id); assert.equal(student.email, job.email);
    return { registrantId: 'r1', joinUrl: 'https://zoom.us/private' };
  } }, 1);
  const update = calls.find(c => c.sql.includes("status = 'registered'"));
  assert.deepEqual(update.values, [42, 'r1', 'https://zoom.us/private']);
  assert.ok(update.sql.includes("invitation_status = 'zoom_managed'"));
  assert.ok(!update.sql.includes('invitation_sent_at'));
  assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'RELEASE']);
});
test('Zoom failures preserve application registration and schedule capped retries', async () => {
  for (const [attempts, delay] of [[0, 60], [2, 240], [20, 3600]]) {
    const { pool, calls } = database({ ...job, attempts });
    await processZoomJobs(pool, { configured: () => true, addRegistrant: async () => { throw new Error('timeout'); } }, 1);
    assert.equal(calls.find(c => c.sql.includes('last_error = $2')).values[2], delay);
    assert.ok(!calls.some(c => c.sql.includes("SET status = 'registered'")));
    assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'RELEASE']);
  }
});
test('DB failure rolls back, allowing the next attempt to reconcile the accepted Zoom registration', async () => {
  const { pool, calls } = database(job, true);
  await assert.rejects(processZoomJobs(pool, { configured: () => true, addRegistrant: async () => ({ registrantId: 'r1', joinUrl: 'private' }) }, 1));
  assert.deepEqual(calls.slice(-2).map(c => c.sql), ['ROLLBACK', 'RELEASE']);
});
test('unconfigured Zoom leaves work pending and empty queues release connections', async () => {
  const { pool, calls } = database();
  await processZoomJobs(pool, { configured: () => false });
  assert.equal(calls.length, 0);
  await processZoomJobs(pool, { configured: () => true });
  assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'RELEASE']);
});
test('already registered students with obsolete SMTP failures are not retried or re-registered', async () => {
  const { pool, calls } = database({ ...job, status: 'registered', invitation_status: 'failed', last_error: 'Old SMTP error' });
  await processZoomJobs(pool, { configured: () => true, addRegistrant: async () => assert.fail('Already enrolled') });
  assert.ok(calls.find(c => c.sql.includes('SELECT j.*')).sql.includes("j.status = 'pending'"));
  assert.ok(!calls.some(c => /^\s*UPDATE/.test(c.sql)));
});
test('admin retry targets only the selected pending registration', async () => {
  const { pool, calls } = database(job);
  await processZoomJobs(pool, { configured: () => true, addRegistrant: async () => ({ registrantId: 'r1', joinUrl: 'https://zoom.us/private' }) }, 1, 42);
  assert.deepEqual(calls.find(c => c.sql.includes('SELECT j.*')).values, [42]);
});
test('outbox preserves safe Zoom guidance and hides arbitrary exception messages', async () => {
  const { ZoomError } = require('../zoom');
  for (const error of [new ZoomError('Zoom requires Last Name for this meeting.', 400), new Error('secret-provider-token')]) {
    const { pool, calls } = database(job);
    await processZoomJobs(pool, { configured: () => true, addRegistrant: async () => { throw error; } }, 1);
    const retry = calls.find(call => call.sql.includes('last_error = $2'));
    assert.ok(!retry.values[1].includes('secret-provider-token'));
    if (error instanceof ZoomError) assert.match(retry.values[1], /requires Last Name/);
  }
});
