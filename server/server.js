const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize Database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      )
    `);

    // Check if any admin exists
    const result = await pool.query('SELECT COUNT(*) FROM admins');
    if (parseInt(result.rows[0].count) === 0) {
      console.log('Seeding initial admin from .env...');
      const defaultUser = process.env.ADMIN_USERNAME || 'admin';
      const defaultPass = process.env.ADMIN_PASSWORD || 'password123';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(defaultPass, salt);
      
      await pool.query(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        [defaultUser, hash]
      );
      console.log('Initial admin seeded.');
    }
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}
initDB();

// Middleware to authenticate JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

// Function to calculate episode based on timestamp
function getEpisodeNumber(timestampStr) {
  const date = new Date(timestampStr);
  const startTime = new Date('2026-07-17T23:59:59Z'); // Episode 1 cut-off (Friday)
  
  if (date <= startTime) return 1;
  
  const diffTime = Math.abs(date - startTime);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const episodeOffset = Math.ceil(diffDays / 7);
  return Math.min(52, 1 + episodeOffset);
}

// Admin Login Endpoint (Database verified)
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

// Change Password Endpoint (Protected)
app.post('/api/change-password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const username = req.user.username;

  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(oldPassword, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE admins SET password_hash = $1 WHERE username = $2', [newHash, username]);
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Webhook to receive data from Google Apps Script
app.post('/api/webhook', async (req, res) => {
  try {
    // Security Check: Verify the secret token
    const authHeader = req.headers['x-webhook-secret'];
    if (!process.env.WEBHOOK_SECRET || authHeader !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: Invalid webhook secret' });
    }

    const {
      timestamp, email, full_name, gender, college,
      year_of_study, department, whatsapp_number,
      is_dos_club_member, excited_topic, degree
    } = req.body;

    if (!timestamp || !email) {
      return res.status(400).json({ error: 'Timestamp and email are required' });
    }

    const episode_number = getEpisodeNumber(timestamp);

    const query = `
      INSERT INTO registrations 
      (timestamp, email, full_name, gender, college, year_of_study, department, whatsapp_number, is_dos_club_member, excited_topic, degree, episode_number) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
    
    const values = [
      new Date(timestamp), email, full_name, gender, college, year_of_study, 
      department, whatsapp_number, is_dos_club_member, excited_topic, degree, episode_number
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ success: true, id: result.rows[0].id, episode: episode_number });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get episodes and registrations (PROTECTED ROUTE)
app.get('/api/episodes', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM registrations ORDER BY timestamp DESC');
    
    // Group by episode
    const episodes = {};
    result.rows.forEach(row => {
      const ep = row.episode_number;
      if (!episodes[ep]) {
        episodes[ep] = [];
      }
      episodes[ep].push(row);
    });

    res.json({ success: true, data: episodes });
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
