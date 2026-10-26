const { test } = require('node:test');
const assert = require('node:assert/strict');
const { processZoomJobs } = require('../zoom-jobs');
function database(job, failUpdate = false) {
  const calls = [];
  const db = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (failUpdate && sql.includes("status = 'registered'")) throw new Error('database unavailable');
    return { rows: sql.includes('SELECT j.*') && job ? [job] : [] };
  }, release: () => calls.push({ sql: 'RELEASE' }) };
  return { calls, pool: { connect: async () => db } };
}
const job = { registration_id: 42, meeting_id: '12345678901', email: 'ada@example.com', full_name: 'Ada', attempts: 0 };
test('successful sync persists private Zoom details and commits', async () => {
  const { pool, calls } = database(job);
  await processZoomJobs(pool, { configured: () => true, addRegistrant: async (id, student) => {
    assert.equal(id, job.meeting_id); assert.equal(student.email, job.email);
    return { registrantId: 'r1', joinUrl: 'https://zoom.us/private' };
  } }, 1, async () => 'message-id');
  assert.deepEqual(calls.find(c => c.sql.includes("status = 'registered'")).values, [42, 'r1', 'https://zoom.us/private']);
  assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'RELEASE']);
});
test('Zoom failure preserves the registration and schedules retry with capped backoff', async () => {
  for (const [attempts, delay] of [[0, 60], [2, 240], [20, 3600]]) {
    const { pool, calls } = database({ ...job, attempts });
    await processZoomJobs(pool, { configured: () => true, addRegistrant: async () => { throw new Error('timeout'); } }, 1, async () => 'message-id');
    const retry = calls.find(c => c.sql.includes('last_error = $2'));
    assert.equal(retry.values[2], delay);
    assert.ok(!calls.some(c => c.sql.includes("SET status = 'registered'")));
    assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'RELEASE']);
  }
});
test('DB failure rolls back; a later attempt can reconcile an accepted Zoom registration', async () => {
  const { pool, calls } = database(job, true);
  await assert.rejects(processZoomJobs(pool, { configured: () => true, addRegistrant: async () => ({ registrantId: 'r1', joinUrl: 'private' }) }, 1, async () => 'message-id'));
  assert.deepEqual(calls.slice(-2).map(c => c.sql), ['ROLLBACK', 'RELEASE']);
});
test('empty queue releases the connection and unconfigured Zoom leaves jobs pending', async () => {
  const { pool, calls } = database();
  await processZoomJobs(pool, { configured: () => false });
  assert.equal(calls.length, 0);
  await processZoomJobs(pool, { configured: () => true });
  assert.deepEqual(calls.slice(-2).map(c => c.sql), ['COMMIT', 'RELEASE']);
});

test('email failure keeps Zoom registration and retries email without re-registering the student', async () => {
  const { pool, calls } = database({ ...job, status: 'registered', registrant_id: 'r1', join_url: 'https://zoom.us/private' });
  await processZoomJobs(pool, { configured: () => true, addRegistrant: async () => { assert.fail('Should reuse existing Zoom registration'); } }, 1,
    async () => { throw new Error('SMTP unavailable'); });
  assert.ok(calls.some(c => c.values?.[1]?.includes('Invitation email failed')));
  assert.ok(!calls.some(c => c.sql.includes("invitation_status = 'sent'")));
});
test('admin resend reuses the personal link and records sent status only after email acceptance', async () => {
  const { pool, calls } = database({ ...job, status: 'registered', registrant_id: 'r1', join_url: 'https://zoom.us/private' });
  await processZoomJobs(pool, { configured: () => true, addRegistrant: async () => { assert.fail('Unexpected Zoom registration'); } }, 1,
    async (student, link) => { assert.equal(student.email, job.email); assert.equal(link, 'https://zoom.us/private'); return 'email-123'; }, 42);
  assert.ok(calls.some(c => c.sql.includes("invitation_status = 'sent'") && c.values[1] === 'email-123'));
  assert.deepEqual(calls.find(c => c.sql.includes('SELECT j.*')).values, [42]);
});
