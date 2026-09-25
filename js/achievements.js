/**
 * TRACKX - Professional Achievements & Motivating Milestone System
 * Progressive milestone tiers, real TrackX data calculations, dynamic filtering,
 * visual progression states (locked, in-progress, almost-unlocked, unlocked),
 * lightweight XP & level progression, and elegant unlock celebration modal.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { state, utils } = window.TrackX;
  const { formatDisplayDate, getTodayKey, addDays, triggerConfetti } = utils;

  // ==========================================================================
  // 1. MILESTONE REGISTRY DEFINITION
  // ==========================================================================

  const MILESTONE_DEFINITIONS = [
    // ------------------------------------------------------------------------
    // STREAK SERIES (Tiers 1–6)
    // ------------------------------------------------------------------------
    {
      id: 'streak_spark',
      title: 'Spark',
      desc: 'Maintain a 3-day active habit streak',
      icon: '🔥',
      category: 'streaks',
      tier: 1,
      maxTier: 6,
      series: 'Streak Series',
      xp: 50,
      target: 3,
      unit: 'days'
    },
    {
      id: 'streak_momentum',
      title: 'Momentum',
      desc: 'Maintain a 7-day active habit streak',
      icon: '🔥',
      category: 'streaks',
      tier: 2,
      maxTier: 6,
      series: 'Streak Series',
      xp: 100,
      target: 7,
      unit: 'days'
    },
    {
      id: 'streak_discipline',
      title: 'Discipline',
      desc: 'Maintain a 14-day active habit streak',
      icon: '🔥',
      category: 'streaks',
      tier: 3,
      maxTier: 6,
      series: 'Streak Series',
      xp: 150,
      target: 14,
      unit: 'days'
    },
    {
      id: 'streak_iron_will',
      title: 'Iron Will',
      desc: 'Maintain a 30-day active habit streak',
      icon: '🔥',
      category: 'streaks',
      tier: 4,
      maxTier: 6,
      series: 'Streak Series',
      xp: 250,
      target: 30,
      unit: 'days'
    },
    {
      id: 'streak_unstoppable',
      title: 'Unstoppable',
      desc: 'Maintain a 60-day active habit streak',
      icon: '🔥',
      category: 'streaks',
      tier: 5,
      maxTier: 6,
      series: 'Streak Series',
      xp: 400,
      target: 60,
      unit: 'days'
    },
    {
      id: 'streak_legendary',
      title: 'Legendary',
      desc: 'Reach a legendary 100-day active habit streak',
      icon: '🔥',
      category: 'streaks',
      tier: 6,
      maxTier: 6,
      series: 'Streak Series',
      xp: 750,
      target: 100,
      unit: 'days'
    },

    // ------------------------------------------------------------------------
    // HABIT ACHIEVEMENTS
    // ------------------------------------------------------------------------
    {
      id: 'habit_first',
      title: 'First Step',
      desc: 'Complete your first habit check-in',
      icon: '🌱',
      category: 'habits',
      tier: 1,
      maxTier: 4,
      series: 'Habit Mastery',
      xp: 50,
      target: 1,
      unit: 'check-ins'
    },
    {
      id: 'habit_builder',
      title: 'Habit Builder',
      desc: 'Complete 25 total habit check-ins',
      icon: '🎯',
      category: 'habits',
      tier: 2,
      maxTier: 4,
      series: 'Habit Mastery',
      xp: 100,
      target: 25,
      unit: 'check-ins'
    },
    {
      id: 'habit_consistency',
      title: 'Consistency Machine',
      desc: 'Complete 100 total habit check-ins',
      icon: '⚡',
      category: 'habits',
      tier: 3,
      maxTier: 4,
      series: 'Habit Mastery',
      xp: 250,
      target: 100,
      unit: 'check-ins'
    },
    {
      id: 'habit_master',
      title: 'Habit Master',
      desc: 'Complete 500 total habit check-ins',
      icon: '🏆',
      category: 'habits',
      tier: 4,
      maxTier: 4,
      series: 'Habit Mastery',
      xp: 500,
      target: 500,
      unit: 'check-ins'
    },

    // ------------------------------------------------------------------------
    // FOCUS ACHIEVEMENTS
    // ------------------------------------------------------------------------
    {
      id: 'focus_first',
      title: 'First Focus',
      desc: 'Complete your first deep focus session',
      icon: '🎯',
      category: 'focus',
      tier: 1,
      maxTier: 4,
      series: 'Focus Series',
      xp: 50,
      target: 1,
      unit: 'sessions'
    },
    {
      id: 'focus_deep_work',
      title: 'Deep Work',
      desc: 'Complete 5 deep focus sessions',
      icon: '🧠',
      category: 'focus',
      tier: 2,
      maxTier: 4,
      series: 'Focus Series',
      xp: 100,
      target: 5,
      unit: 'sessions'
    },
    {
      id: 'focus_mode',
      title: 'Focus Mode',
      desc: 'Complete 25 deep focus sessions',
      icon: '⚡',
      category: 'focus',
      tier: 3,
      maxTier: 4,
      series: 'Focus Series',
      xp: 250,
      target: 25,
      unit: 'sessions'
    },
    {
      id: 'focus_flow',
      title: 'Flow State',
      desc: 'Complete 50 deep focus sessions',
      icon: '🧘',
      category: 'focus',
      tier: 4,
      maxTier: 4,
      series: 'Focus Series',
      xp: 500,
      target: 500,
      unit: 'sessions'
    },

    // ------------------------------------------------------------------------
    // WELLNESS ACHIEVEMENTS
    // ------------------------------------------------------------------------
    {
      id: 'wellness_water_3',
      title: 'Hydration Hero',
      desc: 'Reach your water goal for 3 days',
      icon: '💧',
      category: 'wellness',
      tier: 1,
      maxTier: 2,
      series: 'Hydration',
      xp: 75,
      target: 3,
      unit: 'days'
    },
    {
      id: 'wellness_water_14',
      title: 'Hydration Master',
      desc: 'Reach your water goal for 14 days',
      icon: '💧',
      category: 'wellness',
      tier: 2,
      maxTier: 2,
      series: 'Hydration',
      xp: 200,
      target: 14,
      unit: 'days'
    },
    {
      id: 'wellness_sleep_7',
      title: 'Sleep Guardian',
      desc: 'Log restful sleep (7+ hrs) for 7 days',
      icon: '🌙',
      category: 'wellness',
      tier: 1,
      maxTier: 1,
      xp: 100,
      target: 7,
      unit: 'days'
    },
    {
      id: 'wellness_active_7',
      title: 'Active Week',
      desc: 'Complete exercise sessions for 7 days',
      icon: '🏃',
      category: 'wellness',
      tier: 1,
      maxTier: 1,
      xp: 100,
      target: 7,
      unit: 'days'
    },
    {
      id: 'wellness_calm_7',
      title: 'Calm Mind',
      desc: 'Complete meditation or mindfulness for 7 days',
      icon: '🧘',
      category: 'wellness',
      tier: 1,
      maxTier: 1,
      xp: 100,
      target: 7,
      unit: 'days'
    },

    // ------------------------------------------------------------------------
    // CONSISTENCY ACHIEVEMENTS
    // ------------------------------------------------------------------------
    {
      id: 'consistency_perfect_week',
      title: 'Perfect Week',
      desc: 'Complete all scheduled habits for 7 days',
      icon: '📅',
      category: 'consistency',
      tier: 1,
      maxTier: 2,
      series: 'Flawless Execution',
      xp: 150,
      target: 7,
      unit: 'days'
    },
    {
      id: 'consistency_no_zero',
      title: 'No Zero Days',
      desc: 'Complete at least one habit for 14 consecutive days',
      icon: '🔥',
      category: 'consistency',
      tier: 1,
      maxTier: 1,
      xp: 150,
      target: 14,
      unit: 'days'
    },
    {
      id: 'consistency_perfect_month',
      title: 'Perfect Month',
      desc: 'Maintain 90%+ habit completion across 20+ days',
      icon: '💎',
      category: 'consistency',
      tier: 2,
      maxTier: 2,
      series: 'Flawless Execution',
      xp: 300,
      target: 20,
      unit: 'days'
    },
    {
      id: 'consistency_momentum',
      title: 'Weekly Momentum',
      desc: 'Improve weekly habit completion for 3 consecutive weeks',
      icon: '🚀',
      category: 'consistency',
      tier: 1,
      maxTier: 1,
      xp: 250,
      target: 3,
      unit: 'weeks'
    },

    // ------------------------------------------------------------------------
    // SECRET MILESTONES (Hidden until unlocked)
    // ------------------------------------------------------------------------
    {
      id: 'secret_recharged',
      title: 'Recharged Pioneer',
      desc: 'Log 8+ hours restful sleep after a deep focus session',
      icon: '🌟',
      category: 'milestones',
      isSecret: true,
      xp: 150,
      target: 1,
      unit: 'times'
    },
    {
      id: 'secret_centurion',
      title: 'Flawless Century',
      desc: 'Achieve 100% daily score across 5 different days',
      icon: '⚡',
      category: 'milestones',
      isSecret: true,
      xp: 250,
      target: 5,
      unit: 'days'
    }
  ];

  // Backward compatibility alias map for previously seeded achievements
  const LEGACY_ID_MAP = {
    first_habit: 'habit_first',
    streak_3: 'streak_spark',
    streak_7: 'streak_momentum',
    hydration_hero: 'wellness_water_3',
    deep_work: 'focus_deep_work',
    perfect_day: 'secret_centurion',
    zen_master: 'wellness_calm_7',
    sleep_well: 'secret_recharged'
  };

  // ==========================================================================
  // 2. XP & LEVEL SYSTEM DEFINITION
  // ==========================================================================

  const LEVELS = [
    { level: 1, title: 'Starter', minXP: 0, maxXP: 200, icon: '🌱' },
    { level: 2, title: 'Builder', minXP: 200, maxXP: 500, icon: '🎯' },
    { level: 3, title: 'Consistent', minXP: 500, maxXP: 1000, icon: '⚡' },
    { level: 4, title: 'Focused', minXP: 1000, maxXP: 1800, icon: '🧠' },
    { level: 5, title: 'Disciplined', minXP: 1800, maxXP: 3000, icon: '🛡️' },
    { level: 6, title: 'Momentum', minXP: 3000, maxXP: 5000, icon: '🚀' },
    { level: 7, title: 'Mastery', minXP: 5000, maxXP: 99999, icon: '👑' }
  ];

  let selectedCategoryFilter = 'all';

  // ==========================================================================
  // 3. INITIALIZATION & SUBSCRIPTIONS
  // ==========================================================================

  let isAchievementsInitialized = false;

  function initAchievements() {
    if (isAchievementsInitialized) return;
    isAchievementsInitialized = true;

    synchronizeStateRegistry();

    state.subscribe((event) => {
      if (state.getActiveView() === 'achievements') {
        renderAchievements();
      }
    });

    setupUnlockModalEvents();
  }

  /**
   * Synchronizes state.data.achievements with MILESTONE_DEFINITIONS,
   * preserving any unlocked dates and migrating legacy IDs seamlessly.
   */
  function synchronizeStateRegistry() {
    if (!state.data.achievements) {
      state.data.achievements = [];
    }

    const legacyMap = {};
    state.data.achievements.forEach((a) => {
      if (a.unlockedAt) {
        legacyMap[a.id] = a.unlockedAt;
      }
    });

    const updated = MILESTONE_DEFINITIONS.map((def) => {
      let unlockedAt = null;
      if (legacyMap[def.id]) {
        unlockedAt = legacyMap[def.id];
      } else {
        Object.entries(LEGACY_ID_MAP).forEach(([oldId, newId]) => {
          if (newId === def.id && legacyMap[oldId]) {
            unlockedAt = legacyMap[oldId];
          }
        });
      }

      return {
        ...def,
        unlockedAt
      };
    });

    state.data.achievements = updated;
  }

  // ==========================================================================
  // 4. REAL DATA PROGRESS EVALUATOR
  // ==========================================================================

  function evaluateMilestones() {
    synchronizeStateRegistry();

    const logs = state.data.logs || {};
    const habits = state.data.habits || [];
    const totalHabitsCount = habits.length;

    // Metrics calculation
    const streak = state.calculateOverallStreak();
    const bestStreak = state.calculateBestStreak();
    const maxStreakRecord = Math.max(streak, bestStreak);

    // 1. Habit counts
    let totalCompletedHabits = 0;
    let perfectHabitDays = 0;
    let perfectScoreDays = 0;
    let daysWithAtLeastOneHabit = 0;

    // 2. Focus counts
    let totalFocusSessions = 0;

    // 3. Wellness counts
    let waterGoalDays = 0;
    let sleepGoalDays = 0;
    let exerciseGoalDays = 0;
    let mindfulnessDays = 0;
    let secretRechargedMet = false;

    // Track date order for consecutive checks
    const sortedDates = Object.keys(logs).sort();

    sortedDates.forEach((d) => {
      const log = logs[d];
      const completed = log.completedHabits || [];
      totalCompletedHabits += completed.length;

      if (completed.length > 0) daysWithAtLeastOneHabit++;

      if (totalHabitsCount > 0 && completed.length >= totalHabitsCount) {
        perfectHabitDays++;
      }

      const score = state.calculateDailyScore(d);
      if (score >= 90) perfectScoreDays++;

      // Focus sessions (count each >= 20m or distinct session)
      if (log.focusMinutes && log.focusMinutes >= 20) {
        const sessionsInDay = Math.max(1, Math.floor(log.focusMinutes / 25));
        totalFocusSessions += sessionsInDay;
      }

      // Wellness
      if (log.waterIntake && log.waterIntake >= (log.waterGoal || 2500)) {
        waterGoalDays++;
      }

      if (log.sleep && log.sleep.hours >= 7) {
        sleepGoalDays++;
      }

      if (log.exercise && log.exercise.minutes >= 20) {
        exerciseGoalDays++;
      }

      // Mindfulness
      const hasMindHabit = habits.some((h) => (h.category === 'mind') && completed.includes(h.id));
      if (hasMindHabit || (log.mood && log.mood.rating >= 4)) {
        mindfulnessDays++;
      }

      // Secret achievement: Recharged after deep focus
      if (log.focusMinutes >= 45 && log.sleep && log.sleep.hours >= 8) {
        secretRechargedMet = true;
      }
    });

    // Consecutive habit days for "no zero days"
    let maxConsecutiveHabitDays = 0;
    let currentConsecutive = 0;
    let prevDate = null;
    sortedDates.forEach((d) => {
      const log = logs[d];
      if (log.completedHabits && log.completedHabits.length > 0) {
        if (!prevDate || addDays(prevDate, 1) === d) {
          currentConsecutive++;
        } else {
          currentConsecutive = 1;
        }
        maxConsecutiveHabitDays = Math.max(maxConsecutiveHabitDays, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
      prevDate = d;
    });

    // Weekly momentum (3 weeks comparison or active weeks)
    const momentumWeeks = sortedDates.length >= 21 ? 3 : Math.min(3, Math.floor(sortedDates.length / 7));

    return state.data.achievements.map((ach) => {
      let current = 0;
      const target = ach.target;

      switch (ach.id) {
        // Streaks
        case 'streak_spark':
        case 'streak_momentum':
        case 'streak_discipline':
        case 'streak_iron_will':
        case 'streak_unstoppable':
        case 'streak_legendary':
          current = maxStreakRecord;
          break;

        // Habits
        case 'habit_first':
        case 'habit_builder':
        case 'habit_consistency':
        case 'habit_master':
          current = totalCompletedHabits;
          break;

        // Focus
        case 'focus_first':
        case 'focus_deep_work':
        case 'focus_mode':
        case 'focus_flow':
          current = totalFocusSessions;
          break;

        // Wellness
        case 'wellness_water_3':
        case 'wellness_water_14':
          current = waterGoalDays;
          break;
        case 'wellness_sleep_7':
          current = sleepGoalDays;
          break;
        case 'wellness_active_7':
          current = exerciseGoalDays;
          break;
        case 'wellness_calm_7':
          current = mindfulnessDays;
          break;

        // Consistency
        case 'consistency_perfect_week':
          current = perfectHabitDays;
          break;
        case 'consistency_no_zero':
          current = maxConsecutiveHabitDays;
          break;
        case 'consistency_perfect_month':
          current = perfectScoreDays;
          break;
        case 'consistency_momentum':
          current = momentumWeeks;
          break;

        // Secret
        case 'secret_recharged':
          current = secretRechargedMet ? 1 : 0;
          break;
        case 'secret_centurion':
          current = perfectScoreDays;
          break;

        default:
          current = 0;
      }

      const isUnlocked = Boolean(ach.unlockedAt) || current >= target;
      const effectiveCurrent = Math.min(target, current);
      const progressPct = target > 0 ? Math.min(100, Math.round((effectiveCurrent / target) * 100)) : 0;
      const remaining = Math.max(0, target - current);

      // Progressive status classification
      let cardState = 'locked';
      let statusText = '';

      if (isUnlocked) {
        cardState = 'unlocked';
        statusText = ach.unlockedAt ? `Unlocked ${formatDisplayDate(ach.unlockedAt)}` : 'Unlocked today';
      } else if (progressPct >= 70 || remaining <= 2) {
        cardState = 'almost_unlocked';
        if (remaining === 1) {
          statusText = ach.unit === 'days' ? '1 more day' : '1 more to go';
        } else if (remaining === 2) {
          statusText = `2 ${ach.unit} to go`;
        } else {
          statusText = 'Milestone within reach';
        }
      } else if (current > 0) {
        cardState = 'in_progress';
        statusText = `${remaining} ${ach.unit} remaining`;
      } else {
        cardState = 'locked';
        statusText = `${remaining} ${ach.unit} remaining`;
      }

      return {
        ...ach,
        current: effectiveCurrent,
        target,
        remaining,
        progressPct,
        cardState,
        statusText,
        isUnlocked
      };
    });
  }

  // ==========================================================================
  // 5. XP & PLAYER LEVEL CALCULATOR
  // ==========================================================================

  function calculatePlayerXP() {
    const logs = state.data.logs || {};
    let totalCompleted = 0;
    let perfectDayBonuses = 0;

    const habitsCount = (state.data.habits || []).length;
    Object.values(logs).forEach((log) => {
      const c = log.completedHabits || [];
      totalCompleted += c.length;
      if (habitsCount > 0 && c.length >= habitsCount) {
        perfectDayBonuses++;
      }
    });

    const habitXP = totalCompleted * 10;
    const dailyBonusXP = perfectDayBonuses * 25;

    const evaluated = evaluateMilestones();
    const achievementXP = evaluated
      .filter((a) => a.isUnlocked)
      .reduce((sum, a) => sum + (a.xp || 0), 0);

    const totalXP = habitXP + dailyBonusXP + achievementXP;

    let currentLevel = LEVELS[0];
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (totalXP >= LEVELS[i].minXP) {
        currentLevel = LEVELS[i];
        break;
      }
    }

    const nextLevel = LEVELS.find((l) => l.level === currentLevel.level + 1) || currentLevel;
    const levelRange = nextLevel.minXP - currentLevel.minXP;
    const currentLevelProgressXP = totalXP - currentLevel.minXP;
    const levelPct = levelRange > 0 ? Math.min(100, Math.round((currentLevelProgressXP / levelRange) * 100)) : 100;

    return {
      totalXP,
      habitXP,
      achievementXP,
      currentLevel,
      nextLevel,
      currentLevelProgressXP,
      levelRange,
      levelPct
    };
  }

  // ==========================================================================
  // 6. CHECK & TRIGGER UNLOCKS
  // ==========================================================================

  function checkAndUnlockAll() {
    const today = getTodayKey();
    const evaluated = evaluateMilestones();
    const newlyUnlocked = [];

    evaluated.forEach((item) => {
      if (item.current >= item.target && !item.unlockedAt) {
        const record = state.data.achievements.find((a) => a.id === item.id);
        if (record) {
          record.unlockedAt = today;
          newlyUnlocked.push(item);
        }
      }
    });

    if (newlyUnlocked.length > 0) {
      const topMilestone = newlyUnlocked[0];
      showUnlockModal(topMilestone);

      utils.showNotificationToast({
        title: '🏆 Achievement Unlocked!',
        message: `${topMilestone.title} — ${topMilestone.desc}`,
        type: 'success',
        icon: topMilestone.icon || '🏆'
      });

      triggerConfetti();
    }

    return newlyUnlocked;
  }

  // ==========================================================================
  // 7. MAIN VIEW RENDERER
  // ==========================================================================

  function renderAchievements() {
    const container = document.getElementById('viewAchievements');
    if (!container) return;

    const milestones = evaluateMilestones();
    const xpInfo = calculatePlayerXP();

    const totalCount = milestones.length;
    const unlockedCount = milestones.filter((m) => m.isUnlocked).length;
    const overallProgressPct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    let displayedMilestones = milestones;
    if (selectedCategoryFilter !== 'all') {
      displayedMilestones = milestones.filter((m) => m.category === selectedCategoryFilter);
    }

    const categories = [
      { key: 'all', label: 'All', count: totalCount },
      { key: 'streaks', label: 'Streaks', count: milestones.filter((m) => m.category === 'streaks').length },
      { key: 'habits', label: 'Habits', count: milestones.filter((m) => m.category === 'habits').length },
      { key: 'focus', label: 'Focus', count: milestones.filter((m) => m.category === 'focus').length },
      { key: 'wellness', label: 'Wellness', count: milestones.filter((m) => m.category === 'wellness').length },
      { key: 'consistency', label: 'Consistency', count: milestones.filter((m) => m.category === 'consistency').length },
      { key: 'milestones', label: 'Milestones', count: milestones.filter((m) => m.category === 'milestones').length }
    ];

    container.innerHTML = `
      <!-- 1. Achievement Page Header -->
      <div class="milestones-page-header">
        <div class="milestones-header-left">
          <h1 class="milestones-header-title">Milestones</h1>
          <p class="milestones-header-sub">Continuous execution benchmarks and performance tiers</p>
        </div>

        <div class="milestones-header-right">
          <!-- Level & XP Compact Pill -->
          <div class="milestone-level-box" title="${xpInfo.totalXP} Total XP Earned">
            <div class="level-badge-compact">
              <span class="level-icon">${xpInfo.currentLevel.icon}</span>
              <div class="level-text-wrap">
                <span class="level-title">Level ${xpInfo.currentLevel.level} — ${xpInfo.currentLevel.title}</span>
                <span class="level-xp-sub" style="font-variant-numeric: tabular-nums;">${xpInfo.totalXP} XP</span>
              </div>
            </div>
            <div class="level-progress-bar-wrap">
              <div class="level-progress-bar-fill" style="width: ${xpInfo.levelPct}%;"></div>
            </div>
          </div>

          <!-- Overall Unlocked Count & Progress Bar -->
          <div class="milestones-overall-box">
            <div class="milestones-stats-row">
              <span class="milestones-unlocked-pill" style="font-variant-numeric: tabular-nums;">${unlockedCount} / ${totalCount} unlocked</span>
              <span class="milestones-pct-pill" style="font-variant-numeric: tabular-nums;">${overallProgressPct}%</span>
            </div>
            <div class="milestones-overall-bar-wrap">
              <div class="milestones-overall-bar-fill" style="width: ${overallProgressPct}%;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Dynamic Category Filters -->
      <div class="milestones-filter-bar" role="tablist" aria-label="Achievement Categories">
        ${categories.map((cat) => `
          <button class="milestones-filter-btn ${selectedCategoryFilter === cat.key ? 'active' : ''}" 
                  data-category="${cat.key}" 
                  role="tab" 
                  aria-selected="${selectedCategoryFilter === cat.key}">
            <span>${cat.label}</span>
            <span class="filter-count-badge" style="font-variant-numeric: tabular-nums;">${cat.count}</span>
          </button>
        `).join('')}
      </div>

      <!-- 3. Progressive Achievement Cards Grid -->
      <div class="milestones-grid">
        ${displayedMilestones.map((m) => renderMilestoneCard(m)).join('')}
      </div>
    `;

    attachFilterEvents(container);
  }

  function renderMilestoneCard(m) {
    const isSecretLocked = m.isSecret && !m.isUnlocked;

    const displayIcon = isSecretLocked ? '•' : m.icon;
    const displayTitle = isSecretLocked ? '???' : m.title;
    const displayDesc = isSecretLocked ? 'Sustain consistency to discover this benchmark.' : m.desc;

    return `
      <div class="milestone-card ${m.cardState} cat-${m.category} ${m.isSecret ? 'is-secret' : ''}" 
           data-id="${m.id}" 
           tabindex="0" 
           role="article" 
           aria-label="${displayTitle} - ${m.statusText}">
        
        <!-- Top Row: Icon Badge, Tier Badge & Reward Tag -->
        <div class="milestone-card-top">
          <div class="milestone-icon-badge ${m.cardState}">
            ${displayIcon}
            ${m.cardState === 'locked' && !isSecretLocked ? `<span class="locked-icon-overlay"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>` : ''}
            ${m.cardState === 'almost_unlocked' ? `<span class="almost-pulse-dot"></span>` : ''}
          </div>

          <div class="milestone-badges-right">
            ${m.tier && m.maxTier ? `
              <span class="milestone-tier-pill">Tier ${m.tier}/${m.maxTier}</span>
            ` : ''}
            <span class="milestone-reward-pill">+${m.xp} XP</span>
          </div>
        </div>

        <!-- Content: Title, Description & Secret Indicator -->
        <div class="milestone-content">
          ${m.isSecret && m.isUnlocked ? `
            <span class="secret-discovered-tag">Hidden milestone discovered</span>
          ` : ''}
          <h3 class="milestone-name">${displayTitle}</h3>
          <p class="milestone-desc">${displayDesc}</p>
        </div>

        <!-- Bottom: Progress Bar, Fraction & Status -->
        <div class="milestone-bottom">
          ${!isSecretLocked ? `
            <div class="milestone-progress-meta">
              <span class="milestone-fraction" style="font-variant-numeric: tabular-nums;">${m.current} / ${m.target}</span>
              <span class="milestone-status-label ${m.cardState}">${m.statusText}</span>
            </div>

            <div class="milestone-progress-track">
              <div class="milestone-progress-fill ${m.cardState}" style="width: ${m.progressPct}%;"></div>
            </div>
          ` : `
            <div class="milestone-progress-meta">
              <span class="milestone-status-label locked">Secret Milestone</span>
            </div>
            <div class="milestone-progress-track">
              <div class="milestone-progress-fill locked" style="width: 0%;"></div>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 8. EVENT ATTACHMENTS
  // ==========================================================================

  function attachFilterEvents(container) {
    container.querySelectorAll('.milestones-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        if (cat && cat !== selectedCategoryFilter) {
          selectedCategoryFilter = cat;
          renderAchievements();
        }
      });
    });
  }

  // ==========================================================================
  // 9. ACHIEVEMENT UNLOCK CELEBRATION MODAL
  // ==========================================================================

  function showUnlockModal(milestone) {
    const modal = document.getElementById('achievementUnlockModal');
    if (!modal) return;

    const badge = document.getElementById('unlockModalBadge');
    const title = document.getElementById('unlockModalTitle');
    const desc = document.getElementById('unlockModalDesc');
    const reward = document.getElementById('unlockModalReward');
    const levelWrap = document.getElementById('unlockModalLevelWrap');

    const xpInfo = calculatePlayerXP();

    if (badge) badge.textContent = milestone.icon || '🏆';
    if (title) title.textContent = milestone.title;
    if (desc) desc.textContent = milestone.desc;
    if (reward) reward.innerHTML = `<span>+${milestone.xp || 100} XP</span>`;

    if (levelWrap) {
      levelWrap.innerHTML = `
        <div class="unlock-level-info">
          <span class="unlock-level-name">${xpInfo.currentLevel.icon} Level ${xpInfo.currentLevel.level} — ${xpInfo.currentLevel.title}</span>
          <span class="unlock-level-xp">${xpInfo.totalXP} Total XP</span>
        </div>
        <div class="unlock-level-bar">
          <div class="unlock-level-fill" style="width: ${xpInfo.levelPct}%;"></div>
        </div>
      `;
    }

    modal.classList.add('active');
    if (window.TrackX.sounds) {
      window.TrackX.sounds.playSuccess();
    }
  }

  function setupUnlockModalEvents() {
    const modal = document.getElementById('achievementUnlockModal');
    const continueBtn = document.getElementById('unlockModalContinueBtn');
    if (!modal) return;

    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
  }

  // ==========================================================================
  // 10. EXPORTS
  // ==========================================================================

  window.TrackX.achievements = {
    initAchievements,
    renderAchievements,
    evaluateMilestones,
    calculatePlayerXP,
    checkAndUnlockAll,
    showUnlockModal
  };

})(window);

