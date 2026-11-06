const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPitchAlert } = require('../admin-alerts');

const pitch = { name: 'Asha <b>', email: 'asha@example.com', role_company: 'SRE', title: 'On-call', domain_label: 'Cloud Computing', abstract: 'Notes', preferred_fridays: ['2026-11-13'] };
const fakeSender = (calls, reply = { success: true }) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => reply }; };
const env = { SENDER_API_TOKEN: 't', PITCH_ALERT_EMAIL: 'team@example.com, other@example.com', PUBLIC_APP_URL: 'https://osf.example', TEST_EMAIL_ALLOWLIST: 'team@example.com' };

test('production alerts every PITCH_ALERT_EMAIL recipient through Sender, escaping pitch text', async () => {
  const calls = [];
  assert.equal(await createPitchAlert({ env, flags: { production: true }, fetchImpl: fakeSender(calls) })(pitch), 2);
  assert.deepEqual(calls.map(c => c.body.to.email), ['team@example.com', 'other@example.com']);
  assert.equal(calls[0].url, 'https://api.sender.net/v2/message/send');
  assert.equal(calls[0].body.subject, 'New speaker pitch: On-call');
  assert.match(calls[0].body.html, /Asha &lt;b&gt;/);
  assert.match(calls[0].body.text, /https:\/\/osf\.example\/admin\/speaker-applications/);
});

test('outside production only allowlisted recipients get alerts; no recipients or token means no send', async () => {
  const calls = [];
  assert.equal(await createPitchAlert({ env, flags: { production: false }, fetchImpl: fakeSender(calls) })(pitch), 1);
  assert.deepEqual(calls.map(c => c.body.to.email), ['team@example.com']);
  assert.equal(await createPitchAlert({ env: { ...env, PITCH_ALERT_EMAIL: '' }, flags: { production: true }, fetchImpl: fakeSender(calls) })(pitch), 0);
  assert.equal(await createPitchAlert({ env: { ...env, SENDER_API_TOKEN: '' }, flags: { production: true }, fetchImpl: fakeSender(calls) })(pitch), 0);
  assert.equal(calls.length, 1);
});

test('a Sender rejection is logged, not thrown', async () => {
  const calls = [];
  assert.equal(await createPitchAlert({ env, flags: { production: true }, fetchImpl: fakeSender(calls, { success: false }) })(pitch), 0);
});
