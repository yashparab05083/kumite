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
app.use(express.json({ limit: '25mb' }));

// Aiven PostgreSQL Database Connection URL with Automatic Fallback
const FALLBACK_B64 = 'cG9zdGdyZXM6Ly9hdm5hZG1pbjpBVk5TX29XQ1Bvc3lweTRid1ZWVjFBV2hAc2hvdG9rYW4tdG91cm5hbWVudC15YXNocGFyYWIwNTA4LWQwYmEuYy5haXZlbmNsb3VkLmNvbToyNDI5Ni9kZWZhdWx0ZGI=';

function getDatabaseUri() {
  let uri = process.env.DATABASE_URL;
  if (!uri || typeof uri !== 'string' || uri.trim() === '' || uri.trim() === 'null' || uri.trim() === 'undefined') {
    uri = Buffer.from(FALLBACK_B64, 'base64').toString('utf8');
  }
  return uri.trim().replace(/^["']|["']$/g, '').replace(/\?.*$/, '');
}

const cleanUri = getDatabaseUri();

const pool = new Pool({
  connectionString: cleanUri,
  ssl: { rejectUnauthorized: false }
});

// Safe database query wrapper to avoid internal null-client errors
async function dbQuery(text, params) {
  if (!pool) throw new Error('Database pool not initialized');
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    if (client) {
      try { client.release(); } catch(e) {}
    }
  }
}

// Initialize database schema
async function initDatabase() {
  try {
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS tournament_state (
        id VARCHAR(50) PRIMARY KEY,
        state_data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Successfully connected to Aiven PostgreSQL & initialized tournament_state table.');
  } catch (err) {
    console.error('Aiven PostgreSQL Connection Error:', err.message);
  }
}

initDatabase();

// 1. GET /api/tournament - Fetch latest tournament data from Aiven DB
app.get('/api/tournament', async (req, res) => {
  try {
    const result = await dbQuery('SELECT state_data FROM tournament_state WHERE id = $1', ['main']);
    if (result && result.rows && result.rows.length > 0) {
      res.json(result.rows[0].state_data);
    } else {
      res.json(null);
    }
  } catch (err) {
    console.error('Fetch tournament API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/tournament - Save/Update tournament data to Aiven DB
app.post('/api/tournament', async (req, res) => {
  try {
    const stateData = req.body;
    if (!stateData) return res.status(400).json({ error: 'No state data provided' });

    await dbQuery(`
      INSERT INTO tournament_state (id, state_data, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET state_data = EXCLUDED.state_data, updated_at = NOW();
    `, ['main', JSON.stringify(stateData)]);

    res.json({ success: true, message: 'Tournament data saved to Aiven PostgreSQL!' });
  } catch (err) {
    console.error('Save tournament API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const result = await dbQuery('SELECT NOW()');
    res.json({ status: 'OK', database: 'Connected', serverTime: result.rows[0].now });
  } catch (err) {
    console.error('Health check error:', err.message);
    res.status(500).json({ status: 'ERROR', message: err.message || 'Database connection error' });
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
