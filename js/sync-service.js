/**
 * Sync Service & Application State Store
 * Handles local storage persistence & real-time sync across devices
 */

const SyncService = {
  STORAGE_KEY: 'kumite_tournament_data_v1',
  listeners: [],

  state: {
    tournamentInfo: {
      title: 'SHOTOKAN KARATE CHAMPIONSHIP',
      date: new Date().toISOString().split('T')[0],
      referees: ['Ref 1', 'Ref 2', 'Ref 3', 'Ref 4', 'Ref 5']
    },
    participants: [],
    bouts: [],
    brackets: {}, // boutId -> bracket object
    tatamis: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      name: `Tatami ${i + 1}`,
      activeBoutId: null,
      activeMatchNumber: null,
      assignedBoutIds: [],
      status: 'Empty'
    })),
    currentUser: null
  },

  peer: null,
  peerConnections: [],
  activeRoomCode: null,
  isHost: false,

  AIVEN_API_URL: '/api/tournament',
  TATAMI_API_URL: '/api/sync/tatamis',
  GITHUB_RAW_URL: 'https://raw.githubusercontent.com/yashparab05083/kumite/main/tournament_data.json',

  syncChannel: (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('kumite_sync_channel') : null,
  ws: null,
  lastTatamiEtag: null,

  isScoringActive: false,
  activeScoringBoutId: null,
  isEditingActive: false,

  startBoutScoring(boutId) {
    this.isScoringActive = true;
    this.activeScoringBoutId = boutId || null;
    this.lastLocalEditTime = Date.now();
  },

  stopBoutScoring() {
    this.isScoringActive = false;
    this.activeScoringBoutId = null;
  },

  startBoutEditing() {
    this.isEditingActive = true;
    this.lastLocalEditTime = Date.now();
  },

  stopBoutEditing() {
    this.isEditingActive = false;
  },

  init() {
    this.loadFromLocal();
    this.loadFromAivenDB();
    this.loadTatamiSyncFromAivenDB();
    this.initWebSocketSync();

    // Listen for cross-tab BroadcastChannel sync on same browser
    if (this.syncChannel) {
      this.syncChannel.onmessage = (event) => {
        if (event.data && event.data.state && !this.isEditingActive) {
          this.mergeState(event.data.state);
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
          this.notifyListeners();
        }
      };
    }
    
    // Auto-restore room code if previously connected
    const savedRoom = localStorage.getItem('kumite_active_room_code');
    if (savedRoom) {
      this.initRoomSync(savedRoom, false);
    }

    // Listen for tab sync on same device
    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY) {
        this.loadFromLocal();
        this.notifyListeners();
      }
    });

    // Lightweight 5-second Tatami ring & bout assignment pull (<2KB payload, high response speed)
    setInterval(() => {
      this.loadTatamiSyncFromAivenDB();
    }, 5000);

    // 15-second background full tournament state pull safeguard
    setInterval(() => {
      this.loadFromAivenDB();
    }, 15000);

    // Firebase Cloud Sync (Only merges if valid cloud bouts exist)
    if (typeof FirebaseConfig !== 'undefined') {
      FirebaseConfig.init();
      if (FirebaseConfig.isInitialized && FirebaseConfig.db) {
        try {
          const tournamentRef = FirebaseConfig.db.ref('kumite_tournament_data_v1');
          tournamentRef.on('value', (snapshot) => {
            const cloudData = snapshot.val();
            if (cloudData && cloudData.bouts && Array.isArray(cloudData.bouts) && cloudData.bouts.length > 0) {
              this.mergeState(cloudData);
              this.saveToLocalOnly();
            }
          });
        } catch (err) {
          console.warn('Firebase cloud sync listener error:', err);
        }
      }
    }
  },

  mergeState(incoming) {
    if (!incoming) return;
    if (!this.state || !this.state.bouts || this.state.bouts.length === 0) {
      this.state = { ...this.state, ...incoming };
      return;
    }

    // 1. Merge bouts by lastUpdated timestamp
    const boutMap = new Map();
    if (Array.isArray(this.state.bouts)) {
      this.state.bouts.forEach(b => boutMap.set(b.id, b));
    }

    if (Array.isArray(incoming.bouts)) {
      incoming.bouts.forEach(incBout => {
        const exBout = boutMap.get(incBout.id);
        if (!exBout) {
          boutMap.set(incBout.id, incBout);
        } else {
          const exTime = exBout.lastUpdated || 0;
          const incTime = incBout.lastUpdated || 0;
          if (incTime >= exTime) {
            boutMap.set(incBout.id, { ...exBout, ...incBout });
          } else {
            boutMap.set(incBout.id, { ...incBout, ...exBout });
          }
        }
      });
    }

    // 2. Merge brackets by lastUpdated timestamp
    const mergedBrackets = { ...(this.state.brackets || {}) };
    if (incoming.brackets) {
      for (const [boutId, incBr] of Object.entries(incoming.brackets)) {
        const exBr = mergedBrackets[boutId];
        if (!exBr) {
          mergedBrackets[boutId] = incBr;
        } else {
          const exTime = exBr.lastUpdated || 0;
          const incTime = incBr.lastUpdated || 0;
          if (incTime >= exTime) {
            mergedBrackets[boutId] = incBr;
          }
        }
      }
    }

    // 3. Merge Tatamis by lastUpdated timestamp & assignedBoutIds union
    const mergedTatamis = (this.state.tatamis || []).map((exTatami, idx) => {
      const incTatami = incoming.tatamis && (incoming.tatamis.find(t => t.id === exTatami.id) || incoming.tatamis[idx]);
      if (!incTatami) return exTatami;
      const exTime = exTatami.lastUpdated || 0;
      const incTime = incTatami.lastUpdated || 0;

      if (incTime > exTime) {
        return { ...exTatami, ...incTatami };
      } else if (exTime > incTime) {
        return { ...incTatami, ...exTatami };
      } else {
        const combinedAssigned = Array.from(new Set([
          ...(exTatami.assignedBoutIds || []),
          ...(incTatami.assignedBoutIds || [])
        ]));
        return {
          ...exTatami,
          ...incTatami,
          activeBoutId: exTatami.activeBoutId || incTatami.activeBoutId,
          assignedBoutIds: combinedAssigned
        };
      }
    });

    this.state = {
      ...this.state,
      ...incoming,
      bouts: Array.from(boutMap.values()),
      brackets: mergedBrackets,
      tatamis: mergedTatamis,
      lastUpdated: Math.max(this.state.lastUpdated || 0, incoming.lastUpdated || 0)
    };
  },

  initWebSocketSync() {
    try {
      if (typeof window === 'undefined' || window.location.protocol === 'file:' || !window.location.host) {
        return;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onmessage = (event) => {
        if (!event.data) return;
        if (event.data === 'RESET') {
          localStorage.removeItem(this.STORAGE_KEY);
          localStorage.removeItem('kumite_backup_snapshot');
          this.state = {
            tournamentInfo: {
              title: 'SHOTOKAN KARATE CHAMPIONSHIP',
              date: new Date().toISOString().split('T')[0],
              referees: ['Ref 1', 'Ref 2', 'Ref 3', 'Ref 4', 'Ref 5']
            },
            participants: [],
            bouts: [],
            brackets: {},
            tatamis: Array.from({ length: 8 }, (_, i) => ({
              id: i + 1,
              name: `Tatami ${i + 1}`,
              activeBoutId: null,
              activeMatchNumber: null,
              assignedBoutIds: [],
              status: 'Empty',
              lastUpdated: 0
            })),
            currentUser: this.state ? this.state.currentUser : null,
            lastUpdated: 0
          };
          this.notifyListeners();
          return;
        }
        try {
          const cloudData = JSON.parse(event.data);
          if (cloudData && (cloudData.bouts || cloudData.tatamis || cloudData.brackets)) {
            this.mergeState(cloudData);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
            this.notifyListeners();
          }
        } catch (e) {
          console.warn('WS JSON parse error:', e);
        }
      };

      ws.onclose = () => {
        this.ws = null;
        setTimeout(() => this.initWebSocketSync(), 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      console.warn('WebSocket init error:', e);
    }
  },

  async loadTatamiSyncFromAivenDB() {
    try {
      if (this.isPushing || this.isScoringActive || this.isEditingActive) return;

      const headers = {};
      if (this.lastTatamiEtag) {
        headers['If-None-Match'] = this.lastTatamiEtag;
      }

      const response = await fetch(this.TATAMI_API_URL, { headers });
      if (response.status === 304) {
        return; // Zero payload & zero DOM re-render overhead!
      }

      if (response.ok) {
        const etag = response.headers.get('ETag');
        if (etag) this.lastTatamiEtag = etag;
        const cloudData = await response.json();

        if (cloudData && cloudData.tatamis && Array.isArray(cloudData.tatamis)) {
          this.mergeState(cloudData);
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
          this.notifyListeners();
        }
      }
    } catch (err) {
      // Offline fallback
    }
  },

  async loadFromAivenDB() {
    try {
      // Skip pull if push is in-flight or bout scoring/editing is active
      if (this.isPushing || this.isScoringActive || this.isEditingActive) return;

      const headers = {};
      if (this.lastEtag) {
        headers['If-None-Match'] = this.lastEtag;
      }

      let cloudData = null;

      try {
        const response = await fetch(this.AIVEN_API_URL, { headers });
        if (response.status === 304) {
          return; // Data has not changed; zero payload & zero DOM re-render overhead!
        }

        if (response.ok) {
          const etag = response.headers.get('ETag');
          if (etag) this.lastEtag = etag;
          cloudData = await response.json();
        }
      } catch (e) {
        // Server fetch failed; fall through to GitHub Raw URL
      }

      // GitHub Raw Repo Fallback if Server is offline or empty
      if (!cloudData || !cloudData.bouts || cloudData.bouts.length === 0) {
        try {
          const ghRes = await fetch(this.GITHUB_RAW_URL + '?t=' + Date.now());
          if (ghRes.ok) {
            cloudData = await ghRes.json();
          }
        } catch (e) {}
      }

      if (cloudData && cloudData.bouts && Array.isArray(cloudData.bouts) && cloudData.bouts.length > 0) {
        this.mergeState(cloudData);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
        this.notifyListeners();
      }
    } catch (err) {
      // Offline fallback
    }
  },

  pushTatamiSyncToAivenDB() {
    if (!this.state || !this.state.tatamis) return;

    const payload = {
      tatamis: this.state.tatamis,
      bouts: (this.state.bouts || []).map(b => ({
        id: b.id,
        boutName: b.boutName,
        tatamiId: b.tatamiId,
        status: b.status,
        eventType: b.eventType,
        ageCategory: b.ageCategory,
        gender: b.gender,
        beltTier: b.beltTier,
        lastUpdated: b.lastUpdated || Date.now()
      })),
      lastUpdated: Date.now()
    };

    setTimeout(async () => {
      try {
        const res = await fetch(this.TATAMI_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const etag = res.headers.get('ETag');
          if (etag) this.lastTatamiEtag = etag;
        }
      } catch (err) {}
    }, 0);
  },

  pushToAivenDB() {
    if (!this.state || !this.state.bouts || this.state.bouts.length === 0) return;

    if (this.pendingPushTimeout) {
      clearTimeout(this.pendingPushTimeout);
    }

    this.pendingPushTimeout = setTimeout(async () => {
      this.pendingPushTimeout = null;
      try {
        this.isPushing = true;
        const res = await fetch(this.AIVEN_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.state)
        });
        if (res.ok) {
          const etag = res.headers.get('ETag');
          if (etag) this.lastEtag = etag;
        }
      } catch (err) {
        // Offline fallback
      } finally {
        this.isPushing = false;
      }
    }, 500);
  },

  async confirmResetDatabase() {
    if (confirm('Are you sure you want to clear all tournament data and reset the database? This action will clear all existing bout sheets.')) {
      await this.clearAllData();
      alert('Database and local tournament data cleared successfully! You can now upload your Excel file fresh.');
      location.reload();
    }
  },

  async clearAllData() {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem('kumite_backup_snapshot');
    this.state = {
      tournamentInfo: {
        title: 'SHOTOKAN KARATE CHAMPIONSHIP',
        date: new Date().toISOString().split('T')[0],
        referees: ['Ref 1', 'Ref 2', 'Ref 3', 'Ref 4', 'Ref 5']
      },
      participants: [],
      bouts: [],
      brackets: {},
      tatamis: Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `Tatami ${i + 1}`,
        activeBoutId: null,
        activeMatchNumber: null,
        assignedBoutIds: [],
        status: 'Empty'
      })),
      currentUser: this.state ? this.state.currentUser : null
    };
    this.notifyListeners();
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch (e) {}
  },

  subscribe(callback) {
    this.listeners.push(callback);
  },

  notifyListeners() {
    if (this.isScoringActive || this.isEditingActive) return; // Prevent background re-rendering while user is actively entering scores or editing
    this.listeners.forEach(cb => cb(this.state));
  },

  loadFromLocal() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.state = { ...this.state, ...parsed };

        if (this.state.tatamis && Array.isArray(this.state.tatamis)) {
          this.state.tatamis.forEach(t => {
            if (!t.assignedBoutIds || !Array.isArray(t.assignedBoutIds)) {
              t.assignedBoutIds = [];
            }
          });
        }

        if (this.state.brackets && typeof this.state.brackets === 'object') {
          Object.values(this.state.brackets).forEach(br => {
            if (br && (!br.medals || typeof br.medals !== 'object')) {
              br.medals = { gold: null, silver: null, bronze1: null, bronze2: null };
            }
          });
        }

        if (this.state.bouts) {
          this.state.bouts.forEach(b => this.checkBoutCompletion(b.id));
        }
      }
    } catch (e) {
      console.error('Failed to load local state:', e);
    }
  },

  saveToLocalOnly() {
    try {
      this.state.lastUpdated = Date.now();
      this.lastLocalEditTime = Date.now();

      const serialized = JSON.stringify(this.state);
      localStorage.setItem(this.STORAGE_KEY, serialized);
      if (this.state.bouts && this.state.bouts.length > 0) {
        localStorage.setItem('kumite_backup_snapshot', serialized);
      }
    } catch (e) {
      console.error('Failed to save local state:', e);
    }
  },

  async submitBoutToServer(boutId) {
    try {
      this.checkBoutCompletion(boutId);
      const bout = this.state.bouts.find(b => b.id === boutId);
      if (bout) {
        bout.lastUpdated = Date.now();
      }
      const bracket = this.state.brackets[boutId];
      if (bracket) {
        bracket.lastUpdated = Date.now();
      }

      this.stopBoutScoring();
      this.saveToLocal();
      await this.pushToAivenDB();
      this.broadcastStateToPeers();
      return true;
    } catch (e) {
      console.error('Error submitting bout to server:', e);
      return false;
    }
  },

  forcePushToDBAndTatamis() {
    if (!this.state || !this.state.bouts) return;

    const now = Date.now();
    this.state.lastUpdated = now;
    this.lastLocalEditTime = now;

    // 1. Instant local storage update & UI notification
    const serialized = JSON.stringify(this.state);
    localStorage.setItem(this.STORAGE_KEY, serialized);
    if (this.state.bouts && this.state.bouts.length > 0) {
      localStorage.setItem('kumite_backup_snapshot', serialized);
    }
    this.notifyListeners();

    // 2. Instant BroadcastChannel post (same machine, across all open browser tabs)
    if (this.syncChannel) {
      try {
        this.syncChannel.postMessage({ type: 'FORCE_UPDATE', state: this.state, timestamp: now });
      } catch (e) {}
    }

    // 3. Instant direct WebSocket send to server (relays to all connected devices in <1ms)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(serialized);
      } catch (e) {}
    }

    // 4. Instant HTTP POST pushes without 500ms debounce
    fetch(this.AIVEN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized
    }).catch(() => {});

    const tatamiPayload = {
      tatamis: this.state.tatamis,
      bouts: (this.state.bouts || []).map(b => ({
        id: b.id,
        boutName: b.boutName,
        tatamiId: b.tatamiId,
        status: b.status,
        eventType: b.eventType,
        ageCategory: b.ageCategory,
        gender: b.gender,
        beltTier: b.beltTier,
        lastUpdated: b.lastUpdated || now
      })),
      lastUpdated: now
    };

    fetch(this.TATAMI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tatamiPayload)
    }).catch(() => {});

    if (typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isInitialized && FirebaseConfig.db) {
      try {
        FirebaseConfig.db.ref('kumite_tournament_data_v1').set(this.state).catch(() => {});
      } catch (e) {}
    }
  },

  saveToLocal() {
    this.forcePushToDBAndTatamis();
  },

  setBoutsAndBrackets(bouts, brackets) {
    const now = Date.now();
    this.state.bouts = bouts.map(b => ({ ...b, lastUpdated: now }));
    this.state.brackets = {};
    for (const [k, v] of Object.entries(brackets)) {
      this.state.brackets[k] = { ...v, lastUpdated: now };
    }
    if (this.state.tatamis && Array.isArray(this.state.tatamis)) {
      this.state.tatamis.forEach(t => {
        t.activeBoutId = null;
        t.activeMatchNumber = null;
        t.assignedBoutIds = [];
        t.status = 'Empty';
        t.lastUpdated = now;
      });
    }
    this.saveToLocal();
  },

  addNewBout(bout, bracket) {
    if (!this.state.bouts) this.state.bouts = [];
    if (!this.state.brackets) this.state.brackets = {};

    const now = Date.now();
    bout.lastUpdated = now;
    bracket.lastUpdated = now;

    this.state.bouts.push(bout);
    this.state.brackets[bout.id] = bracket;

    if (bout.tatamiId && this.state.tatamis) {
      const tatami = this.state.tatamis.find(t => t.id === bout.tatamiId);
      if (tatami) {
        if (!tatami.assignedBoutIds) tatami.assignedBoutIds = [];
        if (!tatami.assignedBoutIds.includes(bout.id)) {
          tatami.assignedBoutIds.push(bout.id);
        }
        tatami.lastUpdated = now;
      }
    }

    this.saveToLocal();
  },

  assignBoutToTatami(tatamiId, boutId) {
    if (!tatamiId || !boutId) return;
    const numericTatamiId = parseInt(tatamiId, 10);
    const now = Date.now();

    const tatami = this.state.tatamis.find(t => t.id === numericTatamiId);
    if (!tatami) return;

    // Clean up assignment from any previous tatami
    this.state.tatamis.forEach(t => {
      if (t.assignedBoutIds && Array.isArray(t.assignedBoutIds)) {
        const idx = t.assignedBoutIds.indexOf(boutId);
        if (idx !== -1 && t.id !== numericTatamiId) {
          t.assignedBoutIds.splice(idx, 1);
          t.lastUpdated = now;
        }
      }
      if (t.id !== numericTatamiId && t.activeBoutId === boutId) {
        t.activeBoutId = null;
        t.activeMatchNumber = null;
        t.status = 'Empty';
        t.lastUpdated = now;
      }
    });

    if (!tatami.assignedBoutIds || !Array.isArray(tatami.assignedBoutIds)) {
      tatami.assignedBoutIds = [];
    }

    if (tatami.assignedBoutIds.indexOf(boutId) === -1) {
      tatami.assignedBoutIds.push(boutId);
    }
    tatami.lastUpdated = now;

    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout) {
      bout.tatamiId = numericTatamiId;
      if (bout.status !== 'Completed') {
        bout.status = 'Assigned';
      }
      bout.lastUpdated = now;
    }

    const bracket = this.state.brackets[boutId];
    if (bracket) {
      bracket.tatamiId = numericTatamiId;
      bracket.lastUpdated = now;
    }

    this.saveToLocal();
    this.pushTatamiSyncToAivenDB();
  },

  unassignBoutFromTatami(boutId) {
    const now = Date.now();
    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout) {
      const oldTatamiId = bout.tatamiId;
      bout.tatamiId = null;
      if (bout.status === 'Assigned') {
        bout.status = 'Pending';
      }
      bout.lastUpdated = now;
      if (oldTatamiId) {
        const tatami = this.state.tatamis.find(t => t.id === oldTatamiId);
        if (tatami) {
          tatami.lastUpdated = now;
          if (tatami.assignedBoutIds) {
            const idx = tatami.assignedBoutIds.indexOf(boutId);
            if (idx !== -1) tatami.assignedBoutIds.splice(idx, 1);
          }
          if (tatami.activeBoutId === boutId) {
            tatami.activeBoutId = null;
            tatami.activeMatchNumber = null;
            tatami.status = 'Empty';
          }
        }
      }
    }
    const bracket = this.state.brackets[boutId];
    if (bracket) {
      bracket.tatamiId = null;
      bracket.lastUpdated = now;
    }
    this.saveToLocal();
    this.pushTatamiSyncToAivenDB();
  },

  setActiveTatamiMatch(tatamiId, boutId, matchNumber) {
    const numericTatamiId = parseInt(tatamiId, 10);
    const tatami = this.state.tatamis.find(t => t.id === numericTatamiId);
    if (!tatami) return;

    const now = Date.now();
    tatami.activeBoutId = boutId;
    tatami.activeMatchNumber = matchNumber;
    tatami.status = boutId ? 'Active' : 'Empty';
    tatami.lastUpdated = now;

    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout && bout.status !== 'Completed') {
      bout.status = 'In Progress';
      bout.lastUpdated = now;
    }

    const bracket = this.state.brackets[boutId];
    if (bracket) {
      bracket.lastUpdated = now;
    }

    this.saveToLocal();
    this.pushTatamiSyncToAivenDB();
  },

  // Check and update if an entire bout sheet is completed
  checkBoutCompletion(boutId) {
    const bout = this.state.bouts.find(b => b.id === boutId);
    const bracket = this.state.brackets[boutId];
    if (!bout || !bracket) return;

    const prevStatus = bout.status;

    if (bracket.eventType === 'Kata') {
      const activeScored = bracket.competitors.filter(c => c.totalScore > 0);
      const allScored = activeScored.length > 0 && activeScored.length === bracket.competitors.length;
      const isFlagPending = bracket.tieBreaker && bracket.tieBreaker.flagVote && !bracket.tieBreaker.flagVote.winnerId;
      const isRescorePending = bracket.tieBreaker && bracket.tieBreaker.rescoreRound && bracket.tieBreaker.rescoreRound.competitors.some(c => c.totalScore === 0);

      if (allScored && !isFlagPending && !isRescorePending) {
        bout.status = 'Completed';
      } else {
        bout.status = activeScored.length > 0 ? 'In Progress' : (bout.tatamiId ? 'Assigned' : 'Pending');
      }
      if (prevStatus !== bout.status) bout.lastUpdated = Date.now();
      return;
    }

    const finalMatch = bracket.matches ? bracket.matches[14] : null; // Match #15 (Final)
    const allMatchesResolved = bracket.matches && bracket.matches.every(m => m.status === 'Completed' || m.status === 'Empty');

    if ((finalMatch && finalMatch.status === 'Completed') || allMatchesResolved) {
      bout.status = 'Completed';
    } else {
      const anyStarted = bracket.matches && bracket.matches.some(m => m.status === 'Completed');
      bout.status = anyStarted ? 'In Progress' : (bout.tatamiId ? 'Assigned' : 'Pending');
    }

    if (prevStatus !== bout.status) bout.lastUpdated = Date.now();
  },

  commitMatchResult(boutId, matchNumber, winnerSide, matchScore) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;

    const now = Date.now();
    BracketEngine.updateMatchResult(bracket, matchNumber, winnerSide, matchScore);
    bracket.lastUpdated = now;

    this.checkBoutCompletion(boutId);

    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout) bout.lastUpdated = now;
    const isBoutDone = bout && bout.status === 'Completed';

    this.state.tatamis.forEach(tatami => {
      if (tatami.activeBoutId === boutId && tatami.activeMatchNumber === matchNumber) {
        const nextMatch = bracket.matches.find(m => m.status === 'Scheduled');
        if (nextMatch) {
          tatami.activeMatchNumber = nextMatch.matchNumber;
        } else {
          tatami.activeMatchNumber = null;
          if (isBoutDone) tatami.activeBoutId = null;
        }
        tatami.status = tatami.activeBoutId ? 'Active' : 'Empty';
        tatami.lastUpdated = now;
      }
    });

    this.saveToLocal();
  },

  // --- BOUT & SLOT MANIPULATION HELPERS ---

  swapBracketSlots(boutId, slotIndexA, slotIndexB) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;
    const bout = (this.state.bouts || []).find(b => b.id === boutId);

    const temp = bracket.slots[slotIndexA];
    bracket.slots[slotIndexA] = bracket.slots[slotIndexB];
    bracket.slots[slotIndexB] = temp;

    const now = Date.now();
    bracket.lastUpdated = now;
    if (bout) bout.lastUpdated = now;

    this.rebuildRound1Matches(bracket);
    this.checkBoutCompletion(boutId);

    if (this.isEditingActive) {
      this.saveToLocalOnly();
    } else {
      this.saveToLocal();
    }
  },

  updateSlotParticipant(boutId, slotIndex, participantData) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;
    const bout = (this.state.bouts || []).find(b => b.id === boutId);

    if (!participantData) {
      bracket.slots[slotIndex] = null;
    } else {
      const p = {
        id: participantData.id || ('p_' + Math.random().toString(36).substr(2, 9)),
        name: participantData.name,
        gender: participantData.gender || bracket.gender,
        age: participantData.age || 10,
        belt: participantData.belt || 9,
        beltLabel: participantData.beltLabel || 'White',
        branch: participantData.branch || 'Dojo',
        instructor: participantData.instructor || '',
        schoolHours: participantData.schoolHours || false
      };
      bracket.slots[slotIndex] = p;
    }

    const now = Date.now();
    bracket.lastUpdated = now;
    if (bout) bout.lastUpdated = now;

    this.rebuildRound1Matches(bracket);
    this.checkBoutCompletion(boutId);

    if (this.isEditingActive) {
      this.saveToLocalOnly();
    } else {
      this.saveToLocal();
    }
  },

  moveParticipantToBout(sourceBoutId, sourceSlotIdx, targetBoutId, targetSlotIdx) {
    const sourceBracket = this.state.brackets[sourceBoutId];
    const targetBracket = this.state.brackets[targetBoutId];

    if (!sourceBracket || !targetBracket) return;

    const sourceBout = (this.state.bouts || []).find(b => b.id === sourceBoutId);
    const targetBout = (this.state.bouts || []).find(b => b.id === targetBoutId);

    const movingParticipant = sourceBracket.slots[sourceSlotIdx];
    const occupantTarget = targetBracket.slots[targetSlotIdx];

    sourceBracket.slots[sourceSlotIdx] = occupantTarget;
    targetBracket.slots[targetSlotIdx] = movingParticipant;

    const now = Date.now();
    sourceBracket.lastUpdated = now;
    targetBracket.lastUpdated = now;
    if (sourceBout) sourceBout.lastUpdated = now;
    if (targetBout) targetBout.lastUpdated = now;

    this.rebuildRound1Matches(sourceBracket);
    this.rebuildRound1Matches(targetBracket);
    this.checkBoutCompletion(sourceBoutId);
    this.checkBoutCompletion(targetBoutId);

    if (this.isEditingActive) {
      this.saveToLocalOnly();
    } else {
      this.saveToLocal();
    }
  },

  rebuildRound1Matches(bracket) {
    for (let i = 0; i < 8; i++) {
      const aao = bracket.slots[i * 2];
      const aka = bracket.slots[i * 2 + 1];
      const match = bracket.matches[i];

      if (match.status !== 'Completed') {
        match.aao = aao;
        match.aka = aka;
        match.winner = null;
        match.loser = null;
        match.status = (aao || aka) ? 'Scheduled' : 'Empty';
      }
    }

    BracketEngine.propagateWinners(bracket);
  },

  // --- DATA BACKUP & RESTORE HELPERS ---

  exportJsonBackup() {
    if (!this.state.bouts || this.state.bouts.length === 0) {
      return alert('No tournament data to backup!');
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Shotokan_Tournament_Backup_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  },

  importJsonBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported && imported.bouts && Array.isArray(imported.bouts)) {
          this.state = { ...this.state, ...imported };
          this.saveToLocal();
          alert(`Successfully imported backup! ${imported.bouts.length} Bout sheets loaded.`);
          window.location.reload();
        } else {
          alert('Invalid tournament backup file.');
        }
      } catch (err) {
        alert('Failed to parse backup JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  restoreAutoBackup() {
    const rawBackup = localStorage.getItem('kumite_backup_snapshot');
    if (!rawBackup) {
      return alert('No auto-backup snapshot found in browser storage.');
    }
    try {
      const parsed = JSON.parse(rawBackup);
      if (parsed && parsed.bouts && parsed.bouts.length > 0) {
        this.state = { ...this.state, ...parsed };
        this.saveToLocal();
        alert(`Restored ${parsed.bouts.length} bout sheets from auto-backup snapshot!`);
        window.location.reload();
      } else {
        alert('Auto-backup snapshot is empty.');
      }
    } catch (e) {
      alert('Failed to restore auto-backup: ' + e.message);
    }
  },

  clearAllData() {
    if (confirm('Are you sure you want to erase all current tournament data and reset?')) {
      this.state.participants = [];
      this.state.bouts = [];
      this.state.brackets = {};
      this.state.tatamis.forEach(t => {
        t.activeBoutId = null;
        t.activeMatchNumber = null;
        t.assignedBoutIds = [];
        t.status = 'Empty';
      });
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem('kumite_backup_snapshot');
      this.notifyListeners();
      this.broadcastStateToPeers();
      alert('All tournament data has been cleared!');
      window.location.reload();
    }
  },

  // --- PEERJS REAL-TIME ROOM SYNC ---

  openSyncModal() {
    const currentRoom = this.activeRoomCode || localStorage.getItem('kumite_active_room_code') || '';
    const isConnected = this.peer && !this.peer.destroyed;
    const statusText = isConnected ? `Connected to Room: ${currentRoom}` : 'Disconnected / Offline';

    const modalHtml = `
      <div class="modal fade" id="syncRoomModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content shadow-lg border-2 border-info">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title fw-bold">🌐 Multi-Device Live Room Sync</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
              <div class="alert alert-info py-2 small mb-3">
                <strong>Current Status:</strong> <span id="modalSyncStatus" class="fw-bold">${statusText}</span>
              </div>
              
              <div class="mb-4">
                <label class="form-label fw-bold">Enter Room Code to Join / Re-connect (Organizer or Tatami):</label>
                <div class="input-group">
                  <input type="text" id="joinRoomCodeInput" class="form-control text-uppercase fw-bold text-primary" value="${currentRoom}" placeholder="e.g. KUMITE-4821">
                  <button class="btn btn-success fw-bold" onclick="SyncService.joinPeerRoom()">⚡ Join / Re-connect Room</button>
                </div>
                <small class="text-muted">Both Organizer and Tatami laptops/phones can enter the same Room Code to sync live.</small>
              </div>

              <hr>

              <div class="mb-4">
                <label class="form-label fw-bold">Or 1-Click Create New Room Code:</label>
                <div class="input-group mb-2">
                  <input type="text" id="generatedRoomInput" class="form-control fw-bold text-primary" value="${currentRoom}" readonly placeholder="Click Create Room below">
                  <button class="btn btn-outline-secondary" onclick="SyncService.copyRoomCode()">📋 Copy</button>
                </div>
                <button class="btn btn-primary w-100 fw-bold" onclick="SyncService.createHostRoom()">✨ Create New Room Code</button>
              </div>

              <hr>
              <button class="btn btn-outline-danger btn-sm w-100 fw-bold" onclick="SyncService.clearAllData()">🗑️ Reset / Erase Local Tournament Data</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    const modal = new bootstrap.Modal(document.getElementById('syncRoomModal'));
    modal.show();
  },

  createHostRoom() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const roomCode = `KUMITE-${randomNum}`;
    const input = document.getElementById('generatedRoomInput');
    if (input) input.value = roomCode;
    const joinInput = document.getElementById('joinRoomCodeInput');
    if (joinInput) joinInput.value = roomCode;
    this.initRoomSync(roomCode);
  },

  joinPeerRoom() {
    const input = document.getElementById('joinRoomCodeInput').value.trim().toUpperCase();
    if (!input) return alert('Please enter a valid Room Code!');
    this.initRoomSync(input);
    const modalEl = document.getElementById('syncRoomModal');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
  },

  copyRoomCode() {
    const input = document.getElementById('generatedRoomInput') || document.getElementById('joinRoomCodeInput');
    if (input && input.value) {
      navigator.clipboard.writeText(input.value);
      alert('Room Code copied to clipboard: ' + input.value);
    }
  },

  initRoomSync(roomCode) {
    if (typeof Peer === 'undefined') return;

    if (this.peer) {
      try { this.peer.destroy(); } catch(e) {}
    }

    this.activeRoomCode = roomCode;
    localStorage.setItem('kumite_active_room_code', roomCode);

    const safeRoomId = roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');
    const myPeerId = `peer-${safeRoomId}-${Math.random().toString(36).substr(2, 6)}`;
    
    try {
      this.peer = new Peer(myPeerId);

      this.peer.on('open', (id) => {
        this.updateSyncBadge(`🌐 Room: ${roomCode}`, true);
        
        // Register active peer ID in local/storage registry & connect to peers
        this.registerAndConnectRoomPeers(safeRoomId, myPeerId);
      });

      this.peer.on('connection', (conn) => {
        this.setupConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.warn('PeerJS Room Sync Notice:', err);
        // Fallback to state badge
        this.updateSyncBadge(`🌐 Room: ${roomCode} (Connecting...)`, false);
      });
    } catch (err) {
      console.warn('PeerJS init error:', err);
    }
  },

  registerAndConnectRoomPeers(safeRoomId, myPeerId) {
    const storageKey = `kumite_room_peers_${safeRoomId}`;
    let existingPeers = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) existingPeers = JSON.parse(raw);
    } catch(e) {}

    if (!Array.isArray(existingPeers)) existingPeers = [];
    
    // Connect to all existing room peers
    existingPeers.forEach(peerId => {
      if (peerId !== myPeerId) {
        try {
          const conn = this.peer.connect(peerId);
          this.setupConnection(conn);
        } catch(e) {}
      }
    });

    // Add my peerId to registry
    if (existingPeers.indexOf(myPeerId) === -1) {
      existingPeers.push(myPeerId);
      // Keep only recent 10 active peers to save space
      if (existingPeers.length > 10) existingPeers = existingPeers.slice(-10);
      try {
        localStorage.setItem(storageKey, JSON.stringify(existingPeers));
      } catch(e) {}
    }

    // Also connect to primary host fallback ID if available
    try {
      const hostConn = this.peer.connect(`host-${safeRoomId}`);
      this.setupConnection(hostConn);
    } catch(e) {}
  },

  setupConnection(conn) {
    if (!conn) return;

    if (this.peerConnections.indexOf(conn) === -1) {
      this.peerConnections.push(conn);
    }

    conn.on('open', () => {
      this.updateSyncBadge(`🌐 Room: ${this.activeRoomCode} (Active)`, true);
      if (this.state.bouts && this.state.bouts.length > 0) {
        conn.send({ type: 'SYNC_FULL_STATE', state: this.state });
      } else {
        conn.send({ type: 'REQUEST_LATEST_STATE' });
      }
    });

    conn.on('data', (payload) => {
      if (!payload || !payload.type) return;

      if (payload.type === 'SYNC_FULL_STATE' && payload.state) {
        if (payload.state.bouts && payload.state.bouts.length > 0) {
          this.state = { ...this.state, ...payload.state };
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
          this.notifyListeners();
        }
      } else if (payload.type === 'REQUEST_LATEST_STATE') {
        if (this.state.bouts && this.state.bouts.length > 0) {
          conn.send({ type: 'SYNC_FULL_STATE', state: this.state });
        }
      }
    });

    conn.on('close', () => {
      this.peerConnections = this.peerConnections.filter(c => c !== conn);
    });
  },

  broadcastStateToPeers() {
    if (this.peerConnections && this.peerConnections.length > 0) {
      this.peerConnections.forEach(conn => {
        if (conn && conn.open) {
          try {
            conn.send({ type: 'SYNC_FULL_STATE', state: this.state });
          } catch(e) {}
        }
      });
    }
  },

  updateSyncBadge(text, isOnline) {
    const badge = document.getElementById('syncBadge');
    if (badge) {
      badge.innerText = text;
      badge.className = isOnline ? 'badge bg-success fs-6' : 'badge bg-secondary fs-6';
    }
  }
};

window.SyncService = SyncService;
