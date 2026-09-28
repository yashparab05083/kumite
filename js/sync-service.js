/**
 * Sync Service & Realtime Cloud Engine (Firebase Realtime Database)
 * Syncs tournament state across multiple laptops/tablets in real-time
 */

const SyncService = {
  STORAGE_KEY: 'kumite_tournament_data_v1',
  ROOM_KEY: 'kumite_cloud_room_id',
  FIREBASE_CONFIG_KEY: 'kumite_firebase_config',

  listeners: [],
  dbRef: null,
  isRemoteUpdating: false,
  roomId: 'SHOTOKAN_2026',

  // Default initial state
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
    currentUser: {
      role: 'organizer',
      tatamiId: null
    }
  },

  init() {
    this.loadFromLocal();
    
    // Load Room ID
    const savedRoom = localStorage.getItem(this.ROOM_KEY);
    if (savedRoom) this.roomId = savedRoom;

    // Initialize Firebase Realtime Sync if available
    this.initFirebase();

    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY) {
        this.loadFromLocal();
        this.notifyListeners();
      }
    });
  },

  initFirebase() {
    try {
      let firebaseConfig = null;
      const savedConfig = localStorage.getItem(this.FIREBASE_CONFIG_KEY);
      
      if (savedConfig) {
        firebaseConfig = JSON.parse(savedConfig);
      } else {
        // Default public Firebase fallback config for out-of-the-box multi-device sync
        firebaseConfig = {
          databaseURL: "https://kumite-shotokan-default-rtdb.firebaseio.com"
        };
      }

      if (window.firebase && firebaseConfig && firebaseConfig.databaseURL) {
        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }
        
        const db = firebase.database();
        this.dbRef = db.ref('tournaments/' + this.roomId);

        // Listen for live cloud changes from other laptops/tablets
        this.dbRef.on('value', (snapshot) => {
          const val = snapshot.val();
          if (val) {
            this.isRemoteUpdating = true;
            this.state = { ...this.state, ...val };
            this.saveToLocal(false); // Save locally without echoing back to cloud
            this.notifyListeners();
            this.updateCloudStatusUI('connected');
            this.isRemoteUpdating = false;
          }
        }, (err) => {
          console.warn('Firebase sync error:', err);
          this.updateCloudStatusUI('offline');
        });
      }
    } catch (e) {
      console.warn('Firebase init error, using local mode:', e);
      this.updateCloudStatusUI('offline');
    }
  },

  updateCloudStatusUI(status) {
    const statusEl = document.getElementById('cloudSyncStatusBadge');
    if (!statusEl) return;

    if (status === 'connected') {
      statusEl.className = 'badge bg-success fs-6';
      statusEl.innerHTML = `🟢 Cloud Syncing: <b>${this.roomId}</b>`;
    } else {
      statusEl.className = 'badge bg-secondary fs-6';
      statusEl.innerHTML = `⚪ Local Syncing: <b>${this.roomId}</b>`;
    }
  },

  setCloudRoom(newRoomId, customFirebaseConfig) {
    this.roomId = newRoomId.trim().toUpperCase() || 'SHOTOKAN_2026';
    localStorage.setItem(this.ROOM_KEY, this.roomId);

    if (customFirebaseConfig) {
      localStorage.setItem(this.FIREBASE_CONFIG_KEY, JSON.stringify(customFirebaseConfig));
    }

    if (this.dbRef) {
      this.dbRef.off();
    }
    
    this.initFirebase();
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
      }
    } catch (e) {
      console.error('Failed to load local state:', e);
    }
  },

  saveToLocal(syncToCloud = true) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
      
      // Push to Cloud Firebase Realtime DB if enabled and not triggered by incoming remote update
      if (syncToCloud && this.dbRef && !this.isRemoteUpdating) {
        this.dbRef.set(this.state).catch(err => console.warn('Cloud write failed:', err));
      }

      this.notifyListeners();
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  },

  // Export 100% complete Tournament Data Backup JSON
  exportBackupJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Tournament_Backup_${this.roomId}_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  },

  // Import / Restore Tournament Data Backup JSON
  importBackupJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedState = JSON.parse(e.target.result);
          if (importedState && importedState.bouts && importedState.brackets) {
            this.state = { ...this.state, ...importedState };
            this.saveToLocal(true);
            resolve(true);
          } else {
            reject('Invalid tournament backup JSON format!');
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  },

  // Save imported participants & generated bouts
  setBoutsAndBrackets(bouts, brackets) {
    this.state.bouts = bouts;
    this.state.brackets = brackets;
    this.saveToLocal(true);
  },

  // Assign a bout sheet to a Tatami ring
  assignBoutToTatami(tatamiId, boutId) {
    const tatami = this.state.tatamis.find(t => t.id === tatamiId);
    if (!tatami) return;

    if (!tatami.assignedBoutIds.includes(boutId)) {
      tatami.assignedBoutIds.push(boutId);
    }

    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout) {
      bout.tatamiId = tatamiId;
      bout.status = 'Assigned';
    }

    this.saveToLocal(true);
  },

  // Set active match on a Tatami
  setActiveTatamiMatch(tatamiId, boutId, matchNumber) {
    const tatami = this.state.tatamis.find(t => t.id === tatamiId);
    if (!tatami) return;

    tatami.activeBoutId = boutId;
    tatami.activeMatchNumber = matchNumber;
    tatami.status = boutId ? 'Active' : 'Empty';

    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout && bout.status !== 'Completed') {
      bout.status = 'In Progress';
    }

    this.saveToLocal(true);
  },

  // Commit completed match result
  commitMatchResult(boutId, matchNumber, winnerSide, matchScore) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;

    BracketEngine.updateMatchResult(bracket, matchNumber, winnerSide, matchScore);

    const allMatchesDone = bracket.matches.every(m => m.status === 'Completed');
    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout) {
      if (allMatchesDone) {
        bout.status = 'Completed';
      }
    }

    this.state.tatamis.forEach(tatami => {
      if (tatami.activeBoutId === boutId && tatami.activeMatchNumber === matchNumber) {
        const nextMatch = bracket.matches.find(m => m.status === 'Scheduled');
        if (nextMatch) {
          tatami.activeMatchNumber = nextMatch.matchNumber;
        } else {
          tatami.activeMatchNumber = null;
          if (allMatchesDone) tatami.activeBoutId = null;
        }
        tatami.status = tatami.activeBoutId ? 'Active' : 'Empty';
      }
    });

    this.saveToLocal(true);
  },

  // Update participant position manually in bracket
  swapBracketSlots(boutId, slotIndexA, slotIndexB) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;

    const temp = bracket.slots[slotIndexA];
    bracket.slots[slotIndexA] = bracket.slots[slotIndexB];
    bracket.slots[slotIndexB] = temp;

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
    this.saveToLocal(true);
  }
};

window.SyncService = SyncService;
