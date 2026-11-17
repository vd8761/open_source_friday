const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPitchAlert } = require('../admin-alerts');

const pitch = { link: 'https://www.linkedin.com/in/asha/?a=1&b=2', mobile_number: '+919876543210', preferred_call_time: '5 PM–8 PM', name: 'Asha <b>', email: 'asha@example.com', role_company: 'SRE', title: 'On-call', domain_label: 'Cloud Computing', abstract: 'Notes', preferred_fridays: ['2026-11-13'] };
const fakeSender = (calls, reply = { success: true }) => async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => reply }; };
const env = { SENDER_API_TOKEN: 't', PITCH_ALERT_EMAIL: 'team@example.com, other@example.com', PUBLIC_APP_URL: 'https://osf.example', TEST_EMAIL_ALLOWLIST: 'team@example.com' };

test('production alerts every PITCH_ALERT_EMAIL recipient through Sender, escaping pitch text', async () => {
  const calls = [];
  assert.equal(await createPitchAlert({ env, flags: { production: true }, fetchImpl: fakeSender(calls) })(pitch), 2);
  assert.deepEqual(calls.map(c => c.body.to.email), ['team@example.com', 'other@example.com']);
  assert.equal(calls[0].url, 'https://api.sender.net/v2/message/send');
  assert.equal(calls[0].body.subject, 'New speaker pitch: On-call');
  assert.match(calls[0].body.html, /Asha &lt;b&gt;/);
  assert.ok(calls[0].body.html.includes('<a href="https://www.linkedin.com/in/asha/?a=1&amp;b=2">'));
  assert.ok(calls[0].body.text.includes(`LinkedIn profile: ${pitch.link}`));
  assert.ok(calls[0].body.text.includes('Mobile number: +919876543210'));
  assert.ok(calls[0].body.html.includes('Preferred callback time (IST)'));
  assert.ok(calls[0].body.text.includes('5 PM–8 PM'));
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


test('older pitches explicitly report missing contact details and never render unsafe links', async () => {
  const calls = [];
  const alert = createPitchAlert({ env, flags: { production: false }, fetchImpl: fakeSender(calls) });
  await alert({ ...pitch, link: null, mobile_number: null, preferred_call_time: null });
  assert.ok(calls[0].body.text.includes('LinkedIn profile: Not provided'));
  assert.ok(calls[0].body.text.includes('Mobile number: Not provided'));
  await alert({ ...pitch, link: 'javascript:alert(1)' });
  assert.ok(!calls[1].body.html.includes('href="javascript:'));
});


test('speaker acknowledgement is escaped, branded and includes the club logo and social links', () => {
  const {speakerThankYou}=require('../speaker-thank-you');
  const draft=speakerThankYou({...pitch,speaker_role:'Engineer',company:'Studio'});
  assert.ok(draft.html.includes('https://osf.descienceosclub.com/dos_logo.png'));
  assert.match(draft.html,/Asha &lt;b&gt;/);assert.ok(!draft.html.includes('Asha <b>'));
  assert.ok(draft.html.includes('https://www.linkedin.com/company/descience-open-source-club/'));
  assert.ok(draft.html.includes('https://www.youtube.com/channel/UCvF5jATxekeLcFvjLrMGjpA'));
  assert.match(draft.text,/A session date is confirmed only after we speak with you/);
  assert.ok(draft.html.includes('5 PM–8 PM IST'));assert.ok(draft.text.includes('https://github.com/descienceosclub'));
});
