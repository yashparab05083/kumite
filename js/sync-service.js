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
  GITHUB_RAW_URL: 'https://raw.githubusercontent.com/yashparab05083/kumite/main/tournament_data.json',

  init() {
    this.loadFromLocal();
    this.loadFromAivenDB();
    this.initWebSocketSync();
    
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

    // Periodic 5-second background poll for multi-device live sync
    setInterval(() => {
      this.loadFromAivenDB();
    }, 5000);

    // Firebase Cloud Sync (Only merges if valid cloud bouts exist)
    if (typeof FirebaseConfig !== 'undefined') {
      FirebaseConfig.init();
      if (FirebaseConfig.isInitialized && FirebaseConfig.db) {
        try {
          const tournamentRef = FirebaseConfig.db.ref('kumite_tournament_data_v1');
          tournamentRef.on('value', (snapshot) => {
            const cloudData = snapshot.val();
            if (cloudData && cloudData.bouts && Array.isArray(cloudData.bouts) && cloudData.bouts.length > 0) {
              this.state = { ...this.state, ...cloudData };
              this.saveToLocal();
            }
          });
        } catch (err) {
          console.warn('Firebase cloud sync listener error:', err);
        }
      }
    }
  },

  initWebSocketSync() {
    try {
      if (typeof window === 'undefined' || window.location.protocol === 'file:' || !window.location.host) {
        return;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);

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
          if (cloudData && cloudData.bouts && Array.isArray(cloudData.bouts) && cloudData.bouts.length > 0) {
            this.state = { ...this.state, ...cloudData };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
            this.notifyListeners();
          }
        } catch (e) {
          console.warn('WS JSON parse error:', e);
        }
      };

      ws.onclose = () => {
        setTimeout(() => this.initWebSocketSync(), 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      console.warn('WebSocket init error:', e);
    }
  },

  async loadFromAivenDB() {
    try {
      // Skip pull if local edit happened within last 4 seconds or a push is in-flight
      if (this.isPushing || (this.lastLocalEditTime && (Date.now() - this.lastLocalEditTime < 4000))) {
        return;
      }

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
        this.state = { ...this.state, ...cloudData };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
        this.notifyListeners();
      }
    } catch (err) {
      // Offline fallback
    }
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

  saveToLocal() {
    try {
      this.state.lastUpdated = Date.now();
      this.lastLocalEditTime = Date.now();

      const serialized = JSON.stringify(this.state);
      localStorage.setItem(this.STORAGE_KEY, serialized);
      // Secondary auto-backup snapshot safeguard
      if (this.state.bouts && this.state.bouts.length > 0) {
        localStorage.setItem('kumite_backup_snapshot', serialized);
      }

      // Notify UI listeners immediately for instant UI responsiveness
      this.notifyListeners();

      // Dispatch network pushes asynchronously to prevent UI thread blocking
      setTimeout(() => {
        this.broadcastStateToPeers();
        this.pushToAivenDB();

        if (typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isInitialized && FirebaseConfig.db) {
          try {
            FirebaseConfig.db.ref('kumite_tournament_data_v1').set(this.state).catch(err => {
              console.warn('Firebase cloud sync push error:', err);
            });
          } catch (e) {}
        }
      }, 0);
    } catch (e) {
      console.error('Failed to save local state:', e);
    }
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

    const temp = bracket.slots[slotIndexA];
    bracket.slots[slotIndexA] = bracket.slots[slotIndexB];
    bracket.slots[slotIndexB] = temp;

    this.rebuildRound1Matches(bracket);
    this.checkBoutCompletion(boutId);
    this.saveToLocal();
  },

  updateSlotParticipant(boutId, slotIndex, participantData) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;

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

    this.rebuildRound1Matches(bracket);
    this.checkBoutCompletion(boutId);
    this.saveToLocal();
  },

  moveParticipantToBout(sourceBoutId, sourceSlotIdx, targetBoutId, targetSlotIdx) {
    const sourceBracket = this.state.brackets[sourceBoutId];
    const targetBracket = this.state.brackets[targetBoutId];

    if (!sourceBracket || !targetBracket) return;

    const movingParticipant = sourceBracket.slots[sourceSlotIdx];
    const occupantTarget = targetBracket.slots[targetSlotIdx];

    sourceBracket.slots[sourceSlotIdx] = occupantTarget;
    targetBracket.slots[targetSlotIdx] = movingParticipant;

    this.rebuildRound1Matches(sourceBracket);
    this.rebuildRound1Matches(targetBracket);
    this.checkBoutCompletion(sourceBoutId);
    this.checkBoutCompletion(targetBoutId);
    this.saveToLocal();
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
