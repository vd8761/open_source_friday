const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createZoomClient, meetingId } = require('../zoom');
const env = { ZOOM_ACCOUNT_ID: 'account', ZOOM_CLIENT_ID: 'client', ZOOM_CLIENT_SECRET: 'secret' };
const reply = (body, status = 200, headers = {}) => ({ headers: { get: key => headers[key] ?? null }, ok: status >= 200 && status < 300, status, json: async () => body });
function setup(responses, options = {}) {
  const calls = [];
  const zoom = createZoomClient({ env, ...options, fetchImpl: async (url, init) => {
    calls.push({ url, ...init });
    assert.ok(responses.length, `Unexpected request ${url}`);
    return responses.shift();
  } });
  return { zoom, calls };
}
const token = () => reply({ access_token: 'token', expires_in: 3600 });
const validMeeting = { type: 2, settings: { approval_type: 0, registrants_email_notification: true, registrants_confirmation_email: true } };
test('meeting IDs stay strings and reject URLs, invalid digits and numbers', () => {
  assert.equal(meetingId(' 12345678901 '), '12345678901');
  assert.equal(meetingId(''), null);
  for (const invalid of [12345678901, 'https://zoom.us/j/12345678901', '123', '../12345678901']) assert.throws(() => meetingId(invalid));
});
test('credentials are required without making network requests', async () => {
  const { zoom, calls } = setup([], { env: {} });
  await assert.rejects(zoom.validateMeeting('12345678901'), /credentials/);
  assert.equal(calls.length, 0);
});
test('OAuth uses account credentials; token is reused; registration targets the linked meeting', async () => {
  const { zoom, calls } = setup([token(), reply(validMeeting), reply({ registrants: [] }), reply({ registrant_id: 'r1', join_url: 'https://zoom.us/personal' })]);
  await zoom.validateMeeting('12345678901');
  assert.deepEqual(await zoom.addRegistrant('12345678901', { full_name: '  Ada van Rossum ', email: 'ada@example.com' }), { registrantId: 'r1', joinUrl: 'https://zoom.us/personal' });
  assert.equal(calls[0].body.get('grant_type'), 'account_credentials');
  assert.equal(calls[0].body.get('account_id'), 'account');
  assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from('client:secret').toString('base64')}`);
  assert.equal(calls.filter(c => c.url.includes('/oauth/token')).length, 1);
  assert.equal(calls[3].url, 'https://api.zoom.us/v2/meetings/12345678901/registrants');
  assert.deepEqual(JSON.parse(calls[3].body), { first_name: 'Ada', last_name: 'van Rossum', email: 'ada@example.com', auto_approve: true });
});
test('expired/rejected token is refreshed once', async () => {
  const { zoom, calls } = setup([token(), reply({}, 401), token(), reply(validMeeting)]);
  await zoom.validateMeeting('12345678901');
  assert.equal(calls.length, 4);
});
test('authentication errors do not expose credentials or provider response data', async () => {
  const { zoom } = setup([reply({ error: 'sensitive data' }, 400)]);
  await assert.rejects(zoom.validateMeeting('12345678901'), error => /authentication failed/.test(error.message) && !error.message.includes('sensitive'));
});
test('rejects manual approval, disabled registration and recurring meetings', async () => {
  for (const data of [{ ...validMeeting, type: 8 }, { ...validMeeting, settings: { approval_type: 1 } }, { ...validMeeting, settings: { approval_type: 2 } }]) {
    const { zoom } = setup([token(), reply(data)]);
    await assert.rejects(zoom.validateMeeting('12345678901'));
  }
});
test('reconciles an existing registration across paginated results without a duplicate POST', async () => {
  const { zoom, calls } = setup([token(), reply({ registrants: [], next_page_token: 'next' }), reply({ registrants: [{ id: 'existing', email: 'ADA@example.com', join_url: 'https://zoom.us/existing' }] })]);
  assert.equal((await zoom.addRegistrant('12345678901', { email: 'ada@example.com', full_name: 'Ada' })).registrantId, 'existing');
  assert.ok(calls[2].url.includes('next_page_token=next'));
  assert.equal(calls.filter(c => c.method === 'POST').length, 1); // OAuth only
});
test('Zoom outages and incomplete responses are failures for the outbox to retry', async () => {
  for (const response of [reply({}, 429), reply({}, 500), reply({ registrant_id: 'r1' })]) {
    const { zoom } = setup([token(), reply({ registrants: [] }), response]);
    await assert.rejects(zoom.addRegistrant('12345678901', { email: 'ada@example.com', full_name: 'Ada' }));
  }
});
test('concurrent requests share one token exchange', async () => {
  const { zoom, calls } = setup([token(), reply(validMeeting), reply(validMeeting)]);
  await Promise.all([zoom.validateMeeting('12345678901'), zoom.validateMeeting('12345678901')]);
  assert.equal(calls.filter(c => c.url.includes('/oauth/token')).length, 1);
});

test('single-word names omit empty Last Name without inventing one', async () => {
  const { zoom, calls } = setup([token(), reply({ registrants: [] }), reply({ registrant_id: 'r1', join_url: 'https://zoom.us/personal' })]);
  await zoom.addRegistrant('12345678901', { email: 'test@example.com', full_name: 'Mohan' });
  const body = JSON.parse(calls.at(-1).body);
  assert.equal(body.first_name, 'Mohan');
  assert.equal(Object.hasOwn(body, 'last_name'), false);
});
test('required Last Name error gives actionable guidance without echoing provider data', async () => {
  const { zoom } = setup([token(), reply({ registrants: [] }), reply({ code: 300, message: 'The parameter is required: last_name. private@example.com' }, 400)]);
  await assert.rejects(zoom.addRegistrant('12345678901', { email: 'test@example.com', full_name: 'Mohan' }), error => {
    assert.match(error.message, /requires Last Name/);
    assert.match(error.message, /Registration > Questions/);
    assert.ok(!error.message.includes('private@example.com'));
    return true;
  });
});
test('linked meetings must enable Zoom-managed confirmation emails', async () => {
  for (const settings of [
    { ...validMeeting.settings, registrants_confirmation_email: false },
    { ...validMeeting.settings, registrants_email_notification: false },
  ]) {
    const { zoom } = setup([token(), reply({ ...validMeeting, settings })]);
    await assert.rejects(zoom.validateMeeting('12345678901'), /Enable Zoom confirmation emails/);
  }
});

test('rate limits respect Retry-After seconds and dates without exposing provider data', async () => {
  const now = Date.parse('2026-10-26T10:00:00Z');
  for (const [header, expected] of [['120', 120], ['Mon, 26 Oct 2026 10:05:00 GMT', 300], ['2026-10-26T10:05:00Z', 300], ['invalid', 60], [null, 60]]) {
    const { zoom } = setup([token(), reply({ code: 429, message: 'private@example.com' }, 429, { 'retry-after': header })], { now: () => now });
    await assert.rejects(zoom.validateMeeting('12345678901'), error => {
      assert.equal(error.status, 429);
      assert.equal(error.retryAfterSeconds, expected);
      assert.ok(!error.message.includes('private@example.com'));
      return true;
    });
  }
});
test('daily registration limits without a reset header wait a full day', async () => {
  const { zoom } = setup([token(), reply({ registrants: [] }), reply({ code: 429, message: 'You have exceeded the daily rate limit of (3) for private@example.com' }, 429)]);
  await assert.rejects(zoom.addRegistrant('12345678901', { email: 'test@example.com', full_name: 'Test' }), error => {
    assert.equal(error.retryAfterSeconds, 86400);
    assert.match(error.message, /daily registration limit/);
    assert.ok(!error.message.includes('private@example.com'));
    return true;
  });
});
test('OAuth throttling also respects the cooldown', async () => {
  const { zoom } = setup([reply({}, 429, { 'retry-after': '180' })]);
  await assert.rejects(zoom.validateMeeting('12345678901'), error => error.status === 429 && error.retryAfterSeconds === 180);
});

test('attendance uses the meeting instance, requests registrant IDs and reads every page', async () => {
  const { zoom, calls } = setup([token(),reply({id:12345678901,uuid:'/instance//',start_time:'2026-10-26T13:30:00Z'}),
    reply({participants:[{registrant_id:'r1',duration:1200}],next_page_token:'next'}),reply({participants:[{registrant_id:'r2',duration:1800}]})]);
  const result=await zoom.attendance('12345678901','/instance//');
  assert.equal(result.participants.length,2);
  assert.ok(calls[1].url.includes('%252Finstance%252F%252F'));
  assert.ok(calls[2].url.includes('include_fields=registrant_id'));
  assert.ok(calls[3].url.includes('next_page_token=next'));
});
test('attendance rejects mismatched meetings and reports still processing', async () => {
  let client=setup([token(),reply({id:12345678902,uuid:'wrong'})]);
  await assert.rejects(client.zoom.attendance('12345678901'),/does not match/);
  client=setup([token(),reply({id:12345678901,uuid:'instance'}),reply({participants:[{duration:0}]})]);
  await assert.rejects(client.zoom.attendance('12345678901'),error=>error.status===202&&/processing/.test(error.message));
});
