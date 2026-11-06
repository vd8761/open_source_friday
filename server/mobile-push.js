const express = require('express');

// The OSF Android app: Firebase Cloud Messaging for admin and new-episode pushes, and Firebase App Check so the
// app can call the reCAPTCHA-protected student endpoints. Both need FIREBASE_SERVICE_ACCOUNT (the service-account
// JSON, raw or base64). Without it the app's devices are simply not sent to and App Check tokens are refused.

let firebaseApp;
function firebase(env = process.env) {
  if (firebaseApp !== undefined) return firebaseApp;
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return (firebaseApp = null);
  try {
    const admin = require('firebase-admin');
    const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    firebaseApp = admin.initializeApp({ credential: admin.credential.cert(json) }, 'osf-mobile');
  } catch (e) {
    console.error('[Firebase] FIREBASE_SERVICE_ACCOUNT is not a valid service account:', e.message);
    firebaseApp = null;
  }
  return firebaseApp;
}

// True when the request carries a valid App Check token from the OSF app.
async function verifyAppCheck(token, app = firebase()) {
  if (!app || typeof token !== 'string' || !token) return false;
  try {
    await require('firebase-admin').appCheck(app).verifyToken(token);
    return true;
  } catch { return false; }
}

// Public endpoints for the app. A device only registers with a valid App Check token, so the table holds real installs.
function createMobilePushRouter({ pool, verifyAppCheck: verify = verifyAppCheck, limiter }) {
  const router = express.Router();
  const route = fn => async (req, res) => {
    try { res.json({ success: true, ...await fn(req) }); }
    catch (e) { res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'Unable to complete this request.' }); }
  };
  const fail = (message, status) => Object.assign(new Error(message), { status });
  const tokenOf = body => {
    const token = body?.token;
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw fail('A device token is required.', 400);
    return token;
  };
  const middleware = limiter ? [limiter] : [];

  router.post('/push/devices', ...middleware, route(async req => {
    if (!await verify(req.get('X-Firebase-AppCheck'))) throw fail('This request must come from the OSF app.', 401);
    const platform = req.body?.platform === 'ios' ? 'ios' : 'android';
    await pool.query(`INSERT INTO mobile_devices (token, platform) VALUES ($1, $2)
      ON CONFLICT (token) DO UPDATE SET platform = EXCLUDED.platform, last_seen_at = NOW()`, [tokenOf(req.body), platform]);
    return {};
  }));

  // Turning notifications off in the app removes the device. Knowing the token is enough proof here.
  router.post('/push/devices/remove', ...middleware, route(async req => {
    await pool.query('DELETE FROM mobile_devices WHERE token = $1', [tokenOf(req.body)]);
    return {};
  }));

  return router;
}

// Firebase error codes meaning the token will never work again.
const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

// The FCM message for a web-push payload ({ title, body, url, tag }). The app opens `url` (a site path) when tapped.
function fcmMessage(payload) {
  return {
    notification: { title: String(payload.title), body: String(payload.body) },
    data: { url: String(payload.url || '/'), ...(payload.tag ? { tag: String(payload.tag) } : {}) },
    android: {
      priority: 'high',
      notification: { channelId: 'announcements', icon: 'ic_notification', color: '#2F8A36', ...(payload.tag ? { tag: String(payload.tag) } : {}) },
    },
  };
}

// Sends to every registered device (or, outside production, only those allowed). Returns how many were sent.
async function sendToMobileDevices({ pool, payload, messaging, allowed = () => true }) {
  if (!messaging) return 0;
  const rows = (await pool.query('SELECT id, token FROM mobile_devices')).rows.filter(allowed);
  const message = fcmMessage(payload);
  const dead = [];
  let sent = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const result = await messaging.sendEachForMulticast({ ...message, tokens: batch.map(r => r.token) });
    result.responses.forEach((r, j) => {
      if (r.success) sent++;
      else if (DEAD.has(r.error?.code)) dead.push(batch[j].token);
      else console.error('[Push] FCM send error:', r.error?.code || r.error?.message);
    });
  }
  if (dead.length) await pool.query('DELETE FROM mobile_devices WHERE token = ANY($1)', [dead]);
  return sent;
}

function messagingFor(app = firebase()) {
  return app ? require('firebase-admin').messaging(app) : null;
}

module.exports = { firebase, verifyAppCheck, createMobilePushRouter, sendToMobileDevices, fcmMessage, messagingFor };
