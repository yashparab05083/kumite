/**
 * Authentication & Role Authorization Service
 * Supports Custom Passwords & Persistent Multi-Day Account Storage
 */

const AuthService = {
  STORAGE_KEY: 'kumite_custom_accounts_v1',

  DEFAULT_USERS: {
    'organizer': { password: 'admin123', role: 'organizer', name: 'Main Organizer / Tournament Director' },
    'tatami1': { password: 'tatami1pass', role: 'tatami', tatamiId: 1, name: 'Tatami 1 Operator' },
    'tatami2': { password: 'tatami2pass', role: 'tatami', tatamiId: 2, name: 'Tatami 2 Operator' },
    'tatami3': { password: 'tatami3pass', role: 'tatami', tatamiId: 3, name: 'Tatami 3 Operator' },
    'tatami4': { password: 'tatami4pass', role: 'tatami', tatamiId: 4, name: 'Tatami 4 Operator' },
    'tatami5': { password: 'tatami5pass', role: 'tatami', tatamiId: 5, name: 'Tatami 5 Operator' },
    'tatami6': { password: 'tatami6pass', role: 'tatami', tatamiId: 6, name: 'Tatami 6 Operator' },
    'tatami7': { password: 'tatami7pass', role: 'tatami', tatamiId: 7, name: 'Tatami 7 Operator' },
    'tatami8': { password: 'tatami8pass', role: 'tatami', tatamiId: 8, name: 'Tatami 8 Operator' }
  },

  users: {},
  currentUser: null,

  init() {
    // Load custom user accounts from persistent localStorage
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.users = JSON.parse(saved);
      } else {
        this.users = JSON.parse(JSON.stringify(this.DEFAULT_USERS));
        this.saveAccounts();
      }
    } catch (e) {
      this.users = JSON.parse(JSON.stringify(this.DEFAULT_USERS));
    }

    // Load active session
    const activeSession = localStorage.getItem('kumite_auth_session');
    if (activeSession) {
      try {
        this.currentUser = JSON.parse(activeSession);
      } catch (e) {
        this.currentUser = null;
      }
    }
  },

  saveAccounts() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.users));
    } catch (e) {
      console.error('Failed to save user accounts:', e);
    }
  },

  login(username, password) {
    const u = String(username).toLowerCase().trim();
    const user = this.users[u];

    if (user && user.password === String(password).trim()) {
      this.currentUser = {
        username: u,
        role: user.role,
        tatamiId: user.tatamiId || null,
        name: user.name
      };
      localStorage.setItem('kumite_auth_session', JSON.stringify(this.currentUser));
      return { success: true, user: this.currentUser };
    }

    return { success: false, message: 'Invalid Password!' };
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('kumite_auth_session');
    window.location.reload();
  },

  isLoggedIn() {
    return this.currentUser !== null;
  },

  // Organizer: Update password for any account (Organizer or Tatami 1..8)
  updatePassword(username, newPassword) {
    const u = String(username).toLowerCase().trim();
    if (this.users[u]) {
      this.users[u].password = String(newPassword).trim();
      this.saveAccounts();
      return true;
    }
    return false;
  }
};

window.AuthService = AuthService;
