/**
 * Sync Service & Application State Store
 * Handles local storage persistence & real-time sync across devices
 */

const SyncService = {
  STORAGE_KEY: 'kumite_tournament_data_v1',
  listeners: [],

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
      status: 'Empty' // Empty, Active, Paused
    })),
    currentUser: {
      role: 'organizer', // organizer, tatami
      tatamiId: null
    }
  },

  init() {
    this.loadFromLocal();
    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY) {
        this.loadFromLocal();
        this.notifyListeners();
      }
    });
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

  saveToLocal() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state));
      this.notifyListeners();
    } catch (e) {
      console.error('Failed to save local state:', e);
    }
  },

  // Save imported participants & generated bouts
  setBoutsAndBrackets(bouts, brackets) {
    this.state.bouts = bouts;
    this.state.brackets = brackets;
    this.saveToLocal();
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

    this.saveToLocal();
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

    this.saveToLocal();
  },

  // Commit completed match result
  commitMatchResult(boutId, matchNumber, winnerSide, matchScore) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;

    // Update bracket match
    BracketEngine.updateMatchResult(bracket, matchNumber, winnerSide, matchScore);

    // Check if entire bout sheet is completed
    const allMatchesDone = bracket.matches.every(m => m.status === 'Completed');
    const bout = this.state.bouts.find(b => b.id === boutId);
    if (bout) {
      if (allMatchesDone) {
        bout.status = 'Completed';
      }
    }

    // Free up Tatami if current active match completed
    this.state.tatamis.forEach(tatami => {
      if (tatami.activeBoutId === boutId && tatami.activeMatchNumber === matchNumber) {
        // Find next scheduled match in this bout or queue
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

    this.saveToLocal();
  },

  // Update participant position manually in bracket
  swapBracketSlots(boutId, slotIndexA, slotIndexB) {
    const bracket = this.state.brackets[boutId];
    if (!bracket) return;

    const temp = bracket.slots[slotIndexA];
    bracket.slots[slotIndexA] = bracket.slots[slotIndexB];
    bracket.slots[slotIndexB] = temp;

    // Rebuild bracket round 1 matches
    for (let i = 0; i < 8; i++) {
      const aao = bracket.slots[i * 2];
      const aka = bracket.slots[i * 2 + 1];
      const match = bracket.matches[i];
      if (match.status !== 'Completed') {
        match.aao = aao;
        match.aka = aka;
        match.winner = null;
        match.loser = null;
        match.status = (aao && aka) ? 'Scheduled' : (aao || aka ? 'Completed' : 'Completed');
        if (aao && !aka) match.winner = { ...aao };
        if (!aao && aka) match.winner = { ...aka };
      }
    }

    BracketEngine.propagateWinners(bracket);
    this.saveToLocal();
  }
};

window.SyncService = SyncService;
