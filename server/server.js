const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Lookup Student Endpoint
app.post('/api/students/lookup', async (req, res) => {
  const { identifier } = req.body; // Can be email or whatsapp_number
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, whatsapp_number FROM students WHERE email = $1 OR whatsapp_number = $1',
      [identifier]
    );
    if (result.rows.length > 0) {
      res.json({ success: true, student: result.rows[0] });
    } else {
      res.json({ success: false, message: 'Student not found' });
    }
  } catch (error) {
    console.error('Lookup error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: Create Episode (Protected)
app.post('/api/episodes', authenticateToken, async (req, res) => {
  const { episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url } = req.body;
  
  try {
    const query = `
      INSERT INTO episodes 
      (episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const values = [episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url];
    const result = await pool.query(query, values);
    res.status(201).json({ success: true, episode: result.rows[0] });
  } catch (error) {
    console.error('Create episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: Update Episode (Protected)
app.put('/api/episodes/:id', authenticateToken, async (req, res) => {
  const { episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url } = req.body;
  const { id } = req.params;
  
  try {
    const query = `
      UPDATE episodes 
      SET episode_number = $1, title = $2, description = $3, event_date = $4, event_time = $5, presenter_name = $6, presenter_designation = $7, presenter_photo_url = $8
      WHERE id = $9
      RETURNING *
    `;
    const values = [episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url, id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Episode not found' });
    }
    res.json({ success: true, episode: result.rows[0] });
  } catch (error) {
    console.error('Update episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: Get specific episode details by ID (Protected)
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

// Public: Get all active episodes
app.get('/api/episodes', async (req, res) => {
  try {
    const query = `
      SELECT id, episode_number, title, description, event_date, event_time, presenter_name, presenter_designation, presenter_photo_url
      FROM episodes 
      WHERE is_active = TRUE
      ORDER BY episode_number DESC
    `;
    const result = await pool.query(query);
    res.json({ success: true, episodes: result.rows });
  } catch (error) {
    console.error('Fetch episodes error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Public: Get specific episode details
app.get('/api/episodes/:episode_number', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM episodes WHERE episode_number = $1 AND is_active = TRUE', [req.params.episode_number]);
    if (result.rows.length > 0) {
      res.json({ success: true, episode: result.rows[0] });
    } else {
      res.status(404).json({ success: false, error: 'Episode not found or inactive' });
    }
  } catch (error) {
    console.error('Fetch episode error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Public: Register for an episode
app.post('/api/register', async (req, res) => {
  const {
    episode_id,
    is_existing,
    student_id,
    email, full_name, gender, college,
    degree, department, year_of_study, 
    whatsapp_number, is_dos_club_member, excited_topic
  } = req.body;

  try {
    await pool.query('BEGIN');

    let currentStudentId = student_id;

    if (!is_existing) {
      // Create new student
      const studentQuery = `
        INSERT INTO students (email, whatsapp_number, full_name, gender, college, degree, department, year_of_study, is_dos_club_member, excited_topic)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `;
      const studentValues = [email, whatsapp_number, full_name, gender, college, degree, department, year_of_study, is_dos_club_member, excited_topic];
      const studentResult = await pool.query(studentQuery, studentValues);
      currentStudentId = studentResult.rows[0].id;
    }

    // Register for episode
    const mappingQuery = `
      INSERT INTO episode_registrations (student_id, episode_id)
      VALUES ($1, $2)
    `;
    await pool.query(mappingQuery, [currentStudentId, episode_id]);

    await pool.query('COMMIT');
    res.status(201).json({ success: true, message: 'Registration successful' });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Registration error:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ success: false, error: 'You are already registered for this episode' });
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Admin: Get all episodes with registration counts (PROTECTED ROUTE)
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

// Admin: Get registrations for a specific episode (PROTECTED ROUTE)
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
