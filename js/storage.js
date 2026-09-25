/**
 * TRACKX - Persistence & Seed Data Layer
 * LocalStorage management, UID-scoped persistence, clean state generator, import/export
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { getTodayKey, addDays } = window.TrackX.utils;

  const LEGACY_STORAGE_KEY = 'trackx_data_v1';
  let currentUserId = null;

  function setCurrentUserId(uid) {
    currentUserId = uid || null;
  }

  function getCurrentUserId() {
    return currentUserId;
  }

  function getStorageKey(uid = currentUserId) {
    if (uid) return `trackx_data_${uid}`;
    return 'trackx_data_guest';
  }

  function getDefaultHabits(refDate = getTodayKey()) {
    return [
      {
        id: 'h1',
        name: 'Morning Meditation',
        category: 'mind',
        icon: '🧘',
        frequency: 'daily',
        createdAt: refDate
      },
      {
        id: 'h2',
        name: 'Read 20 Pages',
        category: 'growth',
        icon: '📖',
        frequency: 'daily',
        createdAt: refDate
      },
      {
        id: 'h3',
        name: 'Drink 2.5L Water',
        category: 'body',
        icon: '💧',
        frequency: 'daily',
        createdAt: refDate
      },
      {
        id: 'h4',
        name: '30m Deep Work',
        category: 'focus',
        icon: '🎯',
        frequency: 'daily',
        createdAt: refDate
      },
      {
        id: 'h5',
        name: 'Evening Walk & Stretch',
        category: 'body',
        icon: '🏃',
        frequency: 'daily',
        createdAt: refDate
      },
      {
        id: 'h6',
        name: '8h Restful Sleep',
        category: 'body',
        icon: '🌙',
        frequency: 'daily',
        createdAt: refDate
      }
    ];
  }

  function getDefaultAchievements() {
    return [
      {
        id: 'habit_first',
        title: 'First Step',
        desc: 'Complete your first habit check-in',
        icon: '🌱',
        category: 'habits',
        unlockedAt: null
      },
      {
        id: 'streak_spark',
        title: 'Spark',
        desc: 'Maintain a 3-day active habit streak',
        icon: '🔥',
        category: 'streaks',
        unlockedAt: null
      },
      {
        id: 'streak_momentum',
        title: 'Momentum',
        desc: 'Maintain a 7-day active habit streak',
        icon: '🔥',
        category: 'streaks',
        unlockedAt: null
      },
      {
        id: 'wellness_water_3',
        title: 'Hydration Hero',
        desc: 'Reach your water goal for 3 days',
        icon: '💧',
        category: 'wellness',
        unlockedAt: null
      },
      {
        id: 'focus_deep_work',
        title: 'Deep Work',
        desc: 'Complete 5 deep focus sessions',
        icon: '🧠',
        category: 'focus',
        unlockedAt: null
      },
      {
        id: 'secret_centurion',
        title: 'Flawless Century',
        desc: 'Achieve 100% daily score across 5 different days',
        icon: '⚡',
        category: 'milestones',
        isSecret: true,
        unlockedAt: null
      },
      {
        id: 'wellness_calm_7',
        title: 'Calm Mind',
        desc: 'Complete meditation or mindfulness for 7 days',
        icon: '🧘',
        category: 'wellness',
        unlockedAt: null
      },
      {
        id: 'secret_recharged',
        title: 'Recharged Pioneer',
        desc: 'Log 8+ hours restful sleep after a deep focus session',
        icon: '🌟',
        category: 'milestones',
        isSecret: true,
        unlockedAt: null
      }
    ];
  }

  function getDefaultSeedData() {
    const today = getTodayKey();

    const logs = {};
    logs[today] = {
      completedHabits: [],
      waterIntake: 0,
      waterGoal: 2500,
      sleep: {
        hours: 0,
        quality: 3,
        bedtime: '',
        waketime: ''
      },
      exercise: {
        minutes: 0,
        type: 'General Fitness',
        intensity: 'moderate'
      },
      mood: {
        rating: 0,
        energy: 0,
        tags: [],
        note: ''
      },
      focusMinutes: 0
    };

    return {
      version: 1,
      user: {
        name: 'TrackX User',
        avatar: '✨',
        bio: 'Becoming 1% better every day.'
      },
      settings: {
        theme: 'light',
        sounds: true,
        dailyWaterGoal: 2500,
        dailySleepGoal: 8,
        dailyFocusGoal: 60,
        dailyExerciseGoal: 30
      },
      habits: getDefaultHabits(today),
      achievements: getDefaultAchievements(),
      notifications: {
        readIds: [],
        dismissedIds: [],
        timestamps: {},
        custom: []
      },
      logs
    };
  }

  function getCleanUserData(userProfile = {}, welcomeNotification = null) {
    const today = getTodayKey();
    const notificationsState = {
      readIds: [],
      dismissedIds: [],
      timestamps: {},
      custom: []
    };

    if (welcomeNotification) {
      notificationsState.custom.push(welcomeNotification);
      notificationsState.timestamps[welcomeNotification.id] = welcomeNotification.timestamp || Date.now();
    }

    const logs = {};
    logs[today] = {
      completedHabits: [],
      waterIntake: 0,
      waterGoal: 2500,
      sleep: {
        hours: 0,
        quality: 3,
        bedtime: '',
        waketime: ''
      },
      exercise: {
        minutes: 0,
        type: 'General Fitness',
        intensity: 'moderate'
      },
      mood: {
        rating: 0,
        energy: 0,
        tags: [],
        note: ''
      },
      focusMinutes: 0
    };

    return {
      version: 1,
      user: {
        name: userProfile.name || 'TrackX User',
        email: userProfile.email || '',
        avatar: userProfile.avatar || '✨',
        bio: userProfile.bio || 'Becoming 1% better every day.',
        uid: userProfile.uid || ''
      },
      settings: {
        theme: 'light',
        sounds: true,
        dailyWaterGoal: 2500,
        dailySleepGoal: 8,
        dailyFocusGoal: 60,
        dailyExerciseGoal: 30
      },
      habits: getDefaultHabits(today),
      achievements: getDefaultAchievements(),
      notifications: notificationsState,
      logs
    };
  }

  function loadData(explicitUid) {
    const uid = explicitUid || currentUserId;
    const key = getStorageKey(uid);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        // If guest mode, check legacy key
        if (!uid) {
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            const parsedLegacy = JSON.parse(legacy);
            if (parsedLegacy && parsedLegacy.habits && parsedLegacy.logs) {
              return parsedLegacy;
            }
          }
        }
        const seed = getDefaultSeedData();
        saveData(seed, true, uid);
        return seed;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.habits || !parsed.logs) {
        const seed = getDefaultSeedData();
        saveData(seed, true, uid);
        return seed;
      }
      return parsed;
    } catch (err) {
      console.error('Error loading data from localStorage, falling back to seed:', err);
      return getDefaultSeedData();
    }
  }

  let saveDebounceTimer = null;

  function saveData(data, immediate = false, explicitUid) {
    const uid = explicitUid || currentUserId;
    const key = getStorageKey(uid);

    if (immediate) {
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
      }
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (err) {
        console.error('Error saving data to localStorage:', err);
      }
      return;
    }

    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (err) {
        console.error('Error saving data to localStorage:', err);
      }
      saveDebounceTimer = null;
    }, 250);
  }

  function exportDataAsJSON(data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackx-backup-${getTodayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importDataFromJSON(fileContent) {
    try {
      const parsed = JSON.parse(fileContent);
      if (!parsed.habits || !parsed.logs || !Array.isArray(parsed.habits)) {
        throw new Error('Invalid TrackX backup file format.');
      }
      saveData(parsed);
      return { success: true, data: parsed };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  window.TrackX.storage = {
    getDefaultHabits,
    getDefaultAchievements,
    getDefaultSeedData,
    getCleanUserData,
    loadData,
    saveData,
    setCurrentUserId,
    getCurrentUserId,
    getStorageKey,
    exportDataAsJSON,
    importDataFromJSON
  };

})(window);
