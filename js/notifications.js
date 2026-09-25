/**
 * TRACKX - Smart Notification Engine & Top-Right Notifications
 * Dynamic data-driven notifications, bell management, popover dropdown,
 * focus session integration, and LocalStorage persistence.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { state, utils } = window.TrackX;
  const { getTodayKey, addDays, showToast, icons } = utils;

  const NOTIFICATIONS_STORAGE_KEY = 'trackx_notifications_v1';

  // In-memory notification state synchronized with LocalStorage
  let storedState = {
    readIds: [],
    dismissedIds: [],
    timestamps: {},
    custom: []
  };

  let activeNotifications = [];
  let isPanelOpen = false;

  function loadStoredState() {
    if (!state || !state.data) return;
    if (!state.data.notifications) {
      state.data.notifications = {
        readIds: [],
        dismissedIds: [],
        timestamps: {},
        custom: []
      };
    }
    if (!Array.isArray(state.data.notifications.custom)) {
      state.data.notifications.custom = [];
    }

    // Seamless migration from legacy separate key if present
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.readIds)) {
          state.data.notifications.readIds = Array.from(new Set([...state.data.notifications.readIds, ...parsed.readIds]));
        }
        if (parsed && Array.isArray(parsed.dismissedIds)) {
          state.data.notifications.dismissedIds = Array.from(new Set([...state.data.notifications.dismissedIds, ...parsed.dismissedIds]));
        }
        if (parsed && parsed.timestamps) {
          Object.assign(state.data.notifications.timestamps, parsed.timestamps);
        }
        if (parsed && Array.isArray(parsed.custom)) {
          state.data.notifications.custom = Array.from(new Set([...state.data.notifications.custom, ...parsed.custom]));
        }
        localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Could not migrate legacy notifications:', e);
    }

    storedState = state.data.notifications;
  }

  function saveStoredState() {
    if (state && state.data) {
      state.data.notifications = storedState;
      if (window.TrackX.storage && typeof window.TrackX.storage.saveData === 'function') {
        window.TrackX.storage.saveData(state.data);
      }
      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.saveNotifications === 'function') {
        window.TrackX.firestoreSync.saveNotifications(storedState);
      }
    }
  }

  function addCustomNotification(notification) {
    if (!notification || !notification.id) return;
    if (!storedState.custom) storedState.custom = [];
    const idx = storedState.custom.findIndex((n) => n.id === notification.id);
    if (idx < 0) {
      storedState.custom.push(notification);
    } else {
      storedState.custom[idx] = notification;
    }
    if (!storedState.timestamps[notification.id]) {
      storedState.timestamps[notification.id] = notification.timestamp || Date.now();
    }
    saveStoredState();
    refreshNotifications();
  }

  // ==========================================
  // SMART DYNAMIC NOTIFICATION GENERATOR
  // ==========================================

  function generateSmartNotifications() {
    if (!state || !state.data) return [];

    const today = getTodayKey();
    const todayLog = state.getDayLog(today);
    const habits = state.data.habits || [];
    const completedToday = todayLog.completedHabits || [];
    const currentScore = state.calculateDailyScore(today);
    const overallStreak = state.calculateOverallStreak();

    const candidates = [];

    // 0. CUSTOM NOTIFICATIONS (e.g. Welcome to TrackX!)
    const customList = Array.isArray(storedState.custom) ? storedState.custom : [];
    customList.forEach((c) => {
      if (!storedState.dismissedIds.includes(c.id)) {
        candidates.push({
          id: c.id,
          type: c.type || 'welcome',
          priority: c.priority !== undefined ? c.priority : 1,
          title: c.title,
          message: c.message,
          icon: c.icon || '👋',
          accentClass: c.accentClass || 'accent-habit',
          action: c.action || null
        });
      }
    });

    // Check if there is an unread welcome notification
    const hasUnreadWelcome = candidates.some((c) => c.type === 'welcome' && !storedState.readIds.includes(c.id));

    // Check total activity across all records
    let totalAllTimeCompleted = 0;
    let totalAllTimeActivity = 0;
    Object.values(state.data.logs || {}).forEach((log) => {
      if (log.completedHabits) totalAllTimeCompleted += log.completedHabits.length;
      if ((log.waterIntake && log.waterIntake > 0) || (log.sleep && log.sleep.hours > 0) || (log.exercise && log.exercise.minutes > 0) || (log.focusMinutes && log.focusMinutes > 0)) {
        totalAllTimeActivity++;
      }
    });
    const isBrandNewAccount = (totalAllTimeCompleted === 0 && totalAllTimeActivity === 0);

    // If an unread welcome notification is present or this is a brand new account,
    // exclusively display the welcome notification without nagging "falling behind" reminders!
    if (hasUnreadWelcome || (isBrandNewAccount && candidates.length > 0)) {
      const activeCandidates = candidates.filter((item) => !storedState.dismissedIds.includes(item.id));
      const now = Date.now();
      activeCandidates.forEach((item) => {
        if (!storedState.timestamps[item.id]) {
          storedState.timestamps[item.id] = now;
        }
        item.timestamp = storedState.timestamps[item.id];
        item.read = storedState.readIds.includes(item.id);
      });
      activeCandidates.sort((a, b) => (a.priority || 1) - (b.priority || 1));
      return activeCandidates.slice(0, 4);
    }

    // 1. STREAK RISK (Priority 1)
    // Active streak at risk if today score is < 40 and there are unfinished habits
    const uncompletedHabits = habits.filter((h) => !completedToday.includes(h.id));
    if (overallStreak >= 1 && currentScore < 40 && uncompletedHabits.length > 0) {
      candidates.push({
        id: `streak_risk_${today}`,
        type: 'streak_risk',
        priority: 1,
        title: 'Streak at risk',
        message: "Key scheduled habits remain uncompleted for today.",
        icon: icons.flame,
        accentClass: 'accent-warning'
      });
    }

    // 2. HABIT REMINDER (Priority 2)
    // Specific uncompleted habit for today
    if (uncompletedHabits.length > 0) {
      const nextHabit = uncompletedHabits[0];
      candidates.push({
        id: `habit_${nextHabit.id}_${today}`,
        type: 'habit',
        priority: 2,
        title: 'Habit reminder',
        message: `"${nextHabit.name}" is pending execution.`,
        icon: icons.check,
        accentClass: 'accent-habit'
      });
    }

    // 3. FOCUS TIME (Priority 3)
    // When user has a focus habit or hasn't hit 25m focus
    const focusHabit = habits.find((h) => h.category === 'focus');
    const focusMinutes = todayLog.focusMinutes || 0;
    if (focusMinutes < 25) {
      candidates.push({
        id: `focus_session_${today}`,
        type: 'focus',
        priority: 3,
        title: 'Focus session',
        message: focusHabit ? 'Scheduled Deep Work block is ready to begin.' : 'Ready to initiate a timed focus interval.',
        icon: icons.clock,
        accentClass: 'accent-focus',
        action: {
          label: 'Start Focus',
          key: 'start_focus'
        }
      });
    }

    // 3B. SKILL PROGRESS (Priority 3.5)
    // Dynamic feedback when user has made progress in a skill today
    if (completedToday.length > 0) {
      const completedHabitsToday = habits.filter((h) => completedToday.includes(h.id));
      const focusCompleted = completedHabitsToday.find((h) => (h.category || '').toLowerCase() === 'focus');

      if (focusCompleted) {
        let nextFocusMilestone = null;
        if (window.TrackX.achievements && typeof window.TrackX.achievements.evaluateMilestones === 'function') {
          const milestones = window.TrackX.achievements.evaluateMilestones();
          nextFocusMilestone = milestones.find((m) => m.category === 'focus' && !m.isUnlocked);
        }

        candidates.push({
          id: `focus_progress_${today}`,
          type: 'skill_progress',
          priority: 3,
          title: 'Focus milestone',
          message: nextFocusMilestone
            ? `"${focusCompleted.name}" completed. ${nextFocusMilestone.remaining} session${nextFocusMilestone.remaining > 1 ? 's' : ''} until ${nextFocusMilestone.title}.`
            : `"${focusCompleted.name}" completed. Deep focus interval logged.`,
          icon: icons.clock,
          accentClass: 'accent-focus'
        });
      } else {
        const topCompleted = completedHabitsToday[0];
        const catName = topCompleted.category ? (topCompleted.category.charAt(0).toUpperCase() + topCompleted.category.slice(1)) : 'Skill';
        candidates.push({
          id: `skill_progress_${topCompleted.id}_${today}`,
          type: 'skill_progress',
          priority: 3,
          title: `${catName} progress`,
          message: `"${topCompleted.name}" completed (+10 XP). Cadence sustained.`,
          icon: icons.activity,
          accentClass: 'accent-habit'
        });
      }
    }

    // 4. ACHIEVEMENT PROGRESS (Priority 4)
    // Check achievements that are almost unlocked
    if (window.TrackX && window.TrackX.achievements && typeof window.TrackX.achievements.evaluateMilestones === 'function') {
      const evaluated = window.TrackX.achievements.evaluateMilestones();
      const almostList = evaluated.filter((m) => m.cardState === 'almost_unlocked' && !m.isSecret);
      almostList.slice(0, 2).forEach((ach) => {
        candidates.push({
          id: `ach_almost_${ach.id}`,
          type: 'achievement',
          priority: 4,
          title: 'Benchmark near completion',
          message: `${ach.title}: ${ach.statusText}.`,
          icon: icons.trophy,
          accentClass: 'accent-trophy'
        });
      });
    } else {
      const achievements = state.data.achievements || [];
      achievements.forEach((ach) => {
        if (ach.unlockedAt) return;

        if ((ach.id === 'streak_3' || ach.id === 'streak_spark') && overallStreak === 2) {
          candidates.push({
            id: `ach_almost_streak_3`,
            type: 'achievement',
            priority: 4,
            title: 'Benchmark near completion',
            message: 'Complete 1 more day to unlock Spark.',
            icon: icons.trophy,
            accentClass: 'accent-trophy'
          });
        } else if ((ach.id === 'streak_7' || ach.id === 'streak_momentum') && overallStreak >= 5 && overallStreak < 7) {
          const remaining = 7 - overallStreak;
          candidates.push({
            id: `ach_almost_streak_7`,
            type: 'achievement',
            priority: 4,
            title: 'Benchmark near completion',
            message: `Complete ${remaining} more day${remaining > 1 ? 's' : ''} to unlock Momentum.`,
            icon: icons.trophy,
            accentClass: 'accent-trophy'
          });
        }
      });
    }

    // 5. HYDRATION REMINDER (Priority 5)
    const waterGoal = todayLog.waterGoal || state.data.settings.dailyWaterGoal || 2500;
    const waterIntake = todayLog.waterIntake || 0;
    if (waterIntake < waterGoal) {
      const intakeL = (waterIntake / 1000).toFixed(1);
      const goalL = (waterGoal / 1000).toFixed(1);
      candidates.push({
        id: `water_target_${today}`,
        type: 'water',
        priority: 5,
        title: 'Hydration target',
        message: `Currently logged: ${intakeL}L of ${goalL}L target.`,
        icon: icons.droplet,
        accentClass: 'accent-water'
      });
    }

    // 6. SLEEP REMINDER (Priority 5)
    const sleepHours = todayLog.sleep && todayLog.sleep.hours ? todayLog.sleep.hours : 0;
    if (sleepHours === 0) {
      candidates.push({
        id: `sleep_reminder_${today}`,
        type: 'sleep',
        priority: 5,
        title: 'Sleep log pending',
        message: 'Log prior night duration and quality score.',
        icon: icons.moon,
        accentClass: 'accent-sleep'
      });
    }

    // 7. STREAK CELEBRATION (Priority 6)
    if (overallStreak >= 3 && currentScore >= 40) {
      candidates.push({
        id: `streak_alive_${today}`,
        type: 'streak',
        priority: 6,
        title: '🔥 Keep your streak alive',
        message: `You've maintained your streak for ${overallStreak} days.`,
        icon: '🔥',
        accentClass: 'accent-streak'
      });
    }

    // 8. MILESTONE REACHED (Priority 6)
    let totalCompleted = 0;
    Object.values(state.data.logs).forEach((log) => {
      if (log.completedHabits) totalCompleted += log.completedHabits.length;
    });
    if (totalCompleted >= 20) {
      const milestoneTier = Math.floor(totalCompleted / 25) * 25;
      if (milestoneTier >= 25) {
        candidates.push({
          id: `milestone_${milestoneTier}`,
          type: 'milestone',
          priority: 6,
          title: '🚀 Milestone reached',
          message: `You've completed ${totalCompleted} habit check-ins!`,
          icon: '🚀',
          accentClass: 'accent-milestone'
        });
      }
    }

    // 8B. SMART FACTUAL INSIGHT (Priority 5)
    if (window.TrackX.insights && typeof window.TrackX.insights.generateSmartInsights === 'function') {
      const smartInsights = window.TrackX.insights.generateSmartInsights(30);
      if (smartInsights && smartInsights.length > 0) {
        const topInsight = smartInsights[0];
        if (topInsight.id !== 'insight_start') {
          candidates.push({
            id: `insight_${topInsight.id || 'daily'}`,
            type: 'insight',
            priority: 5,
            title: `💡 Smart Insight`,
            message: `${topInsight.headline} ${topInsight.detail}`,
            icon: topInsight.icon || '💡',
            accentClass: 'accent-trophy'
          });
        }
      }
    }

    // Filter out dismissed notifications
    const activeCandidates = candidates.filter((item) => !storedState.dismissedIds.includes(item.id));

    // Sort by priority (1 is highest), then preserve creation timestamp
    const now = Date.now();
    activeCandidates.forEach((item) => {
      if (!storedState.timestamps[item.id]) {
        storedState.timestamps[item.id] = now;
      }
      item.timestamp = storedState.timestamps[item.id];
      item.read = storedState.readIds.includes(item.id);
    });

    activeCandidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.timestamp - a.timestamp;
    });

    // Restrict to max 3-5 notifications
    const capped = activeCandidates.slice(0, 4);

    return capped;
  }

  // ==========================================
  // FORMATTING & TIME HELPERS
  // ==========================================

  function formatRelativeTime(ts) {
    if (!ts) return 'Today';
    const diffMs = Date.now() - ts;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 2) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return 'Today';
  }

  // ==========================================
  // UI RENDERING & INTERACTION
  // ==========================================

  function updateBellBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    const unreadCount = activeNotifications.filter((n) => !n.read).length;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      badge.style.display = 'flex';
      badge.classList.remove('pulse');
      void badge.offsetWidth; // trigger reflow
      badge.classList.add('pulse');
    } else {
      badge.style.display = 'none';
    }
  }

  function renderNotificationPanel() {
    const listContainer = document.getElementById('notificationList');
    const unreadCounter = document.getElementById('notificationUnreadCount');
    if (!listContainer) return;

    const unreadCount = activeNotifications.filter((n) => !n.read).length;
    if (unreadCounter) {
      unreadCounter.textContent = `${unreadCount} new`;
    }

    if (activeNotifications.length === 0) {
      listContainer.innerHTML = `
        <div class="notification-empty-state">
          <div class="notification-empty-icon">✨</div>
          <h4 class="notification-empty-title">All caught up!</h4>
          <p class="notification-empty-desc">You're right on track with all your habits and wellness goals.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = activeNotifications.map((notif) => {
      const isUnread = !notif.read;
      const timeStr = formatRelativeTime(notif.timestamp);

      let iconRender = notif.icon;
      if (!iconRender || !iconRender.includes('<svg')) {
        const fallbackMap = {
          streak_risk: icons.flame,
          habit: icons.check,
          focus: icons.clock,
          skill_progress: icons.activity,
          achievement: icons.trophy,
          water: icons.droplet,
          sleep: icons.moon
        };
        iconRender = fallbackMap[notif.type] || icons.bell;
      }

      return `
        <div class="notification-item ${isUnread ? 'unread' : 'read'}" data-id="${notif.id}">
          <div class="notif-icon-box ${notif.accentClass || ''}">
            <span>${iconRender}</span>
          </div>

          <div class="notif-content">
            <div class="notif-header-line">
              <span class="notif-title">${notif.title}</span>
              <span class="notif-time">${timeStr}</span>
            </div>

            <p class="notif-desc">${notif.message}</p>

            ${notif.action ? `
              <div class="notif-actions">
                <button class="notif-action-btn" data-action="${notif.action.key}" data-id="${notif.id}">
                  ${notif.action.label}
                </button>
              </div>
            ` : ''}
          </div>

          <div class="notif-item-controls">
            ${isUnread ? `<span class="notif-unread-dot" title="Unread"></span>` : ''}
            <button class="notif-dismiss-btn" data-dismiss-id="${notif.id}" title="Dismiss" aria-label="Dismiss notification">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    attachPanelItemEvents(listContainer);
  }

  function attachPanelItemEvents(container) {
    // Clicking notification marks it as read
    container.querySelectorAll('.notification-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        // Skip if clicked on dismiss or action button
        if (e.target.closest('.notif-dismiss-btn') || e.target.closest('.notif-action-btn')) return;
        const id = item.dataset.id;
        markAsRead(id);
      });
    });

    // Dismiss buttons
    container.querySelectorAll('.notif-dismiss-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.dismissId;
        dismissNotification(id);
      });
    });

    // Action buttons (e.g. Start Focus)
    container.querySelectorAll('.notif-action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        markAsRead(id);

        if (action === 'start_focus') {
          handleStartFocus();
        }
      });
    });
  }

  // ==========================================
  // ACTIONS: FOCUS MODE INTEGRATION
  // ==========================================

  function handleStartFocus() {
    closePanel();

    // 1. Switch to today view if not currently there
    if (state.getActiveView() !== 'today') {
      if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
        window.TrackX.app.switchView('today');
      } else {
        state.setActiveView('today');
      }
    }

    // 2. Find and highlight Deep Focus widget, then trigger timer
    setTimeout(() => {
      const focusWidget = document.querySelector('.widget-card .focus') ? document.querySelector('.widget-card .focus').closest('.widget-card') : null;
      if (focusWidget) {
        focusWidget.scrollIntoView({ behavior: 'smooth', block: 'center' });
        focusWidget.classList.add('focus-widget-glow');
        setTimeout(() => focusWidget.classList.remove('focus-widget-glow'), 2500);
      }

      if (window.TrackX.dashboard && typeof window.TrackX.dashboard.startFocusTimer === 'function') {
        window.TrackX.dashboard.startFocusTimer();
      }

      showToast({
        title: '🎯 Focus Mode Active',
        message: '25-minute Deep Work session started. Let\'s get into flow!',
        type: 'success',
        icon: '⏱️'
      });
    }, 120);
  }

  // ==========================================
  // NOTIFICATION STATE MUTATIONS
  // ==========================================

  function markAsRead(id) {
    if (!storedState.readIds.includes(id)) {
      storedState.readIds.push(id);
      saveStoredState();
    }
    const notif = activeNotifications.find((n) => n.id === id);
    if (notif) notif.read = true;

    updateBellBadge();
    renderNotificationPanel();
  }

  function markAllAsRead() {
    activeNotifications.forEach((n) => {
      if (!storedState.readIds.includes(n.id)) {
        storedState.readIds.push(n.id);
      }
      n.read = true;
    });

    saveStoredState();
    updateBellBadge();
    renderNotificationPanel();

    showToast('All notifications marked as read', 'info', '✓');
  }

  function dismissNotification(id) {
    if (!storedState.dismissedIds.includes(id)) {
      storedState.dismissedIds.push(id);
      saveStoredState();
    }

    const itemEl = document.querySelector(`.notification-item[data-id="${id}"]`);
    if (itemEl) {
      itemEl.classList.add('dismissing');
      setTimeout(() => {
        activeNotifications = activeNotifications.filter((n) => n.id !== id);
        updateBellBadge();
        renderNotificationPanel();
      }, 200);
    } else {
      activeNotifications = activeNotifications.filter((n) => n.id !== id);
      updateBellBadge();
      renderNotificationPanel();
    }
  }

  function refreshNotifications() {
    activeNotifications = generateSmartNotifications();
    updateBellBadge();
    if (isPanelOpen) {
      renderNotificationPanel();
    }
  }

  // ==========================================
  // PANEL TOGGLE & EVENT LISTENERS
  // ==========================================

  function togglePanel() {
    if (isPanelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    const panel = document.getElementById('notificationPanel');
    const bellBtn = document.getElementById('notificationBellBtn');
    if (!panel || !bellBtn) return;

    isPanelOpen = true;
    panel.classList.add('active');
    bellBtn.classList.add('active');
    bellBtn.setAttribute('aria-expanded', 'true');

    renderNotificationPanel();
  }

  function closePanel() {
    const panel = document.getElementById('notificationPanel');
    const bellBtn = document.getElementById('notificationBellBtn');
    if (!panel || !bellBtn) return;

    isPanelOpen = false;
    panel.classList.remove('active');
    bellBtn.classList.remove('active');
    bellBtn.setAttribute('aria-expanded', 'false');
  }

  function setupBellAndPanel() {
    const bellBtn = document.getElementById('notificationBellBtn');
    const markAllBtn = document.getElementById('notificationMarkAllBtn');
    const wrapper = document.getElementById('notificationBellWrapper');

    if (bellBtn) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanel();
      });
    }

    if (markAllBtn) {
      markAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        markAllAsRead();
      });
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (isPanelOpen && wrapper && !wrapper.contains(e.target)) {
        closePanel();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isPanelOpen) {
        closePanel();
      }
    });
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================

  let refreshTimer = null;
  function debouncedRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshNotifications();
      refreshTimer = null;
    }, 250);
  }

  let isNotificationsInitialized = false;

  function initNotifications() {
    if (isNotificationsInitialized) return;
    isNotificationsInitialized = true;

    loadStoredState();
    setupBellAndPanel();

    // Initial generation and badge update
    refreshNotifications();

    // Listen to state changes to update notifications dynamically with debouncing
    if (state && typeof state.subscribe === 'function') {
      state.subscribe((event) => {
        if (event && (event.startsWith('cloud_') || event.startsWith('today_'))) return;
        debouncedRefresh();
      });
    }
  }

  window.TrackX.notifications = {
    initNotifications,
    refreshNotifications,
    getNotifications: () => activeNotifications,
    addCustomNotification,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    openPanel,
    closePanel,
    togglePanel
  };

})(window);
