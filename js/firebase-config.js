/**
 * Firebase Realtime Sync Configuration
 * shotokan Karate Championship - Multi-Device Synchronization
 */

const FirebaseConfig = {
  // Default Config (Users can also supply custom config via UI modal)
  config: {
    databaseURL: "https://kumite-shotokan-default-rtdb.firebaseio.com"
  },

  db: null,
  isInitialized: false,

  init() {
    try {
      if (typeof firebase !== 'undefined') {
        const savedConfig = localStorage.getItem('kumite_firebase_custom_config');
        const activeConfig = savedConfig ? JSON.parse(savedConfig) : this.config;

        if (!firebase.apps.length) {
          firebase.initializeApp(activeConfig);
        }
        this.db = firebase.database();
        this.isInitialized = true;
        console.log('Firebase Realtime Database initialized successfully!');
      }
    } catch (e) {
      console.warn('Firebase init fallback to offline storage:', e);
      this.isInitialized = false;
    }
  },

  saveCustomConfig(configObj) {
    localStorage.setItem('kumite_firebase_custom_config', JSON.stringify(configObj));
    window.location.reload();
  }
};

window.FirebaseConfig = FirebaseConfig;
