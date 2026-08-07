const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
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

// Function to calculate episode based on timestamp
function getEpisodeNumber(timestampStr) {
  const date = new Date(timestampStr);
  const startTime = new Date('2026-07-17T23:59:59Z'); // Episode 1 cut-off (Friday)
  
  if (date <= startTime) return 1;
  
  // Calculate difference in days
  const diffTime = Math.abs(date - startTime);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Every 7 days is a new episode
  const episodeOffset = Math.ceil(diffDays / 7);
  return 1 + episodeOffset;
}

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

// Get episodes and registrations
app.get('/api/episodes', async (req, res) => {
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
