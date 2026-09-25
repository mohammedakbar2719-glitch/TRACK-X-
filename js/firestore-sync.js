/**
 * TRACKX - Firestore Cloud Synchronization Layer (Phase 6)
 * Real-time subcollection synchronization, LocalStorage migration system,
 * offline persistence, network status listener, and strict per-user isolation.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};

  let currentUserId = null;
  let activeUnsubscribers = [];
  let isMigrating = false;
  let isCloudSyncing = false;
  let isUserSyncInitialized = false;
  let isSyncInProgress = false;
  let isInitialized = false;
  const loadedCalendarMonths = new Set();

  // ==========================================
  // INITIALIZATION & OFFLINE PERSISTENCE
  // ==========================================

  function init() {
    if (isInitialized) return;
    isInitialized = true;
    enableOfflinePersistence();
    setupNetworkMonitoring();
    setupMigrationModalEvents();
  }

  function enableOfflinePersistence() {
    // Multi-tab Firestore IndexedDB persistence with synchronizeTabs:true causes 100% CPU
    // lockups/spin-locks in Chromium on Windows when interacting with Google Auth popups.
    // TrackX utilizes high-performance localStorage for native offline resilience (storage.js).
  }

  function setupNetworkMonitoring() {
    const banner = document.getElementById('networkStatusBanner');

    const updateStatus = () => {
      const isOnline = navigator.onLine;
      if (!isOnline) {
        if (banner) {
          banner.textContent = "You're offline. Your changes will sync when you're connected.";
          banner.style.display = 'flex';
        }
        if (window.TrackX.utils && window.TrackX.utils.showToast) {
          window.TrackX.utils.showToast({
            title: "You're offline",
            message: "Your changes will sync when you're connected.",
            type: 'warning',
            icon: '📡'
          });
        }
      } else {
        if (banner) {
          banner.style.display = 'none';
        }
      }
    };

    window.addEventListener('offline', () => {
      updateStatus();
    });

    window.addEventListener('online', () => {
      if (banner) banner.style.display = 'none';
      if (window.TrackX.utils && window.TrackX.utils.showToast) {
        window.TrackX.utils.showToast({
          title: 'Back Online',
          message: 'Connected to network. Cloud data is synchronized.',
          type: 'info',
          icon: '⚡'
        });
      }
    });

    if (!navigator.onLine) {
      updateStatus();
    }
  }

  // ==========================================
  // USER SYNC LIFECYCLE
  // ==========================================

  let isInitializingUser = false;

  async function initUserSync(user) {
    if (!user || !user.uid) return;
    if (currentUserId === user.uid && (isUserSyncInitialized || isSyncInProgress || isInitializingUser)) return;

    currentUserId = user.uid;
    isSyncInProgress = true;
    isInitializingUser = true;

    // Scope localStorage caching to this user immediately
    if (window.TrackX.storage && typeof window.TrackX.storage.setCurrentUserId === 'function') {
      window.TrackX.storage.setCurrentUserId(user.uid);
    }

    if (window.TrackX.perf) {
      window.TrackX.perf.start('Firestore data loading');
    }

    const nowISO = new Date().toISOString();

    try {
      const fb = window.TrackX.firebase;
      let isNewUser = false;

      if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
        const db = fb.getFirestore();
        const userDocRef = db.collection('users').doc(user.uid);
        const docSnap = await userDocRef.get();

        if (!docSnap.exists) {
          isNewUser = true;
        } else {
          const docData = docSnap.data();
          // If document exists, check if account was initialized
          if (!docData || (!docData.accountInitialized && !docData.hasMigrated)) {
            const habitsSnap = await userDocRef.collection('habits').limit(1).get().catch(() => ({ empty: true }));
            if (habitsSnap.empty) {
              isNewUser = true;
            }
          }
        }

        if (isNewUser) {
          // BRAND NEW USER:
          // Initial streak = 0, initial points = 0, completed tasks = 0,
          // habits = default unchecked, progress = clean, settings = defaults
          await initializeNewUserCloudAccount(user);

          revealApp();
          attachRealtimeListeners(user.uid);

          if (window.TrackX.notifications && typeof window.TrackX.notifications.refreshNotifications === 'function') {
            window.TrackX.notifications.refreshNotifications();
          }
        } else {
          // RETURNING USER:
          // Read only users/{uid}. Update lastLoginAt non-blockingly. NEVER reset their data to zero!
          userDocRef.set({ lastLoginAt: nowISO }, { merge: true }).catch((err) => {
            console.warn('[TrackX Last Login Notice]:', err.message);
          });

          // Fetch full profile, habits, achievements, notifications, and past 30 days of completions & wellness
          await hydrateToday(user.uid);

          // Reveal application cleanly with restored state
          revealApp();

          // Attach real-time listeners for today & active habits
          attachRealtimeListeners(user.uid);

          if (window.TrackX.notifications && typeof window.TrackX.notifications.refreshNotifications === 'function') {
            window.TrackX.notifications.refreshNotifications(false);
          }
        }
      } else {
        // Preview / simulation mode
        const devKey = `trackx_cloud_migrated_${user.uid}`;
        const hasCloudDev = localStorage.getItem(devKey) === 'true';

        if (!hasCloudDev) {
          await initializeNewUserCloudAccount(user);
          revealApp();
          if (window.TrackX.notifications && typeof window.TrackX.notifications.refreshNotifications === 'function') {
            window.TrackX.notifications.refreshNotifications();
          }
        } else {
          await hydrateToday(user.uid);
          revealApp();
        }
      }

      isUserSyncInitialized = true;
    } catch (err) {
      console.warn('[TrackX User Sync Error]:', err);
      if (err && err.code === 'permission-denied') {
        if (window.TrackX.utils && window.TrackX.utils.showToast) {
          window.TrackX.utils.showToast({
            title: 'Permission Denied',
            message: 'Please check your Firestore Security Rules in Firebase Console.',
            type: 'warning',
            icon: '🔒'
          });
        }
      } else if (err && (err.code === 'unavailable' || !navigator.onLine)) {
        if (window.TrackX.utils && window.TrackX.utils.showToast) {
          window.TrackX.utils.showToast({
            title: 'Offline Mode',
            message: 'Using locally cached data while connecting to Firestore.',
            type: 'info',
            icon: '📡'
          });
        }
      }
      revealApp();
    } finally {
      isSyncInProgress = false;
      isInitializingUser = false;
      if (window.TrackX.perf) {
        window.TrackX.perf.end('Firestore data loading');
      }
    }
  }

  async function initializeNewUserCloudAccount(user) {
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();
    const todayKey = window.TrackX.utils ? window.TrackX.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'TrackX User');
    const email = user.email || '';
    const photoURL = user.photoURL || null;
    const avatar = photoURL || (window.TrackX.auth ? window.TrackX.auth.getUserInitials(displayName) : '✨');

    const welcomeNotification = {
      id: 'welcome_notification',
      type: 'welcome',
      title: 'Welcome to TrackX! 👋',
      message: 'Your TrackX journey starts today. Start by completing your first habit and build your streak.',
      priority: 1,
      read: false,
      icon: '👋',
      accentClass: 'accent-habit',
      timestamp: Date.now()
    };

    const cleanData = window.TrackX.storage.getCleanUserData({
      name: displayName,
      email: email,
      avatar: avatar,
      bio: 'Becoming 1% better every day.',
      uid: user.uid
    }, welcomeNotification);

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        const db = fb.getFirestore();
        const userDocRef = db.collection('users').doc(user.uid);

        // 1. Root user document
        await userDocRef.set({
          uid: user.uid,
          displayName: displayName,
          email: email,
          photoURL: photoURL,
          accountInitialized: true,
          hasMigrated: true,
          createdAt: nowISO,
          lastLoginAt: nowISO,
          profile: cleanData.user,
          settings: cleanData.settings,
          updatedAt: nowISO
        });

        // 2. Default habits (all unchecked, completed = false, streak = 0)
        const habitsBatch = db.batch();
        cleanData.habits.forEach((habit) => {
          const habitRef = userDocRef.collection('habits').doc(habit.id);
          habitsBatch.set(habitRef, {
            ...habit,
            updatedAt: nowISO
          });
        });
        await habitsBatch.commit();

        // 3. Completions for today (empty)
        await userDocRef.collection('completions').doc(todayKey).set({
          date: todayKey,
          completedHabits: [],
          updatedAt: nowISO
        });

        // 4. Wellness for today (all zeroed)
        await userDocRef.collection('wellness').doc(todayKey).set({
          date: todayKey,
          waterIntake: 0,
          waterGoal: 2500,
          sleep: { hours: 0, quality: 3, bedtime: '', waketime: '' },
          exercise: { minutes: 0, type: 'General Fitness', intensity: 'moderate' },
          mood: { rating: 0, energy: 0, tags: [], note: '' },
          focusMinutes: 0,
          updatedAt: nowISO
        });

        // 5. Default achievements (all locked, unlockedAt = null)
        const achBatch = db.batch();
        cleanData.achievements.forEach((ach) => {
          const achRef = userDocRef.collection('achievements').doc(ach.id);
          achBatch.set(achRef, {
            ...ach,
            unlockedAt: null,
            updatedAt: nowISO
          });
        });
        await achBatch.commit();

        // 6. Notifications state with single welcome notification
        await userDocRef.collection('notifications').doc('state').set({
          ...cleanData.notifications,
          updatedAt: nowISO
        });
      } catch (fsErr) {
        console.warn('[TrackX Initialize New User Cloud Notice]:', fsErr.message);
      }
    } else {
      // Local preview / simulation mode
      localStorage.setItem(`trackx_cloud_migrated_${user.uid}`, 'true');
      localStorage.setItem(`trackx_cloud_data_${user.uid}`, JSON.stringify(cleanData));
    }

    // Save to user-scoped LocalStorage
    window.TrackX.storage.saveData(cleanData, true, user.uid);

    // Hydrate in-memory state
    if (window.TrackX.state && typeof window.TrackX.state.loadFromCloud === 'function') {
      window.TrackX.state.loadFromCloud(cleanData, true);
    }

    return cleanData;
  }

  function revealApp() {
    // 1. Hide auth screens and reset submitting flags
    if (window.TrackX.auth) {
      if (typeof window.TrackX.auth.hideLoadingScreen === 'function') window.TrackX.auth.hideLoadingScreen();
      if (typeof window.TrackX.auth.hideAuthScreen === 'function') window.TrackX.auth.hideAuthScreen();
      if (typeof window.TrackX.auth.setGoogleLoadingState === 'function') window.TrackX.auth.setGoogleLoadingState(false);
    }

    // 2. Direct DOM safety overrides ensuring NO backdrop or loading element intercepts clicks
    const loader = document.getElementById('authLoadingScreen');
    if (loader) {
      loader.classList.add('hidden');
      loader.style.setProperty('display', 'none', 'important');
      loader.style.setProperty('pointer-events', 'none', 'important');
      loader.style.setProperty('visibility', 'hidden', 'important');
      loader.style.setProperty('z-index', '-1', 'important');
    }

    const authContainer = document.getElementById('authContainer');
    if (authContainer) {
      authContainer.classList.add('hidden');
      authContainer.style.setProperty('display', 'none', 'important');
      authContainer.style.setProperty('pointer-events', 'none', 'important');
      authContainer.style.setProperty('visibility', 'hidden', 'important');
      authContainer.style.setProperty('z-index', '-1', 'important');
    }

    // 3. Ensure migration modal is removed from active state
    const migrationModal = document.getElementById('migrationModal');
    if (migrationModal) {
      migrationModal.classList.remove('active');
    }
    document.querySelectorAll('.modal-overlay.active').forEach((m) => {
      if (m.id === 'migrationModal') m.classList.remove('active');
    });

    // 4. Force .app-container to flex and fully interactive
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.style.setProperty('display', 'flex', 'important');
      appContainer.style.setProperty('pointer-events', 'auto', 'important');
      appContainer.style.setProperty('visibility', 'visible', 'important');
    }

    // 5. Navigate to Today view
    if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
      window.TrackX.app.switchView('today');
    }
  }

  function cleanup() {
    cleanupListeners();
    currentUserId = null;
    isUserSyncInitialized = false;
    isSyncInProgress = false;
    loadedCalendarMonths.clear();
  }

  function cleanupListeners() {
    activeUnsubscribers.forEach((unsub) => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch (e) {}
    });
    activeUnsubscribers = [];
  }

  // ==========================================
  // CLOUD DATA DISCOVERY & LOCALSTORAGE CHECK
  // ==========================================

  async function checkCloudDataExists(uid) {
    const fb = window.TrackX.firebase;
    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        const db = fb.getFirestore();
        const userDocRef = db.collection('users').doc(uid);
        const docSnap = await userDocRef.get();

        if (docSnap.exists) {
          const data = docSnap.data();
          if (data && (data.accountInitialized === true || data.hasMigrated === true)) return true;
        }

        // Also check if habits subcollection has any documents
        const habitsSnap = await userDocRef.collection('habits').limit(1).get().catch(() => ({ empty: true }));
        return !habitsSnap.empty;
      } catch (err) {
        console.warn('[TrackX Cloud Check Notice]:', err);
        return false;
      }
    } else {
      // Preview/simulation mode: check localStorage flag for this user
      const devKey = `trackx_cloud_migrated_${uid}`;
      return localStorage.getItem(devKey) === 'true';
    }
  }

  function getExistingLocalData() {
    try {
      const raw = localStorage.getItem('trackx_data_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.habits && parsed.habits.length > 0) {
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // MIGRATION MODAL LOGIC
  // ==========================================

  function promptMigration(user, localData) {
    const modal = document.getElementById('migrationModal');
    if (!modal) return;

    // Populate preview stats
    const habitsCount = (localData.habits || []).length;
    const logsCount = Object.keys(localData.logs || {}).length;
    const achCount = (localData.achievements || []).filter((a) => a.unlockedAt).length;

    const countHabitsEl = document.getElementById('migrateCountHabits');
    const countLogsEl = document.getElementById('migrateCountLogs');
    const countAchEl = document.getElementById('migrateCountAchievements');

    if (countHabitsEl) countHabitsEl.textContent = habitsCount;
    if (countLogsEl) countLogsEl.textContent = `${logsCount} days`;
    if (countAchEl) countAchEl.textContent = achCount;

    modal.classList.add('active');
  }

  function setupMigrationModalEvents() {
    const btnImport = document.getElementById('btnMigrateImport');
    const btnFresh = document.getElementById('btnMigrateFresh');
    const modal = document.getElementById('migrationModal');

    if (btnImport) {
      btnImport.addEventListener('click', async () => {
        if (isMigrating || !currentUserId) return;
        isMigrating = true;
        btnImport.disabled = true;
        const originalText = btnImport.textContent;
        btnImport.textContent = 'Importing Data...';

        try {
          const localData = getExistingLocalData();
          if (localData) {
            await importLocalDataToCloud(currentUserId, localData);
          }
          if (modal) modal.classList.remove('active');
          revealApp();
          attachRealtimeListeners(currentUserId);

          if (window.TrackX.utils && window.TrackX.utils.showToast) {
            window.TrackX.utils.showToast({
              title: 'Data Imported',
              message: 'Your local TrackX data is now securely stored in your account.',
              type: 'success',
              icon: '☁️'
            });
          }
        } catch (err) {
          console.error('[TrackX Migration Error]:', err);
          revealApp();
        } finally {
          isMigrating = false;
          btnImport.disabled = false;
          btnImport.textContent = originalText;
        }
      });
    }

    if (btnFresh) {
      btnFresh.addEventListener('click', async () => {
        if (isMigrating || !currentUserId) return;
        isMigrating = true;
        btnFresh.disabled = true;

        try {
          await startFreshCloudAccount(currentUserId);
          if (modal) modal.classList.remove('active');
          revealApp();
          attachRealtimeListeners(currentUserId);

          if (window.TrackX.utils && window.TrackX.utils.showToast) {
            window.TrackX.utils.showToast({
              title: 'Fresh Account Ready',
              message: 'Welcome to your personal TrackX cloud dashboard.',
              type: 'success',
              icon: '✨'
            });
          }
        } catch (err) {
          console.error('[TrackX Fresh Account Error]:', err);
          revealApp();
        } finally {
          isMigrating = false;
          btnFresh.disabled = false;
        }
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          revealApp();
        }
      });
    }
  }

  // ==========================================
  // FIRESTORE UPLOAD / IMPORT OPERATIONS
  // ==========================================

  async function importLocalDataToCloud(uid, data) {
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        const db = fb.getFirestore();
        const userDocRef = db.collection('users').doc(uid);

        // 1. Root user document
        await userDocRef.set({
          uid: uid,
          profile: data.user || {},
          settings: data.settings || {},
          hasMigrated: true,
          migratedAt: nowISO,
          updatedAt: nowISO
        }, { merge: true });

        // 2. Habits subcollection (users/{uid}/habits/{habitId})
        const habitsBatch = db.batch();
        (data.habits || []).forEach((habit) => {
          const habitRef = userDocRef.collection('habits').doc(habit.id);
          habitsBatch.set(habitRef, {
            ...habit,
            updatedAt: nowISO
          });
        });
        await habitsBatch.commit();

        // 3. Completions & Wellness subcollections (chunked safely at max 40 dates = 80 writes)
        const logs = data.logs || {};
        const dates = Object.keys(logs);
        const CHUNK_SIZE = 40;

        for (let i = 0; i < dates.length; i += CHUNK_SIZE) {
          const chunk = dates.slice(i, i + CHUNK_SIZE);
          const batch = db.batch();
          chunk.forEach((dateKey) => {
            const dayLog = logs[dateKey];
            if (!dayLog) return;
            const compRef = userDocRef.collection('completions').doc(dateKey);
            batch.set(compRef, {
              date: dateKey,
              completedHabits: dayLog.completedHabits || [],
              updatedAt: nowISO
            });

            const wellRef = userDocRef.collection('wellness').doc(dateKey);
            batch.set(wellRef, {
              date: dateKey,
              waterIntake: dayLog.waterIntake || 0,
              waterGoal: dayLog.waterGoal || 2500,
              sleep: dayLog.sleep || {},
              exercise: dayLog.exercise || {},
              mood: dayLog.mood || {},
              focusMinutes: dayLog.focusMinutes || 0,
              updatedAt: nowISO
            });
          });
          await batch.commit();
        }

        // 4. Achievements subcollection (users/{uid}/achievements/{achId})
        const achBatch = db.batch();
        (data.achievements || []).forEach((ach) => {
          const achRef = userDocRef.collection('achievements').doc(ach.id);
          achBatch.set(achRef, {
            ...ach,
            updatedAt: nowISO
          });
        });
        await achBatch.commit();

        // 5. Notifications
        if (data.notifications) {
          await userDocRef.collection('notifications').doc('state').set({
            ...data.notifications,
            updatedAt: nowISO
          });
        }
      } catch (fsErr) {
        console.warn('[TrackX Firestore Import Notice]:', fsErr.message);
      }
    } else {
      // Dev preview / simulation mode
      localStorage.setItem(`trackx_cloud_migrated_${uid}`, 'true');
      localStorage.setItem(`trackx_cloud_data_${uid}`, JSON.stringify(data));
    }

    // Hydrate in-memory state
    if (window.TrackX.state && typeof window.TrackX.state.loadFromCloud === 'function') {
      window.TrackX.state.loadFromCloud(data);
    }
  }

  async function startFreshCloudAccount(uid) {
    const userProfile = (window.TrackX.state && window.TrackX.state.data && window.TrackX.state.data.user) || { uid };
    return initializeNewUserCloudAccount({
      uid: uid,
      displayName: userProfile.name || 'TrackX User',
      email: userProfile.email || '',
      photoURL: userProfile.avatar || null
    });
  }

  // ==========================================
  // STAGED HYDRATION (Phase 1: Today Minimum Payload)
  // ==========================================

  async function hydrateToday(uid) {
    const fb = window.TrackX.firebase;
    const todayKey = window.TrackX.utils ? window.TrackX.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
    const thirtyDaysAgoKey = window.TrackX.utils ? window.TrackX.utils.addDays(todayKey, -30) : todayKey;

    if (window.TrackX.perf) {
      window.TrackX.perf.start('user profile fetch');
      window.TrackX.perf.start('habits fetch');
      window.TrackX.perf.start('completions fetch');
      window.TrackX.perf.start('wellness data fetch');
      window.TrackX.perf.start('notifications fetch');
    }

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        const db = fb.getFirestore();
        const userDocRef = db.collection('users').doc(uid);

        // Fetch root profile, habits, achievements, notifications, and past 30 days completions & wellness in PARALLEL
        const [rootSnap, habitsSnap, achSnap, notifDoc, compSnap, wellSnap] = await Promise.all([
          userDocRef.get().catch(() => ({ exists: false })),
          userDocRef.collection('habits').get().catch(() => ({ docs: [] })),
          userDocRef.collection('achievements').get().catch(() => ({ docs: [] })),
          userDocRef.collection('notifications').doc('state').get().catch(() => ({ exists: false })),
          userDocRef.collection('completions')
            .where('date', '>=', thirtyDaysAgoKey)
            .get()
            .catch(() => ({ docs: [] })),
          userDocRef.collection('wellness')
            .where('date', '>=', thirtyDaysAgoKey)
            .get()
            .catch(() => ({ docs: [] }))
        ]);

        if (window.TrackX.perf) {
          window.TrackX.perf.end('user profile fetch');
          window.TrackX.perf.end('habits fetch');
          window.TrackX.perf.end('completions fetch');
          window.TrackX.perf.end('wellness data fetch');
          window.TrackX.perf.end('notifications fetch');
        }

        const rootData = (rootSnap && rootSnap.exists) ? rootSnap.data() : {};
        const habits = [];
        if (habitsSnap && habitsSnap.docs) {
          habitsSnap.docs.forEach((doc) => habits.push(doc.data()));
        }

        const achievements = [];
        if (achSnap && achSnap.docs) {
          achSnap.docs.forEach((doc) => achievements.push(doc.data()));
        }

        const notifData = (notifDoc && notifDoc.exists) ? notifDoc.data() : { readIds: [], dismissedIds: [], timestamps: {}, custom: [] };

        // Construct 30-day historical logs
        const logs = {};

        if (compSnap && compSnap.docs) {
          compSnap.docs.forEach((doc) => {
            const c = doc.data();
            if (c && c.date) {
              if (!logs[c.date]) logs[c.date] = { completedHabits: [] };
              logs[c.date].completedHabits = c.completedHabits || [];
            }
          });
        }

        if (wellSnap && wellSnap.docs) {
          wellSnap.docs.forEach((doc) => {
            const w = doc.data();
            if (w && w.date) {
              const existing = logs[w.date] || { completedHabits: [] };
              logs[w.date] = {
                ...existing,
                waterIntake: w.waterIntake !== undefined ? w.waterIntake : 0,
                waterGoal: w.waterGoal || 2500,
                sleep: w.sleep || { hours: 0, quality: 3, bedtime: '', waketime: '' },
                exercise: w.exercise || { minutes: 0, type: 'General Fitness', intensity: 'moderate' },
                mood: w.mood || { rating: 0, energy: 0, tags: [], note: '' },
                focusMinutes: w.focusMinutes !== undefined ? w.focusMinutes : 0
              };
            }
          });
        }

        // Guarantee today's log exists so today dashboard is ready
        if (!logs[todayKey]) {
          logs[todayKey] = {
            completedHabits: [],
            waterIntake: 0,
            waterGoal: 2500,
            sleep: { hours: 0, quality: 3, bedtime: '', waketime: '' },
            exercise: { minutes: 0, type: 'General Fitness', intensity: 'moderate' },
            mood: { rating: 0, energy: 0, tags: [], note: '' },
            focusMinutes: 0
          };
        }

        const fullCloudData = {
          version: 1,
          user: rootData.profile || {
            name: rootData.displayName || (rootData.email ? rootData.email.split('@')[0] : 'TrackX User'),
            email: rootData.email || '',
            avatar: rootData.photoURL || '✨',
            uid: uid
          },
          settings: rootData.settings || {
            theme: 'light',
            sounds: true,
            dailyWaterGoal: 2500,
            dailySleepGoal: 8,
            dailyFocusGoal: 60,
            dailyExerciseGoal: 30
          },
          habits: habits.length > 0 ? habits : (window.TrackX.storage ? window.TrackX.storage.getDefaultHabits(todayKey) : []),
          achievements: achievements.length > 0 ? achievements : (window.TrackX.storage ? window.TrackX.storage.getDefaultAchievements() : []),
          notifications: notifData,
          logs
        };

        if (window.TrackX.storage && typeof window.TrackX.storage.saveData === 'function') {
          window.TrackX.storage.saveData(fullCloudData, true, uid);
        }

        if (window.TrackX.state && typeof window.TrackX.state.loadFromCloud === 'function') {
          window.TrackX.state.loadFromCloud(fullCloudData, true);
        }

        if (window.TrackX.notifications && typeof window.TrackX.notifications.refreshNotifications === 'function') {
          window.TrackX.notifications.refreshNotifications();
        }
      } catch (err) {
        console.warn('[TrackX Hydration Warning]:', err);
      }
    } else {
      // Dev preview / simulation mode
      const raw = localStorage.getItem(`trackx_cloud_data_${uid}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (window.TrackX.state && typeof window.TrackX.state.loadFromCloud === 'function') {
            window.TrackX.state.loadFromCloud(parsed, true);
          }
        } catch (e) {}
      }
      if (window.TrackX.perf) {
        window.TrackX.perf.end('user profile fetch');
        window.TrackX.perf.end('habits fetch');
        window.TrackX.perf.end('completions fetch');
        window.TrackX.perf.end('wellness data fetch');
      }
    }
  }

  // ==========================================
  // PROGRESSIVE BACKGROUND LOADING (Stage 2)
  // ==========================================

  async function loadSecondaryData(uid) {
    if (!uid || uid !== currentUserId) return;
    const fb = window.TrackX.firebase;
    if (!fb || typeof fb.isConfigured !== 'function' || !fb.isConfigured()) return;

    const db = fb.getFirestore();
    const userDocRef = db.collection('users').doc(uid);
    const todayKey = window.TrackX.utils ? window.TrackX.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
    const fourteenDaysAgoKey = window.TrackX.utils ? window.TrackX.utils.addDays(todayKey, -14) : todayKey;

    // 1. Load Recent Progress / History (last 14 days only, not all time)
    try {
      if (window.TrackX.perf) window.TrackX.perf.start('progress fetch');
      const [compSnap, wellSnap] = await Promise.all([
        userDocRef.collection('completions')
          .where('date', '>=', fourteenDaysAgoKey)
          .get()
          .catch(() => ({ docs: [] })),
        userDocRef.collection('wellness')
          .where('date', '>=', fourteenDaysAgoKey)
          .get()
          .catch(() => ({ docs: [] }))
      ]);

      if (window.TrackX.state) {
        if (compSnap.docs) {
          compSnap.docs.forEach((doc) => {
            const c = doc.data();
            if (c && c.date) {
              if (!window.TrackX.state.data.logs[c.date]) {
                window.TrackX.state.data.logs[c.date] = { completedHabits: [] };
              }
              window.TrackX.state.data.logs[c.date].completedHabits = c.completedHabits || [];
            }
          });
        }

        if (wellSnap.docs) {
          wellSnap.docs.forEach((doc) => {
            const w = doc.data();
            if (w && w.date) {
              const existing = window.TrackX.state.data.logs[w.date] || { completedHabits: [] };
              window.TrackX.state.data.logs[w.date] = {
                ...existing,
                waterIntake: w.waterIntake !== undefined ? w.waterIntake : existing.waterIntake,
                waterGoal: w.waterGoal || existing.waterGoal || 2500,
                sleep: w.sleep || existing.sleep || {},
                exercise: w.exercise || existing.exercise || {},
                mood: w.mood || existing.mood || {},
                focusMinutes: w.focusMinutes !== undefined ? w.focusMinutes : existing.focusMinutes
              };
            }
          });
        }

        if (window.TrackX.state.clearScoreCache) {
          window.TrackX.state.clearScoreCache();
        }
      }
      if (window.TrackX.perf) window.TrackX.perf.end('progress fetch');
    } catch (err) {
      console.warn('[TrackX Progress Fetch Warning]:', err.message);
      if (window.TrackX.utils && typeof window.TrackX.utils.showToast === 'function') {
        window.TrackX.utils.showToast({
          title: 'Unable to load progress',
          message: 'Historical records could not be fetched. Rest of TrackX is working.',
          type: 'warning',
          icon: '⚠️'
        });
      }
    }

    // 2. Load Notifications State
    try {
      if (window.TrackX.perf) window.TrackX.perf.start('notifications fetch');
      const notifSnap = await userDocRef.collection('notifications').doc('state').get().catch(() => ({ exists: false }));
      if (notifSnap && notifSnap.exists && window.TrackX.state) {
        const notifData = notifSnap.data();
        window.TrackX.state.data.notifications = {
          ...window.TrackX.state.data.notifications,
          ...notifData
        };
        if (window.TrackX.notifications && typeof window.TrackX.notifications.refreshNotifications === 'function') {
          window.TrackX.notifications.refreshNotifications(false);
        }
      }
      if (window.TrackX.perf) window.TrackX.perf.end('notifications fetch');
    } catch (err) {
      console.warn('[TrackX Notifications Fetch Warning]:', err.message);
    }

    // 3. Load Achievements State
    try {
      if (window.TrackX.perf) window.TrackX.perf.start('achievements fetch');
      const achSnap = await userDocRef.collection('achievements').get().catch(() => ({ docs: [] }));
      const achievements = [];
      if (achSnap.docs) {
        achSnap.docs.forEach((doc) => achievements.push(doc.data()));
      }
      if (achievements.length > 0 && window.TrackX.state) {
        window.TrackX.state.data.achievements = achievements;
      }
      if (window.TrackX.perf) window.TrackX.perf.end('achievements fetch');
    } catch (err) {
      console.warn('[TrackX Achievements Fetch Warning]:', err.message);
    }

    // 4. Load Recent Focus Sessions
    try {
      if (window.TrackX.perf) window.TrackX.perf.start('focus data fetch');
      await userDocRef.collection('focusSessions').limit(20).get().catch(() => ({ docs: [] }));
      if (window.TrackX.perf) window.TrackX.perf.end('focus data fetch');
    } catch (err) {
      console.warn('[TrackX Focus Fetch Warning]:', err.message);
    }
  }

  // ==========================================
  // ON-DEMAND CALENDAR MONTH LOADER (Stage 3)
  // ==========================================

  async function loadCalendarMonth(year, month) {
    if (!currentUserId) return;
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (loadedCalendarMonths.has(monthKey)) return; // Already cached in memory

    const fb = window.TrackX.firebase;
    if (!fb || typeof fb.isConfigured !== 'function' || !fb.isConfigured()) return;

    try {
      if (window.TrackX.perf) window.TrackX.perf.start('calendar fetch');
      const db = fb.getFirestore();
      const userDocRef = db.collection('users').doc(currentUserId);
      const startKey = `${monthKey}-01`;
      const endKey = `${monthKey}-31`;

      const [compSnap, wellSnap] = await Promise.all([
        userDocRef.collection('completions')
          .where('date', '>=', startKey)
          .where('date', '<=', endKey)
          .get()
          .catch(() => ({ docs: [] })),
        userDocRef.collection('wellness')
          .where('date', '>=', startKey)
          .where('date', '<=', endKey)
          .get()
          .catch(() => ({ docs: [] }))
      ]);

      if (window.TrackX.state) {
        if (compSnap.docs) {
          compSnap.docs.forEach((doc) => {
            const c = doc.data();
            if (c && c.date) {
              if (!window.TrackX.state.data.logs[c.date]) {
                window.TrackX.state.data.logs[c.date] = { completedHabits: [] };
              }
              window.TrackX.state.data.logs[c.date].completedHabits = c.completedHabits || [];
            }
          });
        }

        if (wellSnap.docs) {
          wellSnap.docs.forEach((doc) => {
            const w = doc.data();
            if (w && w.date) {
              const existing = window.TrackX.state.data.logs[w.date] || { completedHabits: [] };
              window.TrackX.state.data.logs[w.date] = {
                ...existing,
                waterIntake: w.waterIntake !== undefined ? w.waterIntake : existing.waterIntake,
                waterGoal: w.waterGoal || existing.waterGoal || 2500,
                sleep: w.sleep || existing.sleep || {},
                exercise: w.exercise || existing.exercise || {},
                mood: w.mood || existing.mood || {},
                focusMinutes: w.focusMinutes !== undefined ? w.focusMinutes : existing.focusMinutes
              };
            }
          });
        }

        if (window.TrackX.state.clearScoreCache) {
          window.TrackX.state.clearScoreCache();
        }
      }

      loadedCalendarMonths.add(monthKey);
      if (window.TrackX.perf) window.TrackX.perf.end('calendar fetch');
    } catch (err) {
      console.warn('[TrackX Calendar Month Fetch Notice]:', err.message);
    }
  }

  // ==========================================
  // REAL-TIME LISTENERS (Scoped: Today & Active Habits Only)
  // ==========================================

  function areHabitsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || a[i].name !== b[i].name || a[i].category !== b[i].category || a[i].icon !== b[i].icon || a[i].frequency !== b[i].frequency) {
        return false;
      }
    }
    return true;
  }

  function areArraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    const setA = new Set(a);
    for (let item of b) {
      if (!setA.has(item)) return false;
    }
    return true;
  }

  function isWellnessChanged(existing, incoming) {
    if (!existing) return true;
    if (incoming.waterIntake !== undefined && incoming.waterIntake !== existing.waterIntake) return true;
    if (incoming.waterGoal !== undefined && incoming.waterGoal !== existing.waterGoal) return true;
    if (incoming.focusMinutes !== undefined && incoming.focusMinutes !== existing.focusMinutes) return true;

    if (incoming.sleep) {
      const es = existing.sleep || {};
      if (incoming.sleep.hours !== es.hours || incoming.sleep.quality !== es.quality) return true;
    }
    if (incoming.exercise) {
      const ee = existing.exercise || {};
      if (incoming.exercise.minutes !== ee.minutes || incoming.exercise.type !== ee.type) return true;
    }
    if (incoming.mood) {
      const em = existing.mood || {};
      if (incoming.mood.rating !== em.rating || incoming.mood.energy !== em.energy) return true;
    }
    return false;
  }

  function attachRealtimeListeners(uid) {
    cleanupListeners();

    const fb = window.TrackX.firebase;
    if (!fb || typeof fb.isConfigured !== 'function' || !fb.isConfigured()) return;

    try {
      const db = fb.getFirestore();
      const userDocRef = db.collection('users').doc(uid);
      const todayKey = window.TrackX.utils ? window.TrackX.utils.getTodayKey() : new Date().toISOString().slice(0, 10);

      // 1. Listen to Habits Subcollection (infrequent changes, necessary for multi-device sync)
      const habitsUnsub = userDocRef.collection('habits').onSnapshot((snapshot) => {
        if (isCloudSyncing) return;
        const updatedHabits = [];
        snapshot.forEach((doc) => updatedHabits.push(doc.data()));
        if (updatedHabits.length > 0 && window.TrackX.state) {
          if (!areHabitsEqual(window.TrackX.state.data.habits, updatedHabits)) {
            window.TrackX.state.data.habits = updatedHabits;
            window.TrackX.state.notify('cloud_habits_update');
          }
        }
      }, (err) => console.warn('[TrackX Habits Listener Notice]:', err.message));
      activeUnsubscribers.push(habitsUnsub);

      // 2. Listen ONLY to Today's Completion Document (NOT entire history!)
      const compUnsub = userDocRef.collection('completions').doc(todayKey).onSnapshot((docSnap) => {
        if (isCloudSyncing) return;
        if (docSnap.exists && window.TrackX.state) {
          const data = docSnap.data();
          if (data && data.completedHabits) {
            const existing = window.TrackX.state.data.logs[todayKey] || { completedHabits: [] };
            if (!areArraysEqual(existing.completedHabits, data.completedHabits)) {
              if (!window.TrackX.state.data.logs[todayKey]) {
                window.TrackX.state.data.logs[todayKey] = { completedHabits: [] };
              }
              window.TrackX.state.data.logs[todayKey].completedHabits = data.completedHabits;
              window.TrackX.state.notify('cloud_today_update');
            }
          }
        }
      }, (err) => console.warn('[TrackX Today Completion Listener Notice]:', err.message));
      activeUnsubscribers.push(compUnsub);

      // 3. Listen ONLY to Today's Wellness Document (NOT entire history!)
      const wellUnsub = userDocRef.collection('wellness').doc(todayKey).onSnapshot((docSnap) => {
        if (isCloudSyncing) return;
        if (docSnap.exists && window.TrackX.state) {
          const data = docSnap.data();
          if (data) {
            const existing = window.TrackX.state.data.logs[todayKey] || { completedHabits: [] };
            if (isWellnessChanged(existing, data)) {
              window.TrackX.state.data.logs[todayKey] = {
                ...existing,
                waterIntake: data.waterIntake !== undefined ? data.waterIntake : existing.waterIntake,
                waterGoal: data.waterGoal || existing.waterGoal || 2500,
                sleep: data.sleep || existing.sleep || {},
                exercise: data.exercise || existing.exercise || {},
                mood: data.mood || existing.mood || {},
                focusMinutes: data.focusMinutes !== undefined ? data.focusMinutes : existing.focusMinutes
              };
              window.TrackX.state.notify('cloud_today_wellness_update');
            }
          }
        }
      }, (err) => console.warn('[TrackX Today Wellness Listener Notice]:', err.message));
      activeUnsubscribers.push(wellUnsub);

    } catch (err) {
      console.warn('[TrackX Realtime Listener Attach Warning]:', err);
    }
  }

  // ==========================================
  // DISPATCH CRUD OPERATIONS TO FIRESTORE
  // ==========================================

  async function saveHabit(habit) {
    if (!currentUserId || !habit) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .collection('habits').doc(habit.id)
          .set({ ...habit, updatedAt: nowISO }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Habit Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function deleteHabit(habitId) {
    if (!currentUserId || !habitId) return;
    const fb = window.TrackX.firebase;

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .collection('habits').doc(habitId).delete();
      } catch (err) {
        console.warn('[TrackX Delete Habit Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function saveCompletion(dateKey, completedHabits) {
    if (!currentUserId || !dateKey) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .collection('completions').doc(dateKey)
          .set({
            date: dateKey,
            completedHabits: completedHabits || [],
            updatedAt: nowISO
          }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Completion Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function saveWellness(dateKey, wellnessData) {
    if (!currentUserId || !dateKey || !wellnessData) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .collection('wellness').doc(dateKey)
          .set({
            date: dateKey,
            waterIntake: wellnessData.waterIntake || 0,
            waterGoal: wellnessData.waterGoal || 2500,
            sleep: wellnessData.sleep || {},
            exercise: wellnessData.exercise || {},
            mood: wellnessData.mood || {},
            focusMinutes: wellnessData.focusMinutes || 0,
            updatedAt: nowISO
          }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Wellness Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function saveFocusSession(session) {
    if (!currentUserId || !session) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        const sessionId = session.id || ('fs_' + Date.now().toString(36));
        await db.collection('users').doc(currentUserId)
          .collection('focusSessions').doc(sessionId)
          .set({
            ...session,
            id: sessionId,
            updatedAt: nowISO
          }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Focus Session Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function saveAchievement(achievement) {
    if (!currentUserId || !achievement) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .collection('achievements').doc(achievement.id)
          .set({
            ...achievement,
            updatedAt: nowISO
          }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Achievement Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function saveSettings(settings) {
    if (!currentUserId || !settings) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .set({
            settings: settings,
            updatedAt: nowISO
          }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Settings Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function saveProfile(profile) {
    if (!currentUserId || !profile) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        isCloudSyncing = true;
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .set({
            profile: profile,
            updatedAt: nowISO
          }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Profile Notice]:', err.message);
      } finally {
        setTimeout(() => { isCloudSyncing = false; }, 200);
      }
    } else {
      syncSimulationToLocal();
    }
  }

  async function saveNotifications(notificationsState) {
    if (!currentUserId || !notificationsState) return;
    const fb = window.TrackX.firebase;
    const nowISO = new Date().toISOString();

    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        const db = fb.getFirestore();
        await db.collection('users').doc(currentUserId)
          .collection('notifications').doc('state')
          .set({
            ...notificationsState,
            updatedAt: nowISO
          }, { merge: true });
      } catch (err) {
        console.warn('[TrackX Save Notifications Notice]:', err.message);
      }
    }
  }

  function syncSimulationToLocal() {
    if (!currentUserId || !window.TrackX.state) return;
    try {
      localStorage.setItem(`trackx_cloud_data_${currentUserId}`, JSON.stringify(window.TrackX.state.data));
    } catch (e) {}
  }

  // ==========================================
  // EXPORT MODULE
  // ==========================================

  window.TrackX.firestoreSync = {
    init,
    initUserSync,
    hydrateToday,
    loadSecondaryData,
    loadCalendarMonth,
    cleanup,
    checkCloudDataExists,
    importLocalDataToCloud,
    startFreshCloudAccount,
    saveHabit,
    deleteHabit,
    saveCompletion,
    saveWellness,
    saveFocusSession,
    saveAchievement,
    saveSettings,
    saveProfile,
    saveNotifications,
    getCurrentUserId: () => currentUserId
  };

})(window);
