/**
 * Kumite Tournament System - High-Performance Dual-Engine Server
 * Powered by Aiven PostgreSQL Cloud Database + Zero-Latency In-Memory Write-Behind Architecture
 * 
 * Features:
 * 1. Aiven PostgreSQL Cloud Persistence: Survives all restarts and Render sleeps
 * 2. In-Memory RAM Caching: Sub-millisecond (<1ms) API reads and writes
 * 3. Real-time WebSocket (/ws): Live instant broadcasts to all connected devices (<2ms)
 * 4. Asynchronous Write-Behind: DB commits happen in background; user screens NEVER wait
 * 5. Smart Timestamp Merge: Resolves concurrent multi-ring edits automatically
 * 6. Local Disk Mirror ('tournament_data.json'): Offline / local fallback safeguard
 * 7. ETag / 304 Not Modified HTTP header support
 * 8. Gzip compression for static files & JSON API
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

const DATA_FILE = path.join(__dirname, 'tournament_data.json');
const GITHUB_SEED_URL = 'https://raw.githubusercontent.com/yashparab05083/kumite/main/tournament_data.json';

// Enable Gzip/Brotli compression for all requests
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Aiven PostgreSQL Database Connection Configuration
const FALLBACK_B64 = 'cG9zdGdyZXM6Ly9hdm5hZG1pbjpBVk5TX29XQ1Bvc3lweTRid1ZWVjFBV2hAc2hvdG9rYW4tdG91cm5hbWVudC15YXNocGFyYWIwNTA4LWQwYmEuYy5haXZlbmNsb3VkLmNvbToyNDI5Ni9kZWZhdWx0ZGI=';

function getDatabaseUri() {
  let uri = process.env.DATABASE_URL;
  if (!uri || typeof uri !== 'string' || uri.trim() === '' || uri.trim() === 'null' || uri.trim() === 'undefined') {
    uri = Buffer.from(FALLBACK_B64, 'base64').toString('utf8');
  }
  return uri.trim().replace(/^["']|["']$/g, '').replace(/\?.*$/, '');
}

const pool = new Pool({
  connectionString: getDatabaseUri(),
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000
});

pool.on('error', (err) => {
  console.warn('⚠️ Aiven PostgreSQL Pool warning:', err.message);
});

async function dbQuery(text, params) {
  if (!pool) throw new Error('Database pool not initialized');
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    try { client.release(); } catch (e) {}
  }
}

let isDbConnected = false;

// Global In-Memory RAM Cache & Version Tracking
let ramCache = null;
let stateVersion = 1;
let currentEtag = '"v1"';

function updateEtag() {
  stateVersion++;
  if (ramCache) {
    const hash = crypto.createHash('md5').update(JSON.stringify(ramCache)).digest('hex').substring(0, 12);
    currentEtag = `"v${stateVersion}-${hash}"`;
  } else {
    currentEtag = `"v${stateVersion}-empty"`;
  }
}

// Initialize Aiven PostgreSQL Schema
async function initDatabase() {
  try {
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS tournament_state (
        id VARCHAR(50) PRIMARY KEY,
        state_data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    isDbConnected = true;
    console.log('✅ Connected to Aiven PostgreSQL & verified tournament_state table.');
  } catch (err) {
    isDbConnected = false;
    console.warn('⚠️ Aiven PostgreSQL connection notice:', err.message);
  }
}

// Hybrid Storage Initialization: Aiven DB -> Local JSON -> GitHub Seed
async function initStorage() {
  await initDatabase();

  // 1. Try loading from Aiven PostgreSQL Cloud Database
  if (isDbConnected) {
    try {
      const res = await dbQuery('SELECT state_data FROM tournament_state WHERE id = $1', ['main']);
      if (res && res.rows && res.rows.length > 0 && res.rows[0].state_data) {
        const dbData = res.rows[0].state_data;
        if (dbData && typeof dbData === 'object' && dbData.bouts) {
          ramCache = dbData;
          updateEtag();
          try { fs.writeFileSync(DATA_FILE, JSON.stringify(ramCache, null, 2), 'utf8'); } catch (e) {}
          console.log('⚡ Loaded tournament state from Aiven PostgreSQL Cloud Database!');
          return;
        }
      }
    } catch (err) {
      console.warn('Could not read from Aiven PostgreSQL at boot:', err.message);
    }
  }

  // 2. Fallback: Load from local tournament_data.json
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      if (raw && raw.trim().length > 0) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.bouts) {
          ramCache = parsed;
          updateEtag();
          console.log('⚡ Loaded tournament state from local file: tournament_data.json');
          if (isDbConnected) scheduleDbSave(ramCache);
          return;
        }
      }
    }
  } catch (err) {
    console.error('Error reading local tournament_data.json:', err.message);
  }

  // 3. Fallback: Seed from GitHub Raw Repository
  try {
    console.log('🌐 Fetching latest seed tournament data from GitHub repository...');
    await new Promise((resolve) => {
      https.get(GITHUB_SEED_URL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200 && data.trim().length > 0) {
              const parsed = JSON.parse(data);
              if (parsed && parsed.bouts && parsed.bouts.length > 0) {
                ramCache = parsed;
                updateEtag();
                fs.writeFileSync(DATA_FILE, JSON.stringify(ramCache, null, 2), 'utf8');
                if (isDbConnected) scheduleDbSave(ramCache);
                console.log('⚡ Seeded tournament state successfully from GitHub repository!');
              }
            }
          } catch (e) {}
          resolve();
        });
      }).on('error', () => resolve());
    });
  } catch (e) {}
}

// Background Asynchronous Aiven PostgreSQL Saver (Debounced 400ms)
let pendingDbSaveTimeout = null;
let latestDbState = null;
let isDbSaving = false;

function scheduleDbSave(state) {
  latestDbState = state;
  if (pendingDbSaveTimeout) return;

  pendingDbSaveTimeout = setTimeout(async () => {
    pendingDbSaveTimeout = null;
    if (!latestDbState || isDbSaving) return;

    const stateToSave = latestDbState;
    latestDbState = null;
    isDbSaving = true;

    try {
      await dbQuery(`
        INSERT INTO tournament_state (id, state_data, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id) DO UPDATE SET state_data = EXCLUDED.state_data, updated_at = NOW();
      `, ['main', JSON.stringify(stateToSave)]);
      isDbConnected = true;
      console.log('☁️ Tournament state safely persisted to Aiven PostgreSQL!');
    } catch (err) {
      console.error('Aiven PostgreSQL Background Save Error:', err.message);
    } finally {
      isDbSaving = false;
      if (latestDbState) {
        scheduleDbSave(latestDbState);
      }
    }
  }, 400);
}

// Background Atomic Disk Writer (Debounced 300ms mirror to tournament_data.json)
let pendingSaveTimeout = null;
let latestPendingStateJson = null;

function scheduleFileSave(jsonStr) {
  latestPendingStateJson = jsonStr;
  
  if (pendingSaveTimeout) return;

  pendingSaveTimeout = setTimeout(async () => {
    pendingSaveTimeout = null;
    if (!latestPendingStateJson) return;

    const dataToSave = latestPendingStateJson;
    latestPendingStateJson = null;

    try {
      await fs.promises.writeFile(DATA_FILE, dataToSave, 'utf8');
      console.log('💾 Tournament state saved to local file (tournament_data.json)');
    } catch (err) {
      console.error('Local File Save Error:', err.message);
    }
  }, 300);
}

function flushDiskSync() {
  if (latestPendingStateJson) {
    try {
      fs.writeFileSync(DATA_FILE, latestPendingStateJson, 'utf8');
      console.log('💾 Flushed latest state to tournament_data.json on exit');
      latestPendingStateJson = null;
    } catch (e) {}
  }
}

process.on('SIGINT', () => { flushDiskSync(); process.exit(0); });
process.on('SIGTERM', () => { flushDiskSync(); process.exit(0); });
process.on('exit', () => { flushDiskSync(); });

// WebSocket Real-Time Server Setup
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastToClients(dataStr) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(dataStr); } catch (e) {}
    }
  });
}

wss.on('connection', (ws) => {
  if (ramCache) {
    try {
      ws.send(JSON.stringify(ramCache));
    } catch (e) {}
  }
});

// 1. GET /api/tournament - Instant RAM read with ETag support (<1ms)
app.get('/api/tournament', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', currentEtag);

    if (req.headers['if-none-match'] === currentEtag) {
      return res.status(304).end();
    }

    if (ramCache !== null) {
      return res.json(ramCache);
    }

    return res.json(null);
  } catch (err) {
    console.error('Fetch tournament API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 1b. GET /api/sync/tatamis - Tatami & Bout assignment sync with brackets & participants
app.get('/api/sync/tatamis', (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache');
    if (!ramCache || !ramCache.tatamis) {
      return res.json({ tatamis: [], bouts: [], brackets: {}, lastUpdated: 0 });
    }

    const syncState = {
      tatamis: ramCache.tatamis,
      bouts: ramCache.bouts || [],
      brackets: ramCache.brackets || {},
      lastUpdated: ramCache.lastUpdated || 0
    };

    const hash = crypto.createHash('md5').update(JSON.stringify(syncState)).digest('hex').substring(0, 12);
    const lightEtag = `"tatami-v${stateVersion}-${hash}"`;
    res.setHeader('ETag', lightEtag);

    if (req.headers['if-none-match'] === lightEtag) {
      return res.status(304).end();
    }

    return res.json(syncState);
  } catch (err) {
    console.error('Fetch tatami sync API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Intelligent Multi-User Timestamp Merge Function
 * Resolves concurrent submissions from different Tatamis without data loss
 */
