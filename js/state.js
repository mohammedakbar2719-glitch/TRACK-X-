/**
 * TRACKX - Central Reactive State Store
 * Unified single source of truth, score calculation, streaks, reactive event dispatching
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { loadData, saveData, getDefaultSeedData } = window.TrackX.storage;
  const { getTodayKey, addDays, triggerConfetti, showToast, sounds } = window.TrackX.utils;

  class StateManager {
    constructor() {
      this.data = loadData();
      if (!this.data.notifications) {
        this.data.notifications = { readIds: [], dismissedIds: [], timestamps: {} };
      }
      this.selectedDate = getTodayKey();
      this.activeView = 'today';
      this.subscribers = new Set();
      this._scoreCache = new Map();
      this._streakCache = null;
      this._habitStreakCache = new Map();
      this._achievementDebounceTimer = null;
    }

    _invalidateCaches(dateStr = null) {
      if (dateStr) {
        this._scoreCache.delete(dateStr);
      } else {
        this._scoreCache.clear();
      }
      this._streakCache = null;
      this._habitStreakCache.clear();
    }

    clearScoreCache(dateStr = null) {
      this._invalidateCaches(dateStr);
    }

    subscribe(fn) {
      this.subscribers.add(fn);
      return () => this.subscribers.delete(fn);
    }

    notify(event = 'state_updated') {
      saveData(this.data);
      this.subscribers.forEach((fn) => {
        try {
          fn(event, this);
        } catch (err) {
          console.error('Error in state subscriber:', err);
        }
      });
    }

    getActiveView() {
      return this.activeView;
    }

    setActiveView(view) {
      this.activeView = view;
      this.notify('view_changed');
    }

    getSelectedDate() {
      return this.selectedDate;
    }

    setSelectedDate(dateStr) {
      this.selectedDate = dateStr;
      this.notify('date_changed');
    }

    getPlayerXP() {
      if (window.TrackX && window.TrackX.achievements && typeof window.TrackX.achievements.calculatePlayerXP === 'function') {
        return window.TrackX.achievements.calculatePlayerXP();
      }
      return { totalXP: 0, currentLevel: { level: 1, title: 'Starter', icon: '🌱' }, levelPct: 0 };
    }

    getDailySummary(dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      const habits = this.data.habits || [];
      const completedHabitIds = log.completedHabits || [];

      const completedHabits = habits.filter((h) => completedHabitIds.includes(h.id));
      const missedHabits = habits.filter((h) => !completedHabitIds.includes(h.id));
      const completionPct = habits.length > 0 ? Math.round((completedHabits.length / habits.length) * 100) : 0;
      const dailyScore = this.calculateDailyScore(dateStr);
      const streak = this.calculateOverallStreak(dateStr);

      // Skill performance for the day
      const skillBreakdown = {};
      habits.forEach((h) => {
        const cat = (h.category || 'general').toLowerCase();
        if (!skillBreakdown[cat]) {
          skillBreakdown[cat] = { total: 0, completed: 0 };
        }
        skillBreakdown[cat].total++;
        if (completedHabitIds.includes(h.id)) {
          skillBreakdown[cat].completed++;
        }
      });

      const skillsSummary = Object.keys(skillBreakdown).map((cat) => {
        const item = skillBreakdown[cat];
        const pct = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
        return {
          category: cat,
          total: item.total,
          completed: item.completed,
          pct
        };
      });

      const habitXP = completedHabits.length * 10;
      const bonusXP = completionPct === 100 ? 25 : 0;
      let achievementXP = 0;
      const unlockedAchievements = (this.data.achievements || []).filter((a) => a.unlockedAt === dateStr);
      unlockedAchievements.forEach((a) => {
        achievementXP += (a.xp || 100);
      });
      const totalDayXP = habitXP + bonusXP + achievementXP;

      let topInsight = null;
      if (window.TrackX && window.TrackX.insights && typeof window.TrackX.insights.generateSmartInsights === 'function') {
        const insights = window.TrackX.insights.generateSmartInsights(30);
        if (insights && insights.length > 0) {
          topInsight = insights[0];
        }
      }

      return {
        dateStr,
        dailyScore,
        totalHabits: habits.length,
        completedCount: completedHabits.length,
        missedCount: missedHabits.length,
        completedHabits,
        missedHabits,
        completionPct,
        streak,
        skillsSummary,
        totalDayXP,
        habitXP,
        bonusXP,
        achievementXP,
        unlockedAchievements,
        topInsight
      };
    }

    getDayLog(dateStr = this.selectedDate, createIfMissing = true) {
      if (!this.data) {
        this.data = { habits: [], logs: {}, settings: {}, user: {} };
      }
      if (!this.data.logs) {
        this.data.logs = {};
      }
      if (!this.data.settings) {
        this.data.settings = { theme: 'light', sounds: true, dailyWaterGoal: 2500, dailySleepGoal: 8, dailyFocusGoal: 60, dailyExerciseGoal: 30 };
      }
      if (!Array.isArray(this.data.habits)) {
        this.data.habits = [];
      }

      const defaultLog = {
        completedHabits: [],
        waterIntake: 0,
        waterGoal: (this.data.settings && this.data.settings.dailyWaterGoal) || 2500,
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

      if (!this.data.logs[dateStr]) {
        if (!createIfMissing) {
          return defaultLog;
        }
        this.data.logs[dateStr] = defaultLog;
      } else {
        const log = this.data.logs[dateStr];
        if (!Array.isArray(log.completedHabits)) {
          log.completedHabits = [];
        }
        if (typeof log.waterIntake !== 'number') {
          log.waterIntake = 0;
        }
        if (!log.waterGoal) {
          log.waterGoal = (this.data.settings && this.data.settings.dailyWaterGoal) || 2500;
        }
        if (!log.sleep) {
          log.sleep = { hours: 0, quality: 3, bedtime: '', waketime: '' };
        }
        if (!log.exercise) {
          log.exercise = { minutes: 0, type: 'General Fitness', intensity: 'moderate' };
        }
        if (!log.mood) {
          log.mood = { rating: 0, energy: 0, tags: [], note: '' };
        }
        if (typeof log.focusMinutes !== 'number') {
          log.focusMinutes = 0;
        }
      }
      return this.data.logs[dateStr];
    }

    calculateDailyScore(dateStr = this.selectedDate) {
      if (this._scoreCache.has(dateStr)) {
        return this._scoreCache.get(dateStr);
      }

      const log = this.getDayLog(dateStr, false);
      const activeHabits = Array.isArray(this.data.habits) ? this.data.habits : [];
      const completedHabits = (log && Array.isArray(log.completedHabits)) ? log.completedHabits : [];

      // 1. Habit Completion (50 points)
      let habitScore = 0;
      if (activeHabits.length > 0) {
        const completedCount = completedHabits.filter((id) =>
          activeHabits.some((h) => h.id === id)
        ).length;
        habitScore = (completedCount / activeHabits.length) * 50;
      }

      // 2. Hydration (15 points)
      const waterGoal = (log && log.waterGoal) || (this.data.settings && this.data.settings.dailyWaterGoal) || 2500;
      const waterScore = Math.min(1, ((log && log.waterIntake) || 0) / waterGoal) * 15;

      // 3. Sleep (15 points)
      let sleepScore = 0;
      if (log && log.sleep && log.sleep.hours > 0) {
        const sleepGoal = (this.data.settings && this.data.settings.dailySleepGoal) || 8;
        const hourRatio = Math.min(1, log.sleep.hours / sleepGoal);
        const qualityRatio = (log.sleep.quality || 3) / 5;
        sleepScore = (hourRatio * 0.7 + qualityRatio * 0.3) * 15;
      }

      // 4. Focus (10 points)
      let focusScore = 0;
      if (log && log.focusMinutes > 0) {
        const focusGoal = (this.data.settings && this.data.settings.dailyFocusGoal) || 60;
        focusScore = Math.min(1, log.focusMinutes / focusGoal) * 10;
      }

      // 5. Exercise & Mood (10 points)
      let wellnessScore = 0;
      if (log && log.exercise && log.exercise.minutes > 0) {
        const exGoal = (this.data.settings && this.data.settings.dailyExerciseGoal) || 30;
        wellnessScore += Math.min(1, log.exercise.minutes / exGoal) * 5;
      }
      if (log && log.mood && log.mood.rating > 0) {
        wellnessScore += (log.mood.rating / 5) * 5;
      }

      const totalScore = Math.min(100, Math.max(0, Math.round(habitScore + waterScore + sleepScore + focusScore + wellnessScore)));
      this._scoreCache.set(dateStr, totalScore);
      return totalScore;
    }

    calculateHabitStreak(habitId, refDateStr = getTodayKey()) {
      const cacheKey = `${habitId}_${refDateStr}`;
      if (this._habitStreakCache.has(cacheKey)) {
        return this._habitStreakCache.get(cacheKey);
      }

      let streak = 0;
      let curr = refDateStr;

      const todayDone = (this.getDayLog(curr, false).completedHabits || []).includes(habitId);
      if (todayDone) {
        streak++;
        curr = addDays(curr, -1);
      } else {
        const yesterday = addDays(curr, -1);
        const yDone = (this.getDayLog(yesterday, false).completedHabits || []).includes(habitId);
        if (yDone) {
          curr = yesterday;
        } else {
          this._habitStreakCache.set(cacheKey, 0);
          return 0;
        }
      }

      let iterations = 0;
      while (iterations < 365) {
        iterations++;
        const log = this.getDayLog(curr, false);
        if (log.completedHabits && log.completedHabits.includes(habitId)) {
          if (curr !== refDateStr || !todayDone) {
            streak++;
          }
          curr = addDays(curr, -1);
        } else {
          break;
        }
      }

      this._habitStreakCache.set(cacheKey, streak);
      return streak;
    }

    calculateOverallStreak(refDateStr = getTodayKey()) {
      if (refDateStr === getTodayKey() && this._streakCache !== null) {
        return this._streakCache;
      }

      let streak = 0;
      let curr = refDateStr;

      const todayScore = this.calculateDailyScore(curr);
      const todayActive = todayScore >= 40;

      if (todayActive) {
        streak++;
        curr = addDays(curr, -1);
      } else {
        const yesterday = addDays(curr, -1);
        const yScore = this.calculateDailyScore(yesterday);
        if (yScore >= 40) {
          curr = yesterday;
        } else {
          if (refDateStr === getTodayKey()) this._streakCache = 0;
          return 0;
        }
      }

      let iterations = 0;
      while (iterations < 365) {
        iterations++;
        const score = this.calculateDailyScore(curr);
        if (score >= 40) {
          if (curr !== refDateStr || !todayActive) {
            streak++;
          }
          curr = addDays(curr, -1);
        } else {
          break;
        }
      }

      if (refDateStr === getTodayKey()) {
        this._streakCache = streak;
      }
      return streak;
    }

    calculateBestStreak() {
      const dates = Object.keys(this.data.logs).sort();
      if (dates.length === 0) return 0;

      let best = 0;
      let currentRun = 0;
      let prevDate = null;

      dates.forEach((dateStr) => {
        const score = this.calculateDailyScore(dateStr);
        if (score >= 40) {
          if (!prevDate || addDays(prevDate, 1) === dateStr) {
            currentRun++;
          } else {
            currentRun = 1;
          }
          best = Math.max(best, currentRun);
        } else {
          currentRun = 0;
        }
        prevDate = dateStr;
      });

      return Math.max(best, this.calculateOverallStreak());
    }

    toggleHabit(habitId, dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      const idx = log.completedHabits.indexOf(habitId);
      const isCompleting = idx < 0;

      const habitObj = this.data.habits.find((h) => h.id === habitId);
      const habitName = habitObj ? habitObj.name : 'Habit';
      const habitCategory = habitObj ? (habitObj.category || 'general').toLowerCase() : 'general';
      const habitIcon = habitObj && habitObj.icon ? habitObj.icon : '✓';

      if (!isCompleting) {
        // Undo habit completion
        log.completedHabits.splice(idx, 1);
        sounds.playPop();
      } else {
        // Complete habit
        log.completedHabits.push(habitId);
        sounds.playSuccess();
      }

      this._invalidateCaches(dateStr);

      // 1. Check achievements & unlock newly fulfilled milestones
      let newlyUnlocked = [];
      if (window.TrackX && window.TrackX.achievements && typeof window.TrackX.achievements.checkAndUnlockAll === 'function') {
        newlyUnlocked = window.TrackX.achievements.checkAndUnlockAll();
      }

      // 2. Compute updated progress & skill impact
      const activeIds = this.data.habits.map((h) => h.id);
      const allDone = activeIds.length > 0 && activeIds.every((id) => log.completedHabits.includes(id));

      // 3. Contextual notification & toasts on completion
      if (isCompleting && newlyUnlocked.length === 0) {
        if (allDone) {
          triggerConfetti();
          showToast({
            title: '🔥 All habits completed!',
            message: 'Incredible dedication! +25 XP bonus earned.',
            type: 'success',
            icon: '🎉'
          });
        } else {
          if (habitCategory === 'focus') {
            showToast({
              title: '🎯 Focus progress',
              message: `${habitName} completed (+10 XP). Flow state building.`,
              type: 'success',
              icon: '🎯'
            });
          } else if (habitCategory === 'mind') {
            showToast({
              title: '🧘 Mind progress',
              message: `${habitName} completed (+10 XP). Mindfulness consistency improved.`,
              type: 'success',
              icon: '🧘'
            });
          } else if (habitCategory === 'body') {
            showToast({
              title: '🏃 Vitality progress',
              message: `${habitName} completed (+10 XP). Health & vitality boosted.`,
              type: 'success',
              icon: '🏃'
            });
          } else {
            showToast({
              title: '✓ Habit completed',
              message: `${habitName} completed (+10 XP).`,
              type: 'success',
              icon: habitIcon
            });
          }
        }
      }

      // 4. Save and notify all listeners (Dashboard, Progress, Calendar, Achievements, Notifications)
      this.notify('habit_toggled');

      // Dispatch to Firestore if authenticated
      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveCompletion === 'function') {
        window.TrackX.firestoreSync.saveCompletion(dateStr, log.completedHabits);
      }
    }

    addHabit({ name, category, icon, frequency }) {
      const newHabit = {
        id: 'h_' + Date.now(),
        name: name.trim(),
        category: category || 'general',
        icon: icon || '✨',
        frequency: frequency || 'daily',
        createdAt: getTodayKey()
      };
      this.data.habits.push(newHabit);
      this._invalidateCaches();
      showToast(`Habit "${newHabit.name}" added!`, 'success', newHabit.icon);
      this.notify('habit_added');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveHabit === 'function') {
        window.TrackX.firestoreSync.saveHabit(newHabit);
      }

      return newHabit;
    }

    updateHabit(habitId, updates) {
      const habit = this.data.habits.find((h) => h.id === habitId);
      if (!habit) return;
      Object.assign(habit, updates);
      this._invalidateCaches();
      showToast(`Habit updated`, 'info', '✏️');
      this.notify('habit_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveHabit === 'function') {
        window.TrackX.firestoreSync.saveHabit(habit);
      }
    }

    deleteHabit(habitId) {
      const habit = this.data.habits.find((h) => h.id === habitId);
      if (!habit) return;
      this.data.habits = this.data.habits.filter((h) => h.id !== habitId);
      Object.values(this.data.logs).forEach((log) => {
        if (log.completedHabits) {
          log.completedHabits = log.completedHabits.filter((id) => id !== habitId);
        }
      });
      this._invalidateCaches();
      showToast(`Deleted habit "${habit.name}"`, 'info', '🗑️');
      this.notify('habit_deleted');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.deleteHabit === 'function') {
        window.TrackX.firestoreSync.deleteHabit(habitId);
      }
    }

    addWater(amountMl, dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      log.waterIntake = Math.max(0, (log.waterIntake || 0) + amountMl);
      this._invalidateCaches(dateStr);
      sounds.playPop();

      const goal = log.waterGoal || this.data.settings.dailyWaterGoal || 2500;
      if (log.waterIntake >= goal && log.waterIntake - amountMl < goal) {
        showToast('Daily water goal achieved! 🌊', 'success', '💧');
        triggerConfetti();
      }

      this.checkAndUnlockAchievements();
      this.notify('water_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveWellness === 'function') {
        window.TrackX.firestoreSync.saveWellness(dateStr, this.getDayLog(dateStr));
      }
    }

    setWaterIntake(amountMl, dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      log.waterIntake = Math.max(0, amountMl);
      this._invalidateCaches(dateStr);
      this.notify('water_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveWellness === 'function') {
        window.TrackX.firestoreSync.saveWellness(dateStr, this.getDayLog(dateStr));
      }
    }

    setMood(rating, energy, tags = [], note = '', dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      log.mood = { rating, energy, tags, note };
      this._invalidateCaches(dateStr);
      sounds.playPop();
      showToast('Mood & energy saved', 'success', '😊');
      this.checkAndUnlockAchievements();
      this.notify('mood_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveWellness === 'function') {
        window.TrackX.firestoreSync.saveWellness(dateStr, this.getDayLog(dateStr));
      }
    }

    setSleep(hours, quality, bedtime = '', waketime = '', dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      log.sleep = { hours: Number(hours), quality: Number(quality), bedtime, waketime };
      this._invalidateCaches(dateStr);
      sounds.playPop();
      showToast('Sleep log saved', 'success', '🌙');
      this.checkAndUnlockAchievements();
      this.notify('sleep_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveWellness === 'function') {
        window.TrackX.firestoreSync.saveWellness(dateStr, this.getDayLog(dateStr));
      }
    }

    setExercise(minutes, type, intensity, dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      log.exercise = { minutes: Number(minutes), type, intensity };
      this._invalidateCaches(dateStr);
      sounds.playPop();
      showToast('Exercise session recorded', 'success', '💪');
      this.checkAndUnlockAchievements();
      this.notify('exercise_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveWellness === 'function') {
        window.TrackX.firestoreSync.saveWellness(dateStr, this.getDayLog(dateStr));
      }
    }

    addFocusMinutes(minutes, dateStr = this.selectedDate) {
      const log = this.getDayLog(dateStr);
      log.focusMinutes = (log.focusMinutes || 0) + Number(minutes);
      this._invalidateCaches(dateStr);
      showToast(`Logged ${minutes}m of deep focus!`, 'success', '🎯');
      this.checkAndUnlockAchievements();
      this.notify('focus_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveWellness === 'function') {
        window.TrackX.firestoreSync.saveWellness(dateStr, this.getDayLog(dateStr));
      }

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveFocusSession === 'function') {
        window.TrackX.firestoreSync.saveFocusSession({
          date: dateStr,
          minutes: Number(minutes),
          completedAt: new Date().toISOString()
        });
      }
    }

    checkAndUnlockAchievements() {
      if (this._achievementDebounceTimer) {
        clearTimeout(this._achievementDebounceTimer);
      }
      this._achievementDebounceTimer = setTimeout(() => {
        this._runAchievementCheck();
      }, 150);
    }

    _runAchievementCheck() {
      if (window.TrackX && window.TrackX.achievements && typeof window.TrackX.achievements.checkAndUnlockAll === 'function') {
        window.TrackX.achievements.checkAndUnlockAll();
        return;
      }

      const today = getTodayKey();
      const streak = this.calculateOverallStreak();

      let totalCompletedHabits = 0;
      let waterGoalDays = 0;
      let maxFocus = 0;
      let highestScore = 0;
      let perfectSleepLogged = false;

      Object.entries(this.data.logs).forEach(([d, log]) => {
        if (log.completedHabits) totalCompletedHabits += log.completedHabits.length;
        if (log.waterIntake >= (log.waterGoal || 2500)) waterGoalDays++;
        if ((log.focusMinutes || 0) > maxFocus) maxFocus = log.focusMinutes;
        if (log.sleep && log.sleep.hours >= 8 && log.sleep.quality >= 5) perfectSleepLogged = true;

        const score = this.calculateDailyScore(d);
        if (score > highestScore) highestScore = score;
      });

      const unlock = (id) => {
        const ach = this.data.achievements.find((a) => a.id === id);
        if (ach && !ach.unlockedAt) {
          ach.unlockedAt = today;
          showToast({
            title: '🏆 Achievement unlocked',
            message: `${ach.title} is now unlocked.`,
            type: 'success',
            icon: ach.icon || '🏆'
          });
          triggerConfetti();

          if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveAchievement === 'function') {
            window.TrackX.firestoreSync.saveAchievement(ach);
          }
        }
      };

      if (totalCompletedHabits >= 1) unlock('first_habit');
      if (streak >= 3) unlock('streak_3');
      if (streak >= 7) unlock('streak_7');
      if (waterGoalDays >= 3) unlock('hydration_hero');
      if (maxFocus >= 60) unlock('deep_work');
      if (highestScore >= 95) unlock('perfect_day');
      if (perfectSleepLogged) unlock('sleep_well');
    }

    updateSettings(newSettings) {
      if (!newSettings || typeof newSettings !== 'object') return;
      this.data.settings = this.data.settings || {};

      let changed = false;
      for (const [key, value] of Object.entries(newSettings)) {
        if (value !== undefined && this.data.settings[key] !== value) {
          this.data.settings[key] = value;
          changed = true;
        }
      }

      if (newSettings.sounds !== undefined) {
        const soundBool = Boolean(newSettings.sounds);
        if (sounds.enabled !== soundBool) {
          sounds.enabled = soundBool;
          changed = true;
        }
      }

      if (!changed) return;

      this.notify('settings_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveSettings === 'function') {
        window.TrackX.firestoreSync.saveSettings(this.data.settings);
      }
    }

    updateProfile(profile) {
      if (!profile || typeof profile !== 'object') return;
      this.data.user = this.data.user || {};

      let changed = false;
      for (const [key, value] of Object.entries(profile)) {
        if (value !== undefined && this.data.user[key] !== value) {
          this.data.user[key] = value;
          changed = true;
        }
      }

      if (!changed) return;

      this.notify('profile_updated');

      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveProfile === 'function') {
        window.TrackX.firestoreSync.saveProfile(this.data.user);
      }
    }

    loadFromCloud(cloudData, replaceAll = false) {
      if (!cloudData) return;
      this._invalidateCaches();
      const isDifferentUser = Boolean(
        cloudData.user &&
        cloudData.user.uid &&
        (!this.data.user || this.data.user.uid !== cloudData.user.uid)
      );

      const shouldReplace = replaceAll || isDifferentUser;

      if (cloudData.habits && Array.isArray(cloudData.habits)) {
        this.data.habits = [...cloudData.habits];
      }
      if (cloudData.logs && typeof cloudData.logs === 'object') {
        if (shouldReplace) {
          this.data.logs = { ...cloudData.logs };
        } else {
          this.data.logs = { ...this.data.logs, ...cloudData.logs };
        }
      }
      if (cloudData.achievements && Array.isArray(cloudData.achievements)) {
        this.data.achievements = [...cloudData.achievements];
      }
      if (cloudData.settings && typeof cloudData.settings === 'object') {
        this.data.settings = shouldReplace
          ? { ...cloudData.settings }
          : { ...this.data.settings, ...cloudData.settings };
      }
      if (cloudData.user && typeof cloudData.user === 'object') {
        this.data.user = shouldReplace
          ? { ...cloudData.user }
          : { ...this.data.user, ...cloudData.user };
      }
      if (cloudData.notifications && typeof cloudData.notifications === 'object') {
        if (shouldReplace) {
          this.data.notifications = { ...cloudData.notifications };
        } else {
          this.data.notifications = { ...this.data.notifications, ...cloudData.notifications };
        }
      }
      this.notify('cloud_hydrated');
    }

    resetToCleanState(profile = {}) {
      this._invalidateCaches();
      const clean = (window.TrackX.storage && typeof window.TrackX.storage.getCleanUserData === 'function')
        ? window.TrackX.storage.getCleanUserData(profile)
        : getDefaultSeedData();
      this.data = clean;
      this.selectedDate = getTodayKey();
      this.notify('data_reset');
    }

    resetAllData() {
      this._invalidateCaches();
      this.data = getDefaultSeedData();
      this.selectedDate = getTodayKey();
      showToast('Reset to default initial data', 'info', '🔄');
      this.notify('data_reset');
    }
  }

  window.TrackX.state = new StateManager();

})(window);
