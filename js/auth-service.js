/**
 * Authentication & Role Authorization Service
 * Manages Organizer & 8 Tatami Ring Operator Accounts
 */

const AuthService = {
  // Pre-configured Credentials
  USERS: {
    'organizer': { password: 'aiskf@12345677', role: 'organizer', name: 'Main Organizer / Tournament Director' },
    'tatami1': { password: 'tatami1pass', role: 'tatami', tatamiId: 1, name: 'Tatami 1 Operator' },
    'tatami2': { password: 'tatami2pass', role: 'tatami', tatamiId: 2, name: 'Tatami 2 Operator' },
    'tatami3': { password: 'tatami3pass', role: 'tatami', tatamiId: 3, name: 'Tatami 3 Operator' },
    'tatami4': { password: 'tatami4pass', role: 'tatami', tatamiId: 4, name: 'Tatami 4 Operator' },
    'tatami5': { password: 'tatami5pass', role: 'tatami', tatamiId: 5, name: 'Tatami 5 Operator' },
    'tatami6': { password: 'tatami6pass', role: 'tatami', tatamiId: 6, name: 'Tatami 6 Operator' },
    'tatami7': { password: 'tatami7pass', role: 'tatami', tatamiId: 7, name: 'Tatami 7 Operator' },
    'tatami8': { password: 'tatami8pass', role: 'tatami', tatamiId: 8, name: 'Tatami 8 Operator' }
  },

  currentUser: null,

  init() {
    const saved = sessionStorage.getItem('kumite_auth_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch (e) {
        this.currentUser = null;
      }
    }
  },

  login(username, password) {
    const u = String(username).toLowerCase().trim();
    const user = this.USERS[u];

    if (user && user.password === String(password).trim()) {
      this.currentUser = {
        username: u,
        role: user.role,
        tatamiId: user.tatamiId || null,
        name: user.name
      };
      sessionStorage.setItem('kumite_auth_user', JSON.stringify(this.currentUser));
      return { success: true, user: this.currentUser };
    }

    return { success: false, message: 'Invalid Username or Password!' };
  },

  logout() {
    this.currentUser = null;
    sessionStorage.removeItem('kumite_auth_user');
    window.location.reload();
  },

  isLoggedIn() {
    return this.currentUser !== null;
  }
};

window.AuthService = AuthService;
