const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
require('dotenv').config();
const { createZoomClient, meetingId, ZoomError } = require('./zoom');
const { enqueueZoomRegistrations, processZoomJobs } = require('./zoom-jobs');
const zoom = createZoomClient();
const { sendZoomInvitation } = require('./zoom-invitation');
const deliverZoomInvitation = (job, link) => sendZoomInvitation(transporter, job, link);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.sender.net',
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
  port: process.env.SMTP_PORT || 465,
  secure: Number(process.env.SMTP_PORT || 465) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ─── VAPID Setup ──────────────────────────────────────────────────────────────
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ─── Initialize Database ──────────────────────────────────────────────────────
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      )
    `);

    // Push subscriptions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Ensure column exists for welcome tracking
    await pool.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS welcome_sent BOOLEAN DEFAULT FALSE`);

    // Push notification history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_notification_history (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        url TEXT,
        type VARCHAR(50) NOT NULL,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Ensure columns exist on episodes
    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cover_photo_url TEXT`);
    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS event_mode VARCHAR(50) DEFAULT 'Online'`);
    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_registration_open BOOLEAN DEFAULT TRUE`);

    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS zoom_meeting_id VARCHAR(11)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS zoom_registration_jobs (
      registration_id INTEGER PRIMARY KEY REFERENCES episode_registrations(id) ON DELETE CASCADE,
      meeting_id VARCHAR(11) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'registered')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      registrant_id TEXT, join_url TEXT, last_error TEXT
    )`);

    await pool.query(`ALTER TABLE zoom_registration_jobs
      ADD COLUMN IF NOT EXISTS invitation_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS invitation_message_id TEXT`);

    // Seed initial admin
    const result = await pool.query('SELECT COUNT(*) FROM admins');
    if (parseInt(result.rows[0].count) === 0) {
      console.log('Seeding initial admin from .env...');
      const defaultUser = process.env.ADMIN_USERNAME || 'admin';
      const defaultPass = process.env.ADMIN_PASSWORD || 'password123';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(defaultPass, salt);
      await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [defaultUser, hash]);
      console.log('Initial admin seeded.');
    }
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}
let zoomWorkerRunning = false;
async function runZoomWorker() {
  if (zoomWorkerRunning) return;
  zoomWorkerRunning = true;
  try { await processZoomJobs(pool, zoom, 10, deliverZoomInvitation); }
  catch { console.error('[Zoom] Worker failed; will retry next minute.'); }
  finally { zoomWorkerRunning = false; }
}


// ─── Push Helper: send to all subscribers ────────────────────────────────────
async function sendPushToAll(payload, type = 'Automated') {
  let rows = [];
  try {
    const result = await pool.query('SELECT * FROM push_subscriptions');
    rows = result.rows;
  } catch (err) {
    console.error('[Push] Failed to fetch subscriptions:', err);
    return;
  }

  const dead = [];
  await Promise.allSettled(
    rows.map(async (row) => {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err) {
        // 410 Gone = subscription expired / user unsubscribed
        if (err.statusCode === 410 || err.statusCode === 404) {
          dead.push(row.endpoint);
        } else {
          console.error('[Push] Send error:', err.message);
        }
      }
    })
  );

  // Clean up dead subscriptions
  if (dead.length > 0) {
    try {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ANY($1)', [dead]);
      console.log(`[Push] Removed ${dead.length} expired subscription(s)`);
    } catch (err) {
      console.error('[Push] Failed to clean up dead subscriptions:', err);
    }
  }

  // Record history
  try {
    await pool.query(
      'INSERT INTO push_notification_history (title, body, url, type) VALUES ($1, $2, $3, $4)',
      [payload.title, payload.body, payload.url || '/', type]
    );
  } catch (err) {
    console.error('[Push] Failed to record notification history:', err);
  }
}

