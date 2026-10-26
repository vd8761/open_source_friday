const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendZoomInvitation } = require('../zoom-invitation');
const job = { email: 'ada@example.com', full_name: 'Ada', episode_number: 5, title: 'Open Source', event_date: '2026-12-01', event_time: '5:00 PM' };
test('invitation uses the stored personal Zoom link and returns email message ID', async () => {
  const id = await sendZoomInvitation({ sendMail: async mail => {
    assert.equal(mail.to, job.email);
    assert.ok(mail.text.includes('https://zoom.us/personal'));
    assert.ok(mail.subject.includes('Zoom Invitation'));
    return { accepted: [job.email], messageId: 'm1' };
  } }, job, 'https://zoom.us/personal');
  assert.equal(id, 'm1');
});
test('SMTP rejection or failure cannot be recorded as a sent invitation', async () => {
  for (const transport of [{ sendMail: async () => ({ accepted: [], rejected: [job.email] }) }, { sendMail: async () => { throw new Error('SMTP down'); } }]) {
    await assert.rejects(sendZoomInvitation(transport, job, 'https://zoom.us/personal'));
  }
});
test('rejects unsafe or non-Zoom invitation URLs before sending', async () => {
  for (const url of ['http://zoom.us/join', 'https://zoom.us.example.com/join', 'javascript:alert(1)']) {
    await assert.rejects(sendZoomInvitation({ sendMail: async () => assert.fail('Must not send') }, job, url));
  }
});
