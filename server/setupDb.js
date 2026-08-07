const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const createTableQuery = `
CREATE TABLE IF NOT EXISTS registrations (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP,
    email VARCHAR(255),
    full_name VARCHAR(255),
    gender VARCHAR(50),
    college VARCHAR(255),
    year_of_study VARCHAR(50),
    department VARCHAR(255),
    whatsapp_number VARCHAR(50),
    is_dos_club_member VARCHAR(50),
    excited_topic TEXT,
    degree VARCHAR(255),
    episode_number INT
);
`;

async function setupDatabase() {
  try {
    console.log('Connecting to database...');
    await pool.query(createTableQuery);
    console.log('Table "registrations" created successfully.');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await pool.end();
  }
}

setupDatabase();