// ─── Helper: parse event_date + event_time VARCHAR → JS Date ─────────────────
function parseEventDateTime(eventDate, eventTime) {
  try {
    const [year, month, day] = String(eventDate).split('T')[0].split('-').map(Number);
    let hours = 0, minutes = 0;
    const t12 = String(eventTime).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    const t24 = String(eventTime).match(/^(\d{1,2}):(\d{2})$/);
    if (t12) {
      hours = parseInt(t12[1], 10);
      minutes = parseInt(t12[2], 10);
      const p = t12[3].toUpperCase();
      if (p === 'PM' && hours !== 12) hours += 12;
      if (p === 'AM' && hours === 12) hours = 0;
    } else if (t24) {
      hours = parseInt(t24[1], 10);
      minutes = parseInt(t24[2], 10);
    } else {
      return null;
    }
    // Build as local time (assumes server timezone = IST or as configured)
    return new Date(year, month - 1, day, hours, minutes, 0);
  } catch {
    return null;
  }
}

// ─── Cron: runs every minute — checks 30-min reminders + starting-now alerts ──
async function sendEpisodeReminders() {
  try {
    const result = await pool.query(
      `SELECT * FROM episodes WHERE is_active = true`
    );
    const now = new Date();

    for (const episode of result.rows) {
      const eventDT = parseEventDateTime(episode.event_date, episode.event_time);
      if (!eventDT) continue;

      const minutesAway = (eventDT - now) / (1000 * 60);

      // ── 30-minute reminder (send once, window: 29–31 min before) ──
      if (!episode.reminder_sent && minutesAway >= 29 && minutesAway <= 31) {
        console.log(`[Cron] 30-min reminder → EP ${episode.episode_number}`);
        await sendPushToAll({
          title: '⏰ Starting in 30 Minutes!',
          body: `"${episode.title}" by ${episode.presenter_name} begins soon. Join now!`,
          icon: episode.cover_photo_url && episode.cover_photo_url.startsWith('http')
            ? episode.cover_photo_url : '/favicon.png',
          badge: '/favicon.png',
          url: `/register/episode-${episode.episode_number}`,
          tag: `reminder-30-ep-${episode.episode_number}`,
        });
        await pool.query(
          'UPDATE episodes SET reminder_sent = true WHERE id = $1',
          [episode.id]
        );
      }

      // ── Starting now (window: 0–2 min before or after) ────────────────────
      if (minutesAway >= -2 && minutesAway <= 2) {
        // Use a separate flag so we don't re-use reminder_sent
        // Check if we already sent a "starting now" push (tag dedup via SW)
        console.log(`[Cron] Starting-now alert → EP ${episode.episode_number}`);
        await sendPushToAll({
          title: '🚀 Episode Starting Now!',
          body: `"${episode.title}" by ${episode.presenter_name} is live! Open the app to join.`,
          icon: episode.cover_photo_url && episode.cover_photo_url.startsWith('http')
            ? episode.cover_photo_url : '/favicon.png',
          badge: '/favicon.png',
          url: `/register/episode-${episode.episode_number}`,
          tag: `live-ep-${episode.episode_number}`,
        });
      }
    }
  } catch (err) {
    console.error('[Cron] Reminder job error:', err);
  }
}


// ─── JWT Middleware ───────────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

// ─── Episode Number Helper ────────────────────────────────────────────────────
function getEpisodeNumber(timestampStr) {
  const date = new Date(timestampStr);
  const startTime = new Date('2026-07-17T23:59:59Z');
  if (date <= startTime) return 1;
  const diffTime = Math.abs(date - startTime);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.min(52, 1 + Math.ceil(diffDays / 7));
}

