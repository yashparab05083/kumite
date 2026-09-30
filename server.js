/**
 * Kumite Tournament System - Node.js Express Backend API
 * Connects to Aiven PostgreSQL Database for Fast Multi-Device Cloud Persistence
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Aiven PostgreSQL Database Connection URL from Environment Variables
const AIVEN_DB_URI = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: AIVEN_DB_URI,
  ssl: { rejectUnauthorized: false }
});

// Initialize database schema
async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to Aiven PostgreSQL database!');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournament_state (
        id VARCHAR(50) PRIMARY KEY,
        state_data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    client.release();
    console.log('Database schema "tournament_state" initialized successfully.');
  } catch (err) {
    console.error('Aiven PostgreSQL Connection Error:', err.message);
  }
}

initDatabase();

// 1. GET /api/tournament - Fetch latest tournament data from Aiven DB
app.get('/api/tournament', async (req, res) => {
  try {
    const result = await pool.query('SELECT state_data FROM tournament_state WHERE id = $1', ['main']);
    if (result.rows.length > 0) {
      res.json(result.rows[0].state_data);
    } else {
      res.json(null);
    }
  } catch (err) {
    console.error('Fetch tournament API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/tournament - Save/Update tournament data to Aiven DB
app.post('/api/tournament', async (req, res) => {
  try {
    const stateData = req.body;
    if (!stateData) return res.status(400).json({ error: 'No state data provided' });

    await pool.query(`
      INSERT INTO tournament_state (id, state_data, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET state_data = EXCLUDED.state_data, updated_at = NOW();
    `, ['main', JSON.stringify(stateData)]);

    res.json({ success: true, message: 'Tournament data saved to Aiven PostgreSQL!' });
  } catch (err) {
    console.error('Save tournament API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'OK', database: 'Connected', serverTime: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', message: err.message });
  }
});

// Serve static frontend web files
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for root routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Kumite Tournament Web Server & Aiven API running on port ${PORT}`);
  console.log(`🌐 Website URL: http://localhost:${PORT}`);
});
