const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const webpush = require('web-push');
const cron = require('node-cron');
require('dotenv').config();

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

    // Ensure columns exist on episodes
    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cover_photo_url TEXT`);
    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS event_mode VARCHAR(50) DEFAULT 'Online'`);
    await pool.query(`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE`);

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
  }
}
initDB();

// ─── Push Helper: send to all subscribers ────────────────────────────────────
async function sendPushToAll(payload) {
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
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ANY($1)', [dead]);
    console.log(`[Push] Removed ${dead.length} expired subscription(s)`);
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
cron.schedule('* * * * *', async () => {
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
});


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
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ success: false, error: 'Invalid subscription object' });
  }
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3`,
      [endpoint, keys.p256dh, keys.auth]
    );
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
  const { episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode } = req.body;
  try {
    const query = `
      INSERT INTO episodes 
      (episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const values = [episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode || 'Online'];
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
    console.error('Create episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: Update Episode
app.put('/api/episodes/:id', authenticateToken, async (req, res) => {
  const { episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode } = req.body;
  const { id } = req.params;
  try {
    const query = `
      UPDATE episodes 
      SET episode_number = $1, title = $2, description = $3, meta_description = $4, event_date = $5, event_time = $6,
          presenter_name = $7, presenter_designation = $8, presenter_photo_url = $9, cover_photo_url = $10,
          past_cover_photo_url = $11, event_mode = $12, reminder_sent = false
      WHERE id = $13 
      RETURNING *
    `;
    const values = [episode_number, title, description, meta_description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, past_cover_photo_url, event_mode || 'Online', id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Episode not found' });
    res.json({ success: true, episode: result.rows[0] });
  } catch (error) {
    console.error('Update episode error:', error);
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

// Public: Get all episodes
app.get('/api/episodes', async (req, res) => {
  try {
    const query = `
      SELECT id, episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, cover_photo_url, is_active
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

  try {
    const isTokenValid = await verifyRecaptchaToken(recaptcha_token);
    if (!isTokenValid) {
      return res.status(400).json({ success: false, error: 'Security check failed. Please refresh and try again.' });
    }

    const epCheck = await pool.query('SELECT is_active FROM episodes WHERE id = $1', [episode_id]);
    if (epCheck.rows.length === 0 || !epCheck.rows[0].is_active) {
      return res.status(400).json({ success: false, error: 'Registration is closed for this episode.' });
    }

    await pool.query('BEGIN');

    let currentStudentId = student_id;

    if (!is_existing) {
      const existingCheck = await pool.query('SELECT id FROM students WHERE email = $1 OR (whatsapp_number = $2 AND country_code = $3)', [email, whatsapp_number, country_code]);
      if (existingCheck.rows.length > 0) {
        currentStudentId = existingCheck.rows[0].id;
      } else {
        const studentQuery = `
          INSERT INTO students (email, whatsapp_number, country_code, full_name, gender, college, degree, department, year_of_study, is_dos_club_member, excited_topic)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `;
        const studentResult = await pool.query(studentQuery, [email, whatsapp_number, country_code, full_name, gender, college, degree, department, year_of_study, is_dos_club_member, excited_topic]);
        currentStudentId = studentResult.rows[0].id;
      }
    }

    const duplicateCheck = await pool.query(
      'SELECT id FROM episode_registrations WHERE student_id = $1 AND episode_id = $2',
      [currentStudentId, episode_id]
    );
    if (duplicateCheck.rows.length > 0) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'You are already registered for this episode.' });
    }

    await pool.query('INSERT INTO episode_registrations (student_id, episode_id) VALUES ($1, $2)', [currentStudentId, episode_id]);
    await pool.query('COMMIT');

    res.status(201).json({ success: true, message: 'Registration successful' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Registration error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'You are already registered for this episode' });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
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
      SELECT s.*, er.registered_at
      FROM students s
      JOIN episode_registrations er ON s.id = er.student_id
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
    const result = await pool.query('SELECT COUNT(*) as total FROM push_subscriptions');
    res.json({ success: true, total: parseInt(result.rows[0].total) });
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
    await sendPushToAll({ title, body, icon: '/favicon.png', badge: '/favicon.png', url: url || '/' });
    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Manual push error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`[Push] VAPID configured for ${process.env.VAPID_EMAIL}`);
});