// ─── reCAPTCHA Verifier ───────────────────────────────────────────────────────
async function verifyRecaptchaToken(token) {
  if (!token) return false;
  try {
    const formData = new URLSearchParams();
    formData.append('secret', process.env.RECAPTCHA_SECRET_KEY);
    formData.append('response', token);
    const result = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: formData
    });
    const outcome = await result.json();
    return outcome.success && outcome.score >= 0.5;
  } catch (err) {
    console.error('reCAPTCHA verification error:', err);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC PUSH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Return VAPID public key (needed by frontend to subscribe)
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Save a push subscription
app.post('/api/push/subscribe', async (req, res) => {
  const { endpoint, keys, isExplicitInteraction } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ success: false, error: 'Invalid subscription object' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3
       RETURNING welcome_sent`,
      [endpoint, keys.p256dh, keys.auth]
    );

    if (isExplicitInteraction && result.rows[0] && !result.rows[0].welcome_sent) {
      try {
        const payload = {
          title: 'Welcome to Open Source Friday! 🎉',
          body: "You've successfully subscribed to our updates! We'll notify you when new open source activities and episodes go live. Stay tuned! 🚀",
          icon: '/favicon.png',
          badge: '/favicon.png',
          url: '/'
        };
        await webpush.sendNotification({ endpoint, keys }, JSON.stringify(payload));

        await pool.query('UPDATE push_subscriptions SET welcome_sent = TRUE WHERE endpoint = $1', [endpoint]);
      } catch (err) {
        console.error('[Push] Failed to send welcome notification:', err);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Subscribe DB error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Remove a push subscription
app.post('/api/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ success: false, error: 'Missing endpoint' });
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Unsubscribe DB error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (isMatch) {
      const token = jwt.sign({ username: admin.username, id: admin.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/change-password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const username = req.user.username;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(oldPassword, admin.password_hash);
    if (!isMatch) return res.status(401).json({ success: false, error: 'Incorrect current password' });
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    await pool.query('UPDATE admins SET password_hash = $1 WHERE username = $2', [newHash, username]);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/students/lookup', async (req, res) => {
  const { identifier, countryCode, episode_id } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, whatsapp_number, country_code FROM students WHERE email = $1 OR (whatsapp_number = $1 AND country_code = $2)',
      [identifier, countryCode]
    );
    if (result.rows.length > 0) {
      const student = result.rows[0];
      let already_registered = false;
      if (episode_id) {
        const regCheck = await pool.query(
          'SELECT id FROM episode_registrations WHERE student_id = $1 AND episode_id = $2',
          [student.id, episode_id]
        );
        already_registered = regCheck.rows.length > 0;
      }
      res.json({ success: true, student, already_registered });
    } else {
      res.json({ success: false, message: 'Student not found' });
    }
  } catch (error) {
    console.error('Lookup error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EPISODE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Admin: Create Episode — sends "New Episode" push notification
app.post('/api/episodes', authenticateToken, async (req, res) => {
  const { episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode, is_registration_open, zoom_meeting_id } = req.body;
  try {
    const zoomId = meetingId(zoom_meeting_id);
    if (zoomId && event_mode === 'Offline') throw new ZoomError('Zoom meetings can only be linked to online episodes.', 400);
    if (zoomId) await zoom.validateMeeting(zoomId);
    const query = `
      INSERT INTO episodes 
      (episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode, is_registration_open, zoom_meeting_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const values = [episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode || 'Online', is_registration_open !== undefined ? is_registration_open : true, zoomId];
    const result = await pool.query(query, values);
    const episode = result.rows[0];

    // 🔔 Send push notification to all subscribers
    const formattedDate = new Date(event_date).toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    sendPushToAll({
      title: '🎉 New Episode Announced!',
      body: `EP ${episode_number}: "${title}" by ${presenter_name} — ${formattedDate} at ${event_time}. Register now!`,
      icon: cover_photo_url && cover_photo_url.startsWith('http') ? cover_photo_url : '/favicon.png',
      badge: '/favicon.png',
      url: `/register/episode-${episode_number}`,
      tag: `new-episode-${episode_number}`,
    }).catch((err) => console.error('[Push] New episode notification error:', err));

    res.status(201).json({ success: true, episode });
  } catch (error) {
    if (error instanceof ZoomError) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Create episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: Update Episode
app.put('/api/episodes/:id', authenticateToken, async (req, res) => {
  const { episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode, is_registration_open, zoom_meeting_id } = req.body;
  const { id } = req.params;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const existing = await db.query('SELECT * FROM episodes WHERE id = $1 FOR UPDATE', [id]);
    if (!existing.rows.length) { await db.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Episode not found' }); }
    const old = existing.rows[0];
    const zoomId = zoom_meeting_id === undefined ? old.zoom_meeting_id : meetingId(zoom_meeting_id);
    if (zoomId && event_mode === 'Offline') throw new ZoomError('Remove the Zoom meeting before changing to offline.', 400);
    if (old.zoom_meeting_id && (zoomId !== old.zoom_meeting_id || event_mode === 'Offline')) {
      const registrations = await db.query('SELECT id FROM episode_registrations WHERE episode_id = $1 LIMIT 1', [id]);
      if (registrations.rows.length) throw new ZoomError('A Zoom meeting cannot be changed or removed after students register. Create a new episode for a different meeting.', 409);
    }
    if (zoomId && zoomId !== old.zoom_meeting_id) await zoom.validateMeeting(zoomId);
    const query = `
      UPDATE episodes 
      SET episode_number = $1, title = $2, description = $3, meta_description = $4, event_date = $5, event_time = $6,
          presenter_name = $7, presenter_designation = $8, presenter_photo_url = $9, cover_photo_url = $10,
          past_cover_photo_url = $11, event_mode = $12, is_registration_open = $13, reminder_sent = false, zoom_meeting_id = $15
      WHERE id = $14 
      RETURNING *
    `;
    const values = [episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode || 'Online', is_registration_open !== undefined ? is_registration_open : true, id, zoomId];
    const result = await db.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Episode not found' });
    await enqueueZoomRegistrations(db, id);
    await db.query('COMMIT');
    void runZoomWorker();
    res.json({ success: true, episode: result.rows[0] });
  } catch (error) {
    await db.query('ROLLBACK');
    if (error instanceof ZoomError) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Update episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  } finally { db.release(); }
});

// Admin: Toggle Registration Status
app.put('/api/episodes/:id/toggle-registration', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { is_registration_open } = req.body;
  try {
    const query = `
      UPDATE episodes 
      SET is_registration_open = $1 
      WHERE id = $2 
      RETURNING *
    `;
    const result = await pool.query(query, [is_registration_open, id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Episode not found' });
    res.json({ success: true, episode: result.rows[0] });
  } catch (error) {
    console.error('Toggle registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: Get specific episode by ID
app.get('/api/admin/episodes/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM episodes WHERE id = $1', [req.params.id]);
    if (result.rows.length > 0) {
      res.json({ success: true, episode: result.rows[0] });
    } else {
      res.status(404).json({ success: false, error: 'Episode not found' });
    }
  } catch (error) {
    console.error('Fetch episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: inspect pending/failed Zoom registrations without exposing personal join links.
app.get('/api/admin/episodes/:id/zoom-registrations', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT j.registration_id, s.full_name, s.email,
      j.meeting_id, j.status, j.attempts, j.next_attempt_at, j.last_error
      FROM zoom_registration_jobs j JOIN episode_registrations er ON er.id = j.registration_id
      JOIN students s ON s.id = er.student_id WHERE er.episode_id = $1
      ORDER BY j.registration_id`, [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch { res.status(500).json({ success: false, error: 'Unable to fetch Zoom registration status' }); }
});

// Public: Get all episodes
app.get('/api/episodes', async (req, res) => {
  try {
    const query = `
      SELECT id, episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode, is_active, is_registration_open
      FROM episodes 
      ORDER BY episode_number DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, episodes: result.rows });
  } catch (error) {
    console.error('Fetch episodes error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Public: Get specific episode
app.get('/api/episodes/:episode_number', async (req, res) => {
  try {
    let episodeNum = req.params.episode_number;
    if (episodeNum.startsWith('episode-')) episodeNum = episodeNum.replace('episode-', '');
    const result = await pool.query('SELECT * FROM episodes WHERE episode_number = $1', [episodeNum]);
    if (result.rows.length > 0) {
      res.json({ success: true, episode: result.rows[0] });
    } else {
      res.status(404).json({ success: false, error: 'Episode not found' });
    }
  } catch (error) {
    console.error('Fetch episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Public: Get episode cover image (for Open Graph)
app.get('/api/episodes/:episode_number/cover', async (req, res) => {
  try {
    let episodeNum = req.params.episode_number;
    if (episodeNum.startsWith('episode-')) episodeNum = episodeNum.replace('episode-', '');
    const result = await pool.query('SELECT cover_photo_url FROM episodes WHERE episode_number = $1', [episodeNum]);
    if (result.rows.length > 0 && result.rows[0].cover_photo_url) {
      const coverUrl = result.rows[0].cover_photo_url;
      if (coverUrl.startsWith('data:image')) {
        const matches = coverUrl.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          res.setHeader('Content-Type', `image/${matches[1]}`);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(Buffer.from(matches[2], 'base64'));
        }
      }
      if (coverUrl.startsWith('http')) return res.redirect(coverUrl);
    }
    res.status(404).json({ success: false, error: 'Cover photo not found' });
  } catch (error) {
    console.error('Fetch episode cover error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRATION ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/register', async (req, res) => {
  const {
    episode_id, is_existing, student_id,
    email, full_name, gender, college,
    degree, department, year_of_study,
    whatsapp_number, country_code, is_dos_club_member, excited_topic,
    recaptcha_token
  } = req.body;

  let db;
  let committed = false;
  try {
    const isTokenValid = await verifyRecaptchaToken(recaptcha_token);
    if (!isTokenValid) {
      return res.status(400).json({ success: false, error: 'Security check failed. Please refresh and try again.' });
    }

    db = await pool.connect();
    await db.query('BEGIN');
    const epCheck = await db.query('SELECT * FROM episodes WHERE id = $1 FOR UPDATE', [episode_id]);
    if (epCheck.rows.length === 0 || !epCheck.rows[0].is_active) {
      await db.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Registration is closed for this episode.' });
    }
    if (epCheck.rows[0].is_registration_open === false) {
      await db.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Registration is currently disabled for this episode.' });
    }

    let currentStudentId = student_id;

    if (!is_existing) {
      const existingCheck = await db.query('SELECT id FROM students WHERE email = $1 OR (whatsapp_number = $2 AND country_code = $3)', [email, whatsapp_number, country_code]);
      if (existingCheck.rows.length > 0) {
        currentStudentId = existingCheck.rows[0].id;
      } else {
        const studentQuery = `
          INSERT INTO students (email, whatsapp_number, country_code, full_name, gender, college, degree, department, year_of_study, is_dos_club_member, excited_topic)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `;
        const studentResult = await db.query(studentQuery, [email, whatsapp_number, country_code, full_name, gender, college, degree, department, year_of_study, is_dos_club_member, excited_topic]);
        currentStudentId = studentResult.rows[0].id;
      }
    }

    const duplicateCheck = await db.query(
      'SELECT id FROM episode_registrations WHERE student_id = $1 AND episode_id = $2',
      [currentStudentId, episode_id]
    );
    if (duplicateCheck.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'You are already registered for this episode.' });
    }

    await db.query('INSERT INTO episode_registrations (student_id, episode_id) VALUES ($1, $2)', [currentStudentId, episode_id]);
    const savedStudent = await db.query('SELECT email, full_name FROM students WHERE id = $1', [currentStudentId]);
    if (!savedStudent.rows.length) throw new Error('Student not found');
    await enqueueZoomRegistrations(db, episode_id);
    await db.query('COMMIT');
    committed = true;
    // The registration is now confirmed; invitations are sent from the committed outbox.

    // Attempt the confirmation email before triggering the invitation worker.
    const episode = epCheck.rows[0];
    const eventDateStr = new Date(episode.event_date).toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    
    const mailOptions = {
      from: `"DOS Club Open Source Fridays" <${process.env.FROM_EMAIL || 'info@dosclub.com'}>`,
      to: savedStudent.rows[0].email,
      subject: `Registration Confirmed: EP ${episode.episode_number} - ${episode.title}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registration Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; -webkit-font-smoothing: antialiased;">
  <!-- Main Container -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Email Wrapper -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Top Accent Line -->
          <tr>
            <td style="height: 6px; background-color: #07a97b; background-image: linear-gradient(to right, #07a97b, #20dbad);"></td>
          </tr>

          <!-- Header Logo -->
          <tr>
            <td align="center" style="padding: 35px 20px 25px; border-bottom: 1px solid #f1f5f9;">
              <img src="https://osf.descienceosclub.com/dos_logo.png" alt="Open Source Friday" style="height: 50px; width: auto; display: block;" />
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
                Registration Confirmed!
              </h1>
              
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                Hi <strong style="color: #0f172a;">${savedStudent.rows[0].full_name}</strong>,<br><br>
                Thank you for reserving your spot for <strong style="color: #07a97b;">Episode ${episode.episode_number}: ${episode.title}</strong>. We're excited to have you join us for this upcoming session.
              </p>

              <!-- Event Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">
                      Event Details
                    </h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td width="100" style="padding: 8px 0; font-size: 15px; color: #64748b;">Date</td>
                        <td style="padding: 8px 0; font-size: 15px; font-weight: 600; color: #1e293b;">${eventDateStr}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 15px; color: #64748b;">Time</td>
                        <td style="padding: 8px 0; font-size: 15px; font-weight: 600; color: #1e293b;">${episode.event_time}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 15px; color: #64748b;">Speaker</td>
                        <td style="padding: 8px 0; font-size: 15px; font-weight: 600; color: #1e293b;">${episode.presenter_name}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 15px; color: #64748b;">Mode</td>
                        <td style="padding: 8px 0; font-size: 15px; font-weight: 600; color: #07a97b;">${episode.event_mode}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 32px 0; font-size: 16px; line-height: 1.6; color: #475569;">
                ${episode.zoom_meeting_id ? 'Your Zoom registration is being processed. We will email your Zoom invitation separately.' : 'Please mark your calendar. For online events, the organizers will share joining details before the session.'}
              </p>

              <!-- Call to Action -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="https://osf.descienceosclub.com/" target="_blank" style="display: inline-block; padding: 14px 28px; background-color: #07a97b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px; text-align: center;">
                      Visit Platform
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #475569;">
                Descience Open Source Club
              </p>
              <p style="margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                You received this email because you registered for an Open Source Friday event.<br>
                <a href="https://osf.descienceosclub.com/" style="color: #07a97b; text-decoration: none;">osf.descienceosclub.com</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `Registration Successful!
Hi ${savedStudent.rows[0].full_name},
You have successfully registered for Episode ${episode.episode_number}: ${episode.title}.

Event Details:
Date: ${eventDateStr}
Time: ${episode.event_time}
Presenter: ${episode.presenter_name}
Mode: ${episode.event_mode}
${episode.zoom_meeting_id ? 'We will email your Zoom invitation separately.' : ''}

We look forward to seeing you there!
Best regards,
Open Source Friday Team`,
      replyTo: process.env.REPLY_TO_EMAIL || 'info@descienceosclub.com',
      headers: {
        'List-Unsubscribe': `<mailto:${process.env.REPLY_TO_EMAIL || 'info@descienceosclub.com'}?subject=unsubscribe>`,
        'Precedence': 'Bulk',
        'X-Entity-Ref-ID': Date.now().toString()
      }
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending registration confirmation email:', error.message);
    }

    void runZoomWorker();
    res.status(201).json({ success: true, message: 'Registration successful', zoom_status: episode.zoom_meeting_id ? 'pending' : 'not_required' });
  } catch (error) {
    if (db && !committed) await db.query('ROLLBACK');
    console.error('Registration error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'You are already registered for this episode' });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  } finally { if (db) db.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD & MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/dashboard', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT e.*, COUNT(er.id) as registration_count
      FROM episodes e
      LEFT JOIN episode_registrations er ON e.id = er.episode_id
      GROUP BY e.id
      ORDER BY e.episode_number DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Fetch dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/episodes/:episode_id/registrations', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT s.*, er.registered_at, er.id AS registration_id,
        e.zoom_meeting_id IS NOT NULL AND e.event_mode = 'Online' AS zoom_enabled,
        COALESCE(j.invitation_status, 'not_sent') AS invitation_status,
        j.invitation_sent_at, j.invitation_message_id, j.last_error AS invitation_error
      FROM students s
      JOIN episode_registrations er ON s.id = er.student_id
      JOIN episodes e ON e.id = er.episode_id
      LEFT JOIN zoom_registration_jobs j ON j.registration_id = er.id
      WHERE er.episode_id = $1
      ORDER BY er.registered_at DESC
    `;
    const result = await pool.query(query, [req.params.episode_id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Fetch registrations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Only registered students can receive an invitation. Admins can send or resend at any time.
app.post('/api/admin/episodes/:episode_id/registrations/:student_id/zoom-invitation', authenticateToken, async (req, res) => {
  if (!zoom.configured()) return res.status(503).json({ success: false, error: 'Zoom credentials are not configured on the server.' });
  const db = await pool.connect();
  let registrationId;
  try {
    await db.query('BEGIN');
    const { rows } = await db.query(`SELECT er.id, e.zoom_meeting_id, e.event_mode
      FROM episode_registrations er JOIN episodes e ON e.id = er.episode_id
      WHERE er.episode_id = $1 AND er.student_id = $2 FOR UPDATE OF er`,
      [req.params.episode_id, req.params.student_id]);
    if (!rows.length) { await db.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Student must register for this episode before receiving an invitation.' }); }
    if (!rows[0].zoom_meeting_id || rows[0].event_mode !== 'Online') {
      await db.query('ROLLBACK'); return res.status(400).json({ success: false, error: 'Link a Zoom meeting to this online episode first.' });
    }
    registrationId = rows[0].id;
    await enqueueZoomRegistrations(db, req.params.episode_id);
    await db.query(`UPDATE zoom_registration_jobs SET invitation_status = 'pending',
      next_attempt_at = NOW(), last_error = NULL WHERE registration_id = $1`, [registrationId]);
    await db.query('COMMIT');
  } catch {
    await db.query('ROLLBACK');
    return res.status(500).json({ success: false, error: 'Unable to queue Zoom invitation' });
  } finally { db.release(); }
  try {
    await processZoomJobs(pool, zoom, 1, deliverZoomInvitation, registrationId);
    const { rows } = await pool.query('SELECT invitation_status, last_error FROM zoom_registration_jobs WHERE registration_id = $1', [registrationId]);
    const sent = rows[0]?.invitation_status === 'sent';
    res.status(sent ? 200 : 202).json({ success: true, invitation_status: rows[0]?.invitation_status || 'pending',
      message: sent ? 'Zoom invitation accepted by email service.' : (rows[0]?.last_error || 'Invitation queued. Refresh to check its status.') });
  } catch { res.status(202).json({ success: true, invitation_status: 'pending', message: 'Invitation queued; delivery will be retried.' }); }
});

app.delete('/api/admin/episodes/:episode_id/registrations/:student_id', authenticateToken, async (req, res) => {
  try {
    const query = `DELETE FROM episode_registrations WHERE episode_id = $1 AND student_id = $2 RETURNING *`;
    const result = await pool.query(query, [req.params.episode_id, req.params.student_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Registration not found' });
    }
    res.json({ success: true, message: 'Registration deleted successfully' });
  } catch (error) {
    console.error('Delete registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── Admin: Subscriber count (for dashboard insight) ─────────────────────────
app.get('/api/admin/push/stats', authenticateToken, async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM push_subscriptions');
    const welcomeResult = await pool.query('SELECT COUNT(*) as welcome_count FROM push_subscriptions WHERE welcome_sent = TRUE');
    res.json({
      success: true,
      total: parseInt(totalResult.rows[0].total),
      welcomeSent: parseInt(welcomeResult.rows[0].welcome_count)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── Admin: Manually trigger a push notification ──────────────────────────────
app.post('/api/admin/push/send', authenticateToken, async (req, res) => {
  const { title, body, url } = req.body;
  if (!title || !body) {
    return res.status(400).json({ success: false, error: 'title and body are required' });
  }
  try {
    await sendPushToAll({ title, body, icon: '/favicon.png', badge: '/favicon.png', url: url || '/' }, 'Manual');
    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Manual push error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── Admin: Get push notification history ─────────────────────────────────────
app.get('/api/admin/push/history', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM push_notification_history ORDER BY sent_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
if (require.main === module) initDB().then(() => {
  cron.schedule('* * * * *', sendEpisodeReminders);
  cron.schedule('* * * * *', runZoomWorker);
  void runZoomWorker();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`[Push] VAPID configured for ${process.env.VAPID_EMAIL}`);
  });
}).catch(async () => { await pool.end(); process.exitCode = 1; });

module.exports = { app };
