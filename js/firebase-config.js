/**
 * TRACKX - Firebase Configuration & Initialization Layer
 * Standard configuration object ready for Firebase Authentication & Firestore.
 * Replace the placeholder values with your Firebase Console Project credentials.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};

  // Firebase Configuration Object (Project: track-x-bcdf5)
  const firebaseConfig = {
    apiKey: "AIzaSyC8zRocf1IlTRQszXtIpt4ZI88f15XOnt4",
    authDomain: "track-x-bcdf5.firebaseapp.com",
    projectId: "track-x-bcdf5",
    storageBucket: "track-x-bcdf5.firebasestorage.app",
    messagingSenderId: "620624488317",
    appId: "1:620624488317:web:e536d9ba4a003755140e14",
    measurementId: "G-94WCHD44Z5"
  };

  let isInitialized = false;
  let auth = null;
  let googleProvider = null;
  let db = null;

  function initFirebase() {
    if (isInitialized) return;
    if (window.TrackX && window.TrackX.perf) {
      window.TrackX.perf.start('Firebase auth initialization');
    }

    // Check if Firebase Compat SDK is present in window
    if (window.firebase && typeof window.firebase.initializeApp === 'function') {
      try {
        if (!firebase.apps || firebase.apps.length === 0) {
          firebase.initializeApp(firebaseConfig);
        }
        auth = firebase.auth();
        // Persist session across browser sessions & reloads
        if (firebase.auth.Auth && firebase.auth.Auth.Persistence) {
          auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((pErr) => {
            console.warn('[TrackX] Session persistence notice:', pErr.message);
          });
        }

        googleProvider = new firebase.auth.GoogleAuthProvider();
        googleProvider.addScope('profile');
        googleProvider.addScope('email');
        googleProvider.setCustomParameters({ prompt: 'select_account' });

        // Initialize Firestore instance (Step 2 - Connect Firestore to TrackX)
        if (typeof firebase.firestore === 'function') {
          db = firebase.firestore();
        }

        // Expose global references for direct access (auth & db)
        window.auth = auth;
        window.db = db;

        isInitialized = true;
        console.info('[TrackX] Firebase & Firestore initialized successfully.');
      } catch (err) {
        console.warn('[TrackX] Firebase configuration awaiting project keys:', err.message);
      } finally {
        if (window.TrackX && window.TrackX.perf) {
          window.TrackX.perf.end('Firebase auth initialization');
        }
      }
    }
  }

  function isConfigured() {
    return isInitialized && firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_FIREBASE_API_KEY";
  }

  function getFirestore() {
    if (db) return db;
    if (window.firebase && typeof window.firebase.firestore === 'function') {
      db = window.firebase.firestore();
      window.db = db;
      return db;
    }
    return null;
  }

  window.TrackX.firebase = {
    config: firebaseConfig,
    initFirebase,
    isConfigured,
    getAuth: () => auth,
    get auth() { return auth; },
    getGoogleProvider: () => googleProvider,
    getFirestore,
    getDb: () => db || getFirestore(),
    get db() { return db || getFirestore(); }
  };

  // Auto-initialize if Firebase CDN scripts are already loaded
  if (window.firebase && typeof window.firebase.initializeApp === 'function') {
    initFirebase();
  }

})(window);
