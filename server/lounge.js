const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { InputError } = require('./outreach-csv');
const { studentActivities } = require('./student-activity');
const { dryRun } = require('./runtime-flags');

// Attendee lounge for past episodes. Eligibility is checked first: only students marked present for that
// episode are emailed a 6-digit code; everyone else is told why on the page and receives no email.
// An unlock covers one episode only. Materials are links only.
const CODE_MINUTES = 10, MAX_ATTEMPTS = 5, SESSION_DAYS = 14;
const normEmail = v => String(v || '').trim().toLowerCase();
// Lounge sessions are signed with a key derived from JWT_SECRET, so they can never pass as an admin token.
const loungeKey = secret => crypto.createHmac('sha256', String(secret || '')).update('osf-lounge-session-v1').digest();
const codeHash = (secret, studentId, episode, code) => crypto.createHmac('sha256', loungeKey(secret)).update(`${studentId}:${episode}:${code}`).digest('hex');
const episodeNumber = v => { const n = Number(String(v ?? '').replace(/^episode-/, '')); if (!Number.isInteger(n) || n < 1) throw new InputError('Episode not found.', 404); return n; };

// Messages never mention the attendance threshold.
const DENIED = {
  partial: n => `Thanks for joining Episode ${n} live. The lounge opens for members who stay with the session to the end, so stay till the wrap-up next time to unlock it.`,
  absent: n => `This lounge is for members who joined Episode ${n} live. Catch the next Friday live to unlock its lounge.`,
  not_registered: n => `This lounge is for members who joined Episode ${n} live. Reserve your seat for the next Friday to unlock its lounge.`,
  not_synced: n => `Attendance for Episode ${n} is still being confirmed. Please check back in a day or two.`,
};

const httpsUrl = (v, label) => {
  const s = String(v || '').trim();
  if (!s) return null;
  if (!/^https:\/\/[^\s]+$/.test(s) || s.length > 500) throw new InputError(`${label} must be an https:// link.`, 400);
  return s;
};

