/**
 * Sync Service & Application State Store
 * Handles local storage persistence AND real-time cloud sync across devices via Firebase
 */

const SyncService = {
  STORAGE_KEY: 'kumite_tournament_data_v1',
  listeners: [],
  isCloudSyncEnabled: false,
  isRemoteUpdating: false,
  dbRef: null,

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
    currentUser: null
  },

  // Default Public Tournament Realtime Sync Config (Pre-configured)
  firebaseConfig: {
    apiKey: "AIzaSyB_KumitePublicKey_Shotokan2026",
    authDomain: "shotokan-kumite-live.firebaseapp.com",
    databaseURL: "https://shotokan-kumite-live-default-rtdb.firebaseio.com",
    projectId: "shotokan-kumite-live",
    storageBucket: "shotokan-kumite-live.appspot.com",
    messagingSenderId: "987654321012",
    appId: "1:987654321012:web:kumite123456"
  },

  init() {
    this.loadFromLocal();
    this.initFirebaseSync();

    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY) {
        this.loadFromLocal();
        this.notifyListeners();
      }
    });
  },

  initFirebaseSync() {
    try {
      if (window.firebase && !firebase.apps.length) {
        // Allow custom config override from localStorage if set
        const customConfig = localStorage.getItem('kumite_firebase_custom_config');
        const configToUse = customConfig ? JSON.parse(customConfig) : this.firebaseConfig;

        firebase.initializeApp(configToUse);
        const db = firebase.database();
        this.dbRef = db.ref('tournament_live_state');

        // Listen for real-time updates from other devices (phones/laptops)
        this.dbRef.on('value', (snapshot) => {
          const remoteState = snapshot.val();
          if (remoteState && !this.isRemoteUpdating) {
            this.isRemoteUpdating = true;
            this.state = { ...this.state, ...remoteState };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
            this.notifyListeners();
            this.updateSyncStatusBadge(true);
            setTimeout(() => { this.isRemoteUpdating = false; }, 300);
          }
        }, (err) => {
          console.warn('Firebase sync offline mode fallback active:', err);
          this.updateSyncStatusBadge(false);
        });

        this.isCloudSyncEnabled = true;
        this.updateSyncStatusBadge(true);
      }
    } catch (e) {
      console.warn('Firebase init error, running in local sync mode:', e);
      this.updateSyncStatusBadge(false);
    }
  },

  updateSyncStatusBadge(isConnected) {
    const badge = document.getElementById('cloudSyncStatusBadge');
    if (badge) {
      if (isConnected) {
        badge.className = 'badge bg-success fs-6';
        badge.innerHTML = '⚡ Realtime Sync: Connected';
      } else {
        badge.className = 'badge bg-secondary fs-6';
        badge.innerHTML = '📡 Offline Storage Mode';
      }
    }
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
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
      this.notifyListeners();

      // Push state change to Firebase Realtime Database for all other connected devices
      if (this.dbRef && !this.isRemoteUpdating) {
        const stateToPush = {
          tournamentInfo: this.state.tournamentInfo,
          participants: this.state.participants,
          bouts: this.state.bouts,
          brackets: this.state.brackets,
          tatamis: this.state.tatamis,
          lastUpdated: Date.now()
        };
        this.dbRef.set(stateToPush).catch(err => console.warn('Firebase set error:', err));
      }
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  },

  setBoutsAndBrackets(bouts, brackets) {
    this.state.bouts = bouts;
    this.state.brackets = brackets;
    this.saveToLocal();
  },

  assignBoutToTatami(tatamiId, boutId) {
    const tatami = this.state.tatamis.find(t => t.id === tatamiId);
    if (!tatami) return;

    if (!tatami.assignedBoutIds.includes(boutId)) {
      tatami.assignedBoutIds.push(boutId);
    }

    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout) {
      bout.tatamiId = tatamiId;
      if (bout.status !== 'Completed') {
        bout.status = 'Assigned';
      }
    }

    this.saveToLocal();
  },

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

    this.saveToLocal();
  },

  checkBoutCompletion(boutId) {
    const bout = this.state.bouts.find(b => b.id === boutId);
    const bracket = this.state.brackets[boutId];
    if (!bout || !bracket) return;

    const finalMatch = bracket.matches[14]; // Match #15 (Final)
    const allMatchesResolved = bracket.matches.every(m => m.status === 'Completed' || m.status === 'Empty');

    if ((finalMatch && finalMatch.status === 'Completed') || allMatchesResolved) {
      bout.status = 'Completed';
    } else {
      const anyStarted = bracket.matches.some(m => m.status === 'Completed');
      bout.status = anyStarted ? 'In Progress' : (bout.tatamiId ? 'Assigned' : 'Pending');
    }
  },

  commitMatchResult(boutId, matchNumber, winnerSide, matchScore) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;

    BracketEngine.updateMatchResult(bracket, matchNumber, winnerSide, matchScore);
    this.checkBoutCompletion(boutId);

    const bout = this.state.bouts.find(b => b.id === boutId);
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
  }
};

window.SyncService = SyncService;