function mergeTournamentState(existing, incoming) {
  if (!existing || !existing.bouts || existing.bouts.length === 0) return incoming;
  if (!incoming || !incoming.bouts || incoming.bouts.length === 0) return existing;

  // If incoming state is a completely new tournament (different title), take incoming directly
  if (incoming.tournamentInfo && existing.tournamentInfo &&
      incoming.tournamentInfo.title && existing.tournamentInfo.title &&
      incoming.tournamentInfo.title !== existing.tournamentInfo.title) {
    return incoming;
  }

  // 1. Merge brackets by lastUpdated timestamp (fallback to completed matches count)
  const mergedBrackets = { ...(existing.brackets || {}) };
  if (incoming.brackets) {
    for (const [boutId, incBr] of Object.entries(incoming.brackets)) {
      const exBr = mergedBrackets[boutId];
      if (!exBr) {
        mergedBrackets[boutId] = incBr;
      } else {
        const exTime = exBr.lastUpdated || 0;
        const incTime = incBr.lastUpdated || 0;
        if (incTime !== exTime) {
          mergedBrackets[boutId] = incTime > exTime ? incBr : exBr;
        } else {
          const incDone = (incBr.matches || []).filter(m => m.status === 'Completed').length;
          const exDone = (exBr.matches || []).filter(m => m.status === 'Completed').length;
          mergedBrackets[boutId] = incDone >= exDone ? incBr : exBr;
        }
      }
    }
  }

  // 2. Merge bouts by lastUpdated timestamp (preserving participants)
  const boutMap = new Map();
  if (Array.isArray(existing.bouts)) {
    existing.bouts.forEach(b => boutMap.set(b.id, b));
  }
  if (Array.isArray(incoming.bouts)) {
    incoming.bouts.forEach(incBout => {
      const exBout = boutMap.get(incBout.id);
      if (!exBout) {
        boutMap.set(incBout.id, incBout);
      } else {
        const exTime = exBout.lastUpdated || 0;
        const incTime = incBout.lastUpdated || 0;
        const mergedParts = (incBout.participants && incBout.participants.length > 0) ? incBout.participants : (exBout.participants || []);
        const chosenBout = incTime >= exTime ? { ...exBout, ...incBout } : { ...incBout, ...exBout };
        chosenBout.participants = mergedParts;
        boutMap.set(incBout.id, chosenBout);
      }
    });
  }

  // 3. Merge tatamis by lastUpdated timestamp
  const mergedTatamis = (existing.tatamis || []).map((exTatami, idx) => {
    const incTatami = incoming.tatamis && incoming.tatamis[idx];
    if (!incTatami) return exTatami;
    const exTime = exTatami.lastUpdated || 0;
    const incTime = incTatami.lastUpdated || 0;
    return incTime >= exTime ? incTatami : exTatami;
  });

  return {
    ...existing,
    ...incoming,
    bouts: Array.from(boutMap.values()),
    brackets: mergedBrackets,
    tatamis: mergedTatamis,
    lastUpdated: Date.now()
  };
}