// Single transactional email through Sender.net. Outside production only allowlisted addresses receive mail.
function createCodeMailer({ env = process.env, flags, fetchImpl = fetch }) {
  const allow = String(env.TEST_EMAIL_ALLOWLIST || env.ZOOM_TEST_ALLOWLIST || '').split(',').map(normEmail).filter(Boolean);
  const enabled = env.ENABLE_EMAIL_CODES == null || env.ENABLE_EMAIL_CODES === '' ? flags.production : env.ENABLE_EMAIL_CODES === 'true';
  return async function sendCode(email, name, code, episode) {
    if (!enabled || (!flags.production && !allow.includes(normEmail(email)))) { dryRun('Lounge', 'unlock code email not sent'); return false; }
    if (!env.SENDER_API_TOKEN) throw new Error('SENDER_API_TOKEN is not configured.');
    const res = await fetchImpl('https://api.sender.net/v2/message/send', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.SENDER_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        from: { email: env.SENDER_FROM_EMAIL || 'info@descienceosclub.com', name: env.SENDER_FROM_NAME || 'Descience Open Source Club' },
        to: { email, name: name || undefined },
        subject: `${code} is your code for the Episode ${episode} lounge`,
        text: `Your code to unlock the Open Source Fridays Episode ${episode} lounge is ${code}. It expires in ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
        html: `<p>Your code to unlock the Open Source Fridays <strong>Episode ${episode}</strong> lounge:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this email.</p>`,
      }),
    });
    // Sender can answer 200 with success:false; treat that as a failure too. Log its message id (no address) for tracing.
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) throw new Error(`Sender did not accept the code email (HTTP ${res.status}).`);
    console.log(`[Lounge] code email accepted by Sender (episode ${episode}, message ${body.emailId || 'unknown'})`);
    return true;
  };
}

function createLoungeRouter({ pool, secret, verifyRecaptcha, sendCode, limiter, now = Date.now }) {
  const router = express.Router();
  const route = fn => async (req, res) => {
    try { res.json({ success: true, ...await fn(req) }); }
    catch (e) {
      if (!(e instanceof InputError)) console.error('[Lounge]', e.message);
      res.status(e instanceof InputError ? e.status : 500).json({ success: false, error: e instanceof InputError ? e.message : 'Something went wrong. Please try again.' });
    }
  };
  const session = req => {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    try { return jwt.verify(token, loungeKey(secret), { audience: 'osf-lounge' }); }
    catch { throw new InputError('Please unlock the lounge again.', 401); }
  };

  // Attendance status for one student and episode: present, partial, absent, not_synced or not_registered.
  async function attendance(studentId, episodeId) {
    const activity = (await studentActivities(pool, [studentId])).get(studentId);
    const event = activity?.events.find(e => e.episode_id === episodeId);
    return event ? event.attendance_status : 'not_registered';
  }

  router.post('/lounge/request-code', limiter, route(async req => {
    if (!await verifyRecaptcha(req.body?.recaptcha_token, 'lounge_code')) throw new InputError('Security check failed. Please refresh the page and try again.', 400);
    const email = normEmail(req.body?.email), episode = episodeNumber(req.body?.episode);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new InputError('Enter a valid email address.', 400);
    const ep = (await pool.query('SELECT id FROM episodes WHERE episode_number=$1', [episode])).rows[0];
    if (!ep) throw new InputError('Episode not found.', 404);
    const student = (await pool.query('SELECT id,full_name,email FROM students WHERE LOWER(BTRIM(email))=$1 ORDER BY id LIMIT 1', [email])).rows[0];
    // Owner's choice: tell ineligible visitors why right here, and email codes only to eligible attendees.
    const status = student ? await attendance(student.id, ep.id) : 'not_registered';
    if (status !== 'present') return { sent: false, reason: status, message: (DENIED[status] || DENIED.absent)(episode) };
    const recent = (await pool.query("SELECT COUNT(*)::int n FROM lounge_codes WHERE student_id=$1 AND created_at > NOW() - INTERVAL '15 minutes'", [student.id])).rows[0].n;
    if (recent >= 3) throw new InputError('We already sent you a few codes. Check your inbox, or try again in 15 minutes.', 429);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await pool.query(`INSERT INTO lounge_codes(student_id,episode_number,code_hash,expires_at) VALUES($1,$2,$3,NOW() + INTERVAL '${CODE_MINUTES} minutes')`, [student.id, episode, codeHash(secret, student.id, episode, code)]);
    await sendCode(student.email.trim(), student.full_name, code, episode);
    return { sent: true, message: `A 6-digit code for the Episode ${episode} lounge is on its way to ${email}. It expires in ${CODE_MINUTES} minutes.` };
  }));

  router.post('/lounge/verify', limiter, route(async req => {
    const email = normEmail(req.body?.email), code = String(req.body?.code || '').trim(), episode = episodeNumber(req.body?.episode);
    const wrong = new InputError('That code is not right or has expired. Request a new one.', 400);
    if (!/^\d{6}$/.test(code)) throw wrong;
    const student = (await pool.query('SELECT id,full_name FROM students WHERE LOWER(BTRIM(email))=$1 ORDER BY id LIMIT 1', [email])).rows[0];
    if (!student) throw wrong;
    const row = (await pool.query('SELECT * FROM lounge_codes WHERE student_id=$1 AND episode_number=$2 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [student.id, episode])).rows[0];
    if (!row || row.attempts >= MAX_ATTEMPTS) throw wrong;
    const expected = Buffer.from(row.code_hash, 'hex'), given = Buffer.from(codeHash(secret, student.id, episode, code), 'hex');
    if (!crypto.timingSafeEqual(expected, given)) { await pool.query('UPDATE lounge_codes SET attempts=attempts+1 WHERE id=$1', [row.id]); throw wrong; }
    await pool.query('UPDATE lounge_codes SET used_at=NOW() WHERE id=$1', [row.id]);
    const token = jwt.sign({ sid: student.id, ep: episode }, loungeKey(secret), { audience: 'osf-lounge', expiresIn: `${SESSION_DAYS}d` });
    return { token, name: student.full_name, episode, expires_in_days: SESSION_DAYS };
  }));

  // Members-only part of one episode, for the student in the session.
  router.get('/lounge/episodes/:n', route(async req => {
    const { sid, ep: unlocked } = session(req);
    const n = episodeNumber(req.params.n);
    // A session opens only the episode it was unlocked for.
    if (unlocked !== n) throw new InputError(`Unlock the Episode ${n} lounge with a code to continue.`, 401);
    const ep = (await pool.query('SELECT id,episode_number,lounge_notes,recording_url,materials FROM episodes WHERE episode_number=$1', [n])).rows[0];
    if (!ep) throw new InputError('Episode not found.', 404);
    const status = await attendance(sid, ep.id);
    if (status !== 'present') return { access: 'denied', reason: status, message: (DENIED[status] || DENIED.absent)(n) };
    return { access: 'granted', notes: ep.lounge_notes || null, recording_url: ep.recording_url || null, materials: ep.materials || [] };
  }));
  return router;
}

// Admin editing of the recap and lounge content.
function registerLoungeAdminRoutes(router, { pool, route }) {
  router.get('/episodes/:id/lounge', route(async req => {
    const row = (await pool.query('SELECT recap,lounge_notes,recording_url,materials FROM episodes WHERE id=$1', [Number(req.params.id)])).rows[0];
    if (!row) throw new InputError('Episode not found.', 404);
    return { lounge: { recap: row.recap || '', lounge_notes: row.lounge_notes || '', recording_url: row.recording_url || '', materials: row.materials || [] } };
  }));
  router.put('/episodes/:id/lounge', route(async req => {
    const b = req.body || {};
    const text = (v, label, max) => { const s = String(v ?? '').trim(); if (s.length > max) throw new InputError(`${label} must be ${max} characters or fewer.`, 400); return s || null; };
    const materials = Array.isArray(b.materials) ? b.materials : [];
    if (materials.length > 20) throw new InputError('Add up to 20 materials.', 400);
    const cleanMaterials = materials.filter(m => m && (String(m.title || '').trim() || String(m.url || '').trim())).map((m, i) => {
      const title = text(m.title, `Material ${i + 1} title`, 120);
      if (!title) throw new InputError(`Material ${i + 1} needs a title.`, 400);
      return { title, url: httpsUrl(m.url, `Material ${i + 1} link`) || (() => { throw new InputError(`Material ${i + 1} needs a link.`, 400); })() };
    });
    const { rows } = await pool.query('UPDATE episodes SET recap=$2,lounge_notes=$3,recording_url=$4,materials=$5::jsonb WHERE id=$1 RETURNING id',
      [Number(req.params.id), text(b.recap, 'Recap', 4000), text(b.lounge_notes, 'Lounge notes', 20000), httpsUrl(b.recording_url, 'Recording link'), JSON.stringify(cleanMaterials)]);
    if (!rows.length) throw new InputError('Episode not found.', 404);
    return { id: rows[0].id };
  }));
}

module.exports = { createLoungeRouter, createCodeMailer, registerLoungeAdminRoutes, loungeKey, DENIED, SESSION_DAYS };
