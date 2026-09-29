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

  init() {
    this.loadFromLocal();
    
    // Listen for tab sync on same device
    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY) {
        this.loadFromLocal();
        this.notifyListeners();
      }
    });

    // Initialize Firebase Realtime Cloud Sync across multiple laptops/devices
    if (typeof FirebaseConfig !== 'undefined') {
      FirebaseConfig.init();
      if (FirebaseConfig.isInitialized && FirebaseConfig.db) {
        try {
          const tournamentRef = FirebaseConfig.db.ref('kumite_tournament_data_v1');
          tournamentRef.on('value', (snapshot) => {
            const cloudData = snapshot.val();
            if (cloudData) {
              this.state = { ...this.state, ...cloudData };
              try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
              } catch(err) {}
              this.notifyListeners();
            }
          });
        } catch (err) {
          console.warn('Firebase cloud sync listener error:', err);
        }
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

        if (this.state.tatamis && Array.isArray(this.state.tatamis)) {
          this.state.tatamis.forEach(t => {
            if (!t.assignedBoutIds || !Array.isArray(t.assignedBoutIds)) {
              t.assignedBoutIds = [];
            }
          });
        }

        // Re-evaluate bout completion statuses on load
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

      if (typeof FirebaseConfig !== 'undefined' && FirebaseConfig.isInitialized && FirebaseConfig.db) {
        FirebaseConfig.db.ref('kumite_tournament_data_v1').set(this.state).catch(err => {
          console.warn('Firebase cloud sync push error:', err);
        });
      }
    } catch (e) {
      console.error('Failed to save local state:', e);
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

    if (!tatami.assignedBoutIds || !Array.isArray(tatami.assignedBoutIds)) {
      tatami.assignedBoutIds = [];
    }

    if (tatami.assignedBoutIds.indexOf(boutId) === -1) {
      tatami.assignedBoutIds.push(boutId);
    }
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

  // Check and update if an entire bout sheet is completed
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