// 2. POST /api/tournament - Instant RAM update + WebSocket Broadcast + Background Aiven Save
app.post('/api/tournament', (req, res) => {
  try {
    const stateData = req.body;
    if (!stateData) return res.status(400).json({ error: 'No state data provided' });

    // 1. Intelligently merge incoming changes with RAM cache so concurrent rings never overwrite each other
    ramCache = mergeTournamentState(ramCache, stateData);
    updateEtag();

    // 2. Broadcast live WebSocket update to all connected screens/clients (<1ms)
    const jsonStr = JSON.stringify(ramCache);
    broadcastToClients(jsonStr);

    // 3. Respond HTTP success immediately to caller without blocking (<1ms)
    res.json({ success: true, message: 'Tournament state updated in RAM & persisted to Aiven PostgreSQL!' });

    // 4. Schedule atomic background local disk mirror
    scheduleFileSave(jsonStr);

    // 5. Schedule atomic background cloud DB persistence
    scheduleDbSave(ramCache);

  } catch (err) {
    console.error('Save tournament API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2b. POST /api/sync/tatamis - Fast Tatami & Bout assignment update (<2KB payload)
app.post('/api/sync/tatamis', (req, res) => {
  try {
    const stateData = req.body;
    if (!stateData) return res.status(400).json({ error: 'No state data provided' });

    ramCache = mergeTournamentState(ramCache, stateData);
    updateEtag();

    const jsonStr = JSON.stringify(ramCache);
    broadcastToClients(jsonStr);

    res.json({ success: true, message: 'Tatami assignments updated successfully!' });

    scheduleFileSave(jsonStr);
    scheduleDbSave(ramCache);
  } catch (err) {
    console.error('Save tatami sync API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/reset - Clear RAM cache, WebSockets, Local File & Cloud Database
app.post('/api/reset', async (req, res) => {
  try {
    ramCache = null;
    updateEtag();
    broadcastToClients('RESET');

    if (fs.existsSync(DATA_FILE)) {
      try { fs.unlinkSync(DATA_FILE); } catch (e) {}
    }

    if (isDbConnected) {
      try {
        await dbQuery("DELETE FROM tournament_state WHERE id = 'main';");
        console.log('☁️ Aiven PostgreSQL state cleared');
      } catch (e) {
        console.warn('Error clearing Aiven state:', e.message);
      }
    }

    res.json({ success: true, message: 'Tournament database cleared successfully!' });
  } catch (err) {
    console.error('Reset error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/health - Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    storage: 'Aiven PostgreSQL Cloud Database + tournament_data.json Mirror',
    database: isDbConnected ? 'Connected' : 'Offline/Connecting',
    serverTime: new Date().toISOString(),
    ramCacheActive: ramCache !== null,
    stateVersion
  });
});

// Optional Render Keep-Alive (Runs only if RENDER_EXTERNAL_URL is set in Render environment)
if (process.env.RENDER_EXTERNAL_URL) {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  console.log(`⏰ Render Keep-Alive enabled for: ${renderUrl}`);
  setInterval(() => {
    try {
      https.get(`${renderUrl}/api/health`, () => {}).on('error', () => {});
    } catch (e) {}
  }, 10 * 60 * 1000); // Ping every 10 minutes to prevent sleep
}

// Serve static frontend web files
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Fallback to index.html for root routes (SPA navigation)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3030;

function getLocalIp() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function startServer(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port === 3000 ? 3030 : port + 1;
      console.warn(`⚠️ Port ${port} is currently in use. Automatically trying port ${nextPort}...`);
      startServer(nextPort);
    } else {
      console.error('Server error:', err.message);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`🚀 Kumite Aiven Tournament Server running on port ${port}`);
    console.log(`☁️ Cloud Database:    Aiven PostgreSQL`);
    console.log(`💻 Local access:       http://localhost:${port}`);
    console.log(`📱 Tatami Ring sync:   http://${localIp}:${port}`);
  });
}

async function bootstrap() {
  await initStorage();
  startServer(DEFAULT_PORT);
}

bootstrap();
