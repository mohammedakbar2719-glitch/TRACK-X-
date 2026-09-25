/**
 * TRACKX - Main Application Orchestrator
 * View routing, date navigator, theme switcher, modal management, and settings handlers
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { state, utils, storage, dashboard, habits, progress, calendar, achievements, notifications } = window.TrackX;
  const { icons, formatDisplayDate, addDays, isToday, getTodayKey, showToast, sounds } = utils;
  const { exportDataAsJSON, importDataFromJSON } = storage;
  const { initDashboard, renderDashboard } = dashboard;
  const { initHabits, renderHabits } = habits;
  const { initProgress, renderProgress } = progress;
  const { initCalendar, renderCalendar } = calendar;
  const { initAchievements, renderAchievements } = achievements;
  const { initNotifications } = notifications || {};

  let isAppInitialized = false;

  function initApp() {
    if (isAppInitialized) return;
    isAppInitialized = true;

    // Apply saved theme
    const currentTheme = (state.data && state.data.settings && state.data.settings.theme) || 'light';
    applyTheme(currentTheme);

    // Initialize sound settings
    if (sounds) {
      sounds.enabled = (state.data && state.data.settings && state.data.settings.sounds !== false);
    }

    // Initialize all view modules
    if (typeof initDashboard === 'function') initDashboard();
    if (typeof initHabits === 'function') initHabits();
    if (typeof initProgress === 'function') initProgress();
    if (typeof initCalendar === 'function') initCalendar();
    if (typeof initAchievements === 'function') initAchievements();
    if (typeof initNotifications === 'function') initNotifications();
    if (window.TrackX.showcase && typeof window.TrackX.showcase.initShowcase === 'function') {
      window.TrackX.showcase.initShowcase();
    }

    // Initialize Firebase & Authentication Services
    if (window.TrackX.firebase && typeof window.TrackX.firebase.initFirebase === 'function') {
      window.TrackX.firebase.initFirebase();
    }
    if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.init === 'function') {
      window.TrackX.firestoreSync.init();
    }
    if (window.TrackX.landing && typeof window.TrackX.landing.initLanding === 'function') {
      window.TrackX.landing.initLanding();
    }
    if (window.TrackX.auth && typeof window.TrackX.auth.initAuth === 'function') {
      window.TrackX.auth.initAuth();
    }

    // Setup Global Navigators and Controls
    setupNavigation();
    setupDateNavigator();
    setupThemeToggle();
    setupNewHabitModal();
    setupSettingsHandlers();
    setupKeyboardShortcuts();

    // Listen for state changes to sync top bar and active views
    state.subscribe((event) => {
      syncTopBarDate();
      syncSidebarProfile();
    });

    // Check initial hash route
    const initialHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    const isLanding = !initialHash || ['home', 'landing', 'features', 'how-it-works', 'why-trackx', 'preview', 'about', 'feedback', 'faq'].includes(initialHash);

    if (['login', 'signup', 'forgot-password', 'reset-password'].includes(initialHash)) {
      if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
        window.TrackX.landing.hideLandingPage();
      }
      if (window.TrackX.auth && typeof window.TrackX.auth.showAuthScreen === 'function') {
        window.TrackX.auth.showAuthScreen();
        window.TrackX.auth.switchAuthView(initialHash);
      }
    } else if (isLanding) {
      // By default show public landing page for visitors
      // Firebase auth state listener in auth.js will automatically redirect to #today if already authenticated
      if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
        window.TrackX.landing.showLandingPage();
      }
    } else {
      // Direct deep link to protected dashboard route
      if (window.TrackX.auth && window.TrackX.auth.getAuthState && window.TrackX.auth.getAuthState() === 'authenticated') {
        const targetView = (['habits', 'progress', 'calendar', 'achievements', 'settings', 'focus', 'wellness', 'showcase'].includes(initialHash))
          ? initialHash
          : (state.getActiveView() || 'today');
        switchView(targetView);
      }
    }

    syncTopBarDate();
    syncSidebarProfile();
  }

  // ==========================================
  // VIEW ROUTING
  // ==========================================

  function switchView(viewName) {
    if (['home', 'landing'].includes(viewName)) {
      if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
        window.TrackX.landing.showLandingPage();
      }
      return;
    }

    // If auth modal route requested
    if (['login', 'signup', 'forgot-password', 'reset-password'].includes(viewName)) {
      if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
        window.TrackX.landing.hideLandingPage();
      }
      if (window.TrackX.auth) {
        if (typeof window.TrackX.auth.showAuthScreen === 'function') {
          window.TrackX.auth.showAuthScreen();
        }
        if (typeof window.TrackX.auth.switchAuthView === 'function') {
          window.TrackX.auth.switchAuthView(viewName);
        }
      }
      return;
    }

    // Hide landing page when rendering dashboard views
    if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
      window.TrackX.landing.hideLandingPage();
    }

    // Ensure main app container is visible when viewing app
    if (window.TrackX.auth && typeof window.TrackX.auth.hideAuthScreen === 'function') {
      window.TrackX.auth.hideAuthScreen();
    }

    state.setActiveView(viewName);

    // Update Desktop Sidebar active states
    document.querySelectorAll('.app-sidebar .nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update Mobile Bottom Nav active states
    document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Toggle View Panels
    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.remove('active');
    });

    const targetPanel = document.getElementById(`view${capitalize(viewName)}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // Trigger view-specific render
    if (viewName === 'today') renderDashboard();
    else if (viewName === 'habits') renderHabits();
    else if (viewName === 'progress') renderProgress();
    else if (viewName === 'calendar') renderCalendar();
    else if (viewName === 'achievements') renderAchievements();
    else if (viewName === 'settings') renderSettings();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupNavigation() {
    document.querySelectorAll('.app-sidebar .nav-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        if (view) switchView(view);
      });
    });

    document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        if (view) switchView(view);
      });
    });

    const userCard = document.getElementById('sidebarUserCard');
    if (userCard) {
      userCard.addEventListener('click', () => switchView('settings'));
    }

    const topProfileBtn = document.getElementById('topProfileBtn');
    if (topProfileBtn) {
      topProfileBtn.addEventListener('click', () => switchView('settings'));
    }
  }

  // ==========================================
  // DATE NAVIGATOR IN TOP APP BAR
  // ==========================================

  function setupDateNavigator() {
    const prevBtn = document.getElementById('datePrevBtn');
    const nextBtn = document.getElementById('dateNextBtn');
    const centerBtn = document.getElementById('dateCenterLabel');
    const todayBtn = document.getElementById('dateTodayShortcut');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const current = state.getSelectedDate();
        state.setSelectedDate(addDays(current, -1));
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const current = state.getSelectedDate();
        state.setSelectedDate(addDays(current, 1));
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.setSelectedDate(getTodayKey());
      });
    }

    if (centerBtn) {
      centerBtn.addEventListener('click', () => {
        switchView('calendar');
      });
    }
  }

  function syncTopBarDate() {
    const selectedDate = state.getSelectedDate();
    const label = document.getElementById('dateText');
    const todayShortcut = document.getElementById('dateTodayShortcut');

    if (label) {
      label.textContent = formatDisplayDate(selectedDate);
    }

    if (todayShortcut) {
      todayShortcut.style.display = isToday(selectedDate) ? 'none' : 'inline-block';
    }
  }

  function renderAvatarElement(el, avatarValue, fallbackName) {
    if (!el) return;
    const val = (avatarValue || '').trim();
    const initials = (fallbackName || 'User').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'TX';
    if (!val || val === '✨') {
      el.innerHTML = `<span class="user-initials">${initials}</span>`;
      return;
    }
    // If avatar is an image URL (Google photo, data URI, etc.)
    if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image')) {
      el.innerHTML = `<img src="${val}" alt="${fallbackName || 'User'}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'user-initials\\'>${initials}</span>';">`;
    } else {
      el.textContent = val;
    }
  }

  function syncSidebarProfile() {
    const nameEl = document.getElementById('sidebarUserName');
    const emailEl = document.getElementById('sidebarUserEmail');
    const streakEl = document.getElementById('sidebarUserStreak');
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const topAvatarEl = document.getElementById('topProfileAvatar');

    const user = (state.data && state.data.user) || {};
    const userName = user.name || 'User';
    const userEmail = user.email || '';
    const userAvatar = user.avatar || '✨';

    if (nameEl) nameEl.textContent = userName;
    if (emailEl) {
      emailEl.textContent = userEmail;
      emailEl.style.display = userEmail ? 'block' : 'none';
    }
    if (avatarEl) renderAvatarElement(avatarEl, userAvatar, userName);
    if (topAvatarEl) renderAvatarElement(topAvatarEl, userAvatar, userName);
    if (streakEl) {
      const streak = state.calculateOverallStreak();
      streakEl.innerHTML = `${icons.flame} <span>${streak}d streak</span>`;
    }
  }

  // ==========================================
  // THEME SWITCHER (Light / Dark)
  // ==========================================

  function applyTheme(theme) {
    const isGrey = (theme === 'dark' || theme === 'grey');
    const normalized = isGrey ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalized);
    try {
      localStorage.setItem('trackx_theme', normalized);
    } catch (e) {}

    // Sidebar theme toggle button
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.innerHTML = isGrey ? icons.sun : icons.moon;
      toggleBtn.title = isGrey ? 'Switch to White Mode' : 'Switch to Grey Mode';
    }

    // Top header theme toggle button
    const topToggleBtn = document.getElementById('topThemeToggleBtn');
    if (topToggleBtn) {
      topToggleBtn.innerHTML = isGrey ? icons.sun : icons.moon;
      topToggleBtn.title = isGrey ? 'Switch to White Mode' : 'Switch to Grey Mode';
    }

    // Settings page theme button
    const settingsThemeBtn = document.getElementById('settingsThemeBtn');
    if (settingsThemeBtn) {
      settingsThemeBtn.innerHTML = isGrey ? '☀️ Switch to White Mode' : '🌙 Switch to Grey Mode';
    }
  }

  function setupThemeToggle() {
    const toggleThemeAction = () => {
      const current = (state.data && state.data.settings && state.data.settings.theme) || 'light';
      const isGrey = (current === 'dark' || current === 'grey');
      const next = isGrey ? 'light' : 'dark';
      state.updateSettings({ theme: next });
      applyTheme(next);
      if (sounds && typeof sounds.playPop === 'function') {
        sounds.playPop();
      }
    };

    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleThemeAction);
    }

    const topToggleBtn = document.getElementById('topThemeToggleBtn');
    if (topToggleBtn) {
      topToggleBtn.addEventListener('click', toggleThemeAction);
    }
  }

  // ==========================================
  // NEW HABIT MODAL
  // ==========================================

  function setupNewHabitModal() {
    const modal = document.getElementById('newHabitModal');
    const closeBtn = document.getElementById('closeNewHabitModalBtn');
    const cancelBtn = document.getElementById('cancelNewHabitBtn');
    const form = document.getElementById('newHabitForm');
    const iconOptions = document.querySelectorAll('.icon-picker-item');

    let selectedIcon = '✨';

    iconOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        iconOptions.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedIcon = opt.textContent.trim();
      });
    });

    const closeModal = () => {
      if (modal) modal.classList.remove('active');
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('habitNameInput');
        const catInput = document.getElementById('habitCategoryInput');
        const freqInput = document.getElementById('habitFrequencyInput');

        if (!nameInput || !nameInput.value.trim()) {
          alert('Please enter a habit name.');
          return;
        }

        state.addHabit({
          name: nameInput.value.trim(),
          category: catInput ? catInput.value : 'mind',
          icon: selectedIcon,
          frequency: freqInput ? freqInput.value : 'daily'
        });

        nameInput.value = '';
        closeModal();
      });
    }
  }

  // ==========================================
  // SETTINGS VIEW
  // ==========================================

  function renderSettings() {
    const container = document.getElementById('viewSettings');
    if (!container) return;

    const s = state.data.settings;
    const u = state.data.user;

    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Settings & Preferences</h1>
          <p class="section-meta">Customize your tracking goals, profile, and app experience</p>
        </div>
      </div>

      <div class="settings-container">
        <!-- Profile Settings -->
        <div class="settings-card">
          <h3 class="section-title" style="font-size: 16px;">Personal Profile</h3>
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Your Name</span>
              <span class="settings-desc">Displayed on your dashboard header</span>
            </div>
            <input type="text" id="settingsUserName" class="settings-input" style="width: 180px;" value="${u.name || ''}">
          </div>

          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Avatar Emoji</span>
              <span class="settings-desc">Your personal visual token</span>
            </div>
            <input type="text" id="settingsUserAvatar" class="settings-input" style="width: 60px; text-align: center;" maxlength="2" value="${(u.avatar && !u.avatar.startsWith('http') && !u.avatar.startsWith('data:')) ? u.avatar : '✨'}">
          </div>
        </div>

        <!-- Daily Targets -->
        <div class="settings-card">
          <h3 class="section-title" style="font-size: 16px;">Daily Wellness Targets</h3>
          
          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Water Goal (ml)</span>
              <span class="settings-desc">Target daily water consumption</span>
            </div>
            <input type="number" id="settingsWaterGoal" class="settings-input" value="${s.dailyWaterGoal || 2500}" step="100">
          </div>

          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Sleep Target (Hours)</span>
              <span class="settings-desc">Recommended restful sleep duration</span>
            </div>
            <input type="number" id="settingsSleepGoal" class="settings-input" value="${s.dailySleepGoal || 8}" step="0.5">
          </div>

          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Focus Target (Minutes)</span>
              <span class="settings-desc">Daily deep focus time goal</span>
            </div>
            <input type="number" id="settingsFocusGoal" class="settings-input" value="${s.dailyFocusGoal || 60}" step="15">
          </div>
        </div>

        <!-- Audio & Appearance -->
        <div class="settings-card">
          <h3 class="section-title" style="font-size: 16px;">App Preferences</h3>

          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Sound Effects</span>
              <span class="settings-desc">Subtle micro-audio on clicks & streaks</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="settingsSoundToggle" ${s.sounds !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="settings-row">
            <div class="settings-label-wrap">
              <span class="settings-label">Appearance Mode</span>
              <span class="settings-desc">White Mode or Grey Mode aesthetic</span>
            </div>
            <button class="btn-secondary" id="settingsThemeBtn" style="padding: 6px 14px; font-size: 13px;">
              ${(s.theme === 'dark' || s.theme === 'grey') ? '☀️ Switch to White Mode' : '🌙 Switch to Grey Mode'}
            </button>
          </div>
        </div>

        <!-- Data Portability -->
        <div class="settings-card">
          <h3 class="section-title" style="font-size: 16px;">Data & Backup</h3>
          <p class="settings-desc" style="margin-top: -8px;">
            All your records are stored locally in your browser. Export anytime to back up your habits and logs.
          </p>

          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <button class="btn-secondary" id="exportDataBtn">
              📥 Export Backup (JSON)
            </button>
            
            <label class="btn-secondary" style="cursor: pointer;">
              📤 Import Backup
              <input type="file" id="importFileInput" accept=".json" style="display: none;">
            </label>

            <button class="btn-secondary" id="resetDataBtn" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);">
              🔄 Reset Demo Data
            </button>
          </div>
        </div>

        <!-- Account & Session (Displayed when Auth module is active) -->
        ${window.TrackX.auth ? `
        <div class="settings-card">
          <h3 class="section-title" style="font-size: 16px;">Account & Session</h3>
          <p class="settings-desc" style="margin-top: -8px;">
            Manage your authenticated TrackX session.
          </p>
          <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
            <div>
              <span style="font-size: 13.5px; font-weight: 600; color: var(--text-primary); display: block;" id="settingsAccountEmail">
                ${window.TrackX.auth && window.TrackX.auth.getCurrentUser() && window.TrackX.auth.getCurrentUser().email ? window.TrackX.auth.getCurrentUser().email : 'Authenticated User'}
              </span>
              <span style="font-size: 12px; color: var(--text-muted);">Protected by Firebase Authentication</span>
            </div>
            <button class="btn-secondary" id="settingsLogoutBtn" style="color: var(--accent-rose); border-color: rgba(244, 63, 94, 0.3);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Sign Out
            </button>
          </div>
        </div>
        ` : ''}

        <!-- Track X Product Showcase & Feature Tour -->
        ${window.TrackX.showcase && window.TrackX.showcase.getSettingsShowcaseHTML ? window.TrackX.showcase.getSettingsShowcaseHTML() : ''}
      </div>
    `;

    attachSettingsEvents(container);
  }

  function setupSettingsHandlers() {}

  function attachSettingsEvents(container) {
    const nameInput = container.querySelector('#settingsUserName');
    if (nameInput) {
      nameInput.addEventListener('change', () => {
        state.updateProfile({ name: nameInput.value.trim() });
        showToast('Profile updated', 'success', '👤');
      });
    }

    const avatarInput = container.querySelector('#settingsUserAvatar');
    if (avatarInput) {
      avatarInput.addEventListener('change', () => {
        state.updateProfile({ avatar: avatarInput.value.trim() });
        showToast('Avatar updated', 'success', avatarInput.value.trim() || '✨');
      });
    }

    const waterInput = container.querySelector('#settingsWaterGoal');
    if (waterInput) {
      waterInput.addEventListener('change', () => {
        const val = parseInt(waterInput.value, 10);
        if (val > 0) state.updateSettings({ dailyWaterGoal: val });
      });
    }

    const sleepInput = container.querySelector('#settingsSleepGoal');
    if (sleepInput) {
      sleepInput.addEventListener('change', () => {
        const val = parseFloat(sleepInput.value);
        if (val > 0) state.updateSettings({ dailySleepGoal: val });
      });
    }

    const focusInput = container.querySelector('#settingsFocusGoal');
    if (focusInput) {
      focusInput.addEventListener('change', () => {
        const val = parseInt(focusInput.value, 10);
        if (val > 0) state.updateSettings({ dailyFocusGoal: val });
      });
    }

    const soundToggle = container.querySelector('#settingsSoundToggle');
    if (soundToggle) {
      soundToggle.addEventListener('change', () => {
        state.updateSettings({ sounds: soundToggle.checked });
        showToast(soundToggle.checked ? 'Sounds enabled' : 'Sounds muted', 'info', '🔊');
      });
    }

    const themeBtn = container.querySelector('#settingsThemeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = (state.data && state.data.settings && state.data.settings.theme) || 'light';
        const isGrey = (current === 'dark' || current === 'grey');
        const next = isGrey ? 'light' : 'dark';
        state.updateSettings({ theme: next });
        applyTheme(next);
        renderSettings();
      });
    }

    const exportBtn = container.querySelector('#exportDataBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        exportDataAsJSON(state.data);
        showToast('Backup JSON downloaded', 'success', '💾');
      });
    }

    const importInput = container.querySelector('#importFileInput');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const res = importDataFromJSON(ev.target.result);
          if (res.success) {
            state.data = res.data;
            const authUser = window.TrackX.auth && window.TrackX.auth.getCurrentUser();
            if (authUser && window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.importLocalDataToCloud === 'function') {
              window.TrackX.firestoreSync.importLocalDataToCloud(authUser.uid, res.data);
            }
            showToast('Data imported and synced to cloud!', 'success', '🎉');
            renderSettings();
          } else {
            alert('Failed to import: ' + res.error);
          }
        };
        reader.readAsText(file);
      });
    }

    const resetBtn = container.querySelector('#resetDataBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset TrackX to initial sample data? This will overwrite existing records.')) {
          state.resetAllData();
          const authUser = window.TrackX.auth && window.TrackX.auth.getCurrentUser();
          if (authUser && window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.startFreshCloudAccount === 'function') {
            window.TrackX.firestoreSync.startFreshCloudAccount(authUser.uid);
          }
          renderSettings();
        }
      });
    }

    const logoutBtn = container.querySelector('#settingsLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (window.TrackX.auth && typeof window.TrackX.auth.signOutUser === 'function') {
          window.TrackX.auth.signOutUser();
        }
      });
    }
  }

  // ==========================================
  // KEYBOARD SHORTCUTS
  // ==========================================

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('active'));
      }

      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      if (e.key === '1') switchView('today');
      else if (e.key === '2') switchView('habits');
      else if (e.key === '3') switchView('progress');
      else if (e.key === '4') switchView('calendar');
      else if (e.key === '5') switchView('achievements');
      else if (e.key === '6') switchView('settings');
    });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  window.TrackX.app = {
    initApp,
    switchView
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})(window);
