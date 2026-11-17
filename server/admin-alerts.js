const { dryRun } = require('./runtime-flags');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const list = value => String(value || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);

// Emails the OSF team when a speaker pitch arrives. Recipients come from PITCH_ALERT_EMAIL (comma-separated).
// Outside production only addresses on TEST_EMAIL_ALLOWLIST receive it. A failed alert never fails the pitch.
function createPitchAlert({ env = process.env, flags, fetchImpl = fetch }) {
  return async function alertPitch(pitch) {
    const allow = list(env.TEST_EMAIL_ALLOWLIST || env.ZOOM_TEST_ALLOWLIST);
    const to = list(env.PITCH_ALERT_EMAIL).filter(email => flags.production || allow.includes(email));
    if (!to.length || !env.SENDER_API_TOKEN) { dryRun('Pitch alert', 'speaker pitch alert not sent'); return 0; }
    const admin = env.PUBLIC_APP_URL ? new URL(pitch.id ? `/admin/speaker-applications/${pitch.id}` : '/admin/speaker-applications', env.PUBLIC_APP_URL).toString() : null;
    const rows = [['Name', pitch.name], ['Email', pitch.email], ...(pitch.speaker_role || pitch.company ? [['Role', pitch.speaker_role], ['Company', pitch.company]] : [['Role & company (legacy)', pitch.role_company]]), ['LinkedIn profile', pitch.link || 'Not provided'], ['Mobile number', pitch.mobile_number || 'Not provided'],
      ['Preferred callback time (IST)', pitch.preferred_call_time || 'Not provided'],
      ['Domain', pitch.domain_label], ['Preferred Fridays', (pitch.preferred_fridays || []).join(', ')]].filter(([, v]) => v);
    const text = [`New speaker pitch: ${pitch.title}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', pitch.abstract, '', admin ? `Review it: ${admin}` : ''].join('\n');
    const html = `<p><strong>New speaker pitch:</strong> ${escapeHtml(pitch.title)}</p>`
      + `<table cellpadding="4">${rows.map(([k, v]) => `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${k === 'LinkedIn profile' && /^https:\/\/(www\.)?linkedin\.com\/in\/[^\s]+$/.test(v) ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v)}</td></tr>`).join('')}</table>`
      + `<p style="white-space:pre-wrap">${escapeHtml(pitch.abstract)}</p>`
      + (admin ? `<p><a href="${escapeHtml(admin)}">Open speaker pitches in the admin</a></p>` : '');
    let sent = 0;
    for (const email of to) {
      try {
        const res = await fetchImpl('https://api.sender.net/v2/message/send', {
          method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${env.SENDER_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            from: { email: env.SENDER_FROM_EMAIL || 'info@descienceosclub.com', name: env.SENDER_FROM_NAME || 'Descience Open Source Club' },
            to: { email }, subject: `New speaker pitch: ${pitch.title}`.slice(0, 200), text, html,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) throw new Error(`HTTP ${res.status}`);
        sent++;
      } catch (e) { console.error(`[Pitch alert] Sender did not accept the alert (${e.message}).`); }
    }
    if (sent) console.log(`[Pitch alert] sent to ${sent} recipient(s)`);
    return sent;
  };
}

module.exports = { createPitchAlert };
