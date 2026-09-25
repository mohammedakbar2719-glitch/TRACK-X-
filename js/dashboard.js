/**
 * TRACKX - Today Dashboard View
 * Hero score ring, today habit checklist, wellness widgets, and interactive focus timer
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { state } = window.TrackX;
  const { icons, formatDisplayDate, isToday, isFuture, getPastNDays } = window.TrackX.utils;

  let focusInterval = null;
  let focusRemainingSeconds = 25 * 60;
  let focusIsRunning = false;

  let isDashboardInitialized = false;

  function initDashboard() {
    if (isDashboardInitialized) return;
    isDashboardInitialized = true;

    state.subscribe((event) => {
      if (state.getActiveView() === 'today') {
        renderDashboard();
      }
    });

    setupDailySummaryModalEvents();
  }

  function renderDashboard() {
    try {
      if (window.TrackX.perf) window.TrackX.perf.start('dashboard initialization');
      const container = document.getElementById('viewToday');
      if (!container) {
        if (window.TrackX.perf) window.TrackX.perf.end('dashboard initialization');
        return;
      }

      const dateStr = state.getSelectedDate();
      const log = state.getDayLog(dateStr);
      const safeLog = log || {};
      const habits = Array.isArray(state.data && state.data.habits) ? state.data.habits : [];
      const completedHabits = (safeLog && Array.isArray(safeLog.completedHabits)) ? safeLog.completedHabits : [];
      const score = typeof state.calculateDailyScore === 'function' ? state.calculateDailyScore(dateStr) : 0;
      const streak = typeof state.calculateOverallStreak === 'function' ? state.calculateOverallStreak() : 0;

      const circumference = 345.57;
      const strokeOffset = circumference - (score / 100) * circumference;

      let motivation = 'Begin your day with clear intention and deliberate action.';
      if (score >= 90) motivation = 'Optimal execution velocity. All primary daily targets completed.';
      else if (score >= 75) motivation = 'Strong consistency. Daily habits operating at high momentum.';
      else if (score >= 50) motivation = 'Halfway benchmark reached. Maintain focus through end of day.';
      else if (score > 0) motivation = 'Daily routine initialized. Focus on highest-priority habit next.';

      const completedCount = completedHabits.filter((id) =>
        habits.some((h) => h.id === id)
      ).length;

      const waterGoal = (safeLog && safeLog.waterGoal) || (state.data && state.data.settings && state.data.settings.dailyWaterGoal) || 2500;
      const waterPct = Math.min(100, Math.round((((safeLog && safeLog.waterIntake) || 0) / waterGoal) * 100));

      container.innerHTML = `
      <!-- Hero Daily Score Card -->
      <div class="hero-score-card">
        <div class="hero-score-info">
          <span class="hero-subtitle">Daily Performance</span>
          <h1 class="hero-title">${score >= 80 ? 'Peak Performance' : score >= 50 ? 'Solid Progression' : score > 0 ? 'In Progress' : 'Ready to Begin'}</h1>
          <p class="hero-quote">${motivation}</p>
          <div class="hero-badge-row">
            <div class="streak-pill">
              ${icons.flame}
              <span>${streak}d streak</span>
            </div>
            <span style="font-size: 13px; color: var(--border-strong);">•</span>
            <span style="font-size: 12.5px; font-weight: 600; color: var(--text-secondary); font-variant-numeric: tabular-nums;">
              ${completedCount}/${habits.length} Habits Completed
            </span>
            <button class="hero-summary-pill-btn" id="heroDailySummaryBtn" title="View Today's Performance Summary">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              <span>Daily Summary</span>
            </button>
          </div>
        </div>

        <!-- Animated SVG Progress Ring -->
        <div class="progress-ring-container">
          <svg class="progress-ring-svg" viewBox="0 0 130 130">
            <circle class="progress-ring-circle-bg" cx="65" cy="65" r="55" />
            <circle 
              class="progress-ring-circle" 
              cx="65" 
              cy="65" 
              r="55"
              style="stroke-dashoffset: ${strokeOffset};" 
            />
          </svg>
          <div class="progress-ring-content">
            <span class="progress-ring-number">${score}</span>
            <span class="progress-ring-label">Score</span>
          </div>
        </div>
      </div>

      <!-- Main Grid: Habits Checklist + Wellness Widgets -->
      <div class="dashboard-grid">
        <!-- Left Column: Today Habits Checklist -->
        <div class="habits-today-column">
          <div class="section-header">
            <h2 class="section-title">
              <span>Today's Habits</span>
            </h2>
            <span class="section-meta">${completedCount} of ${habits.length} completed</span>
          </div>

          <div class="habit-checklist" id="todayHabitList">
            ${renderHabitChecklist(habits, log, dateStr)}
          </div>
        </div>

        <!-- Right Column: Wellness & Productivity Widgets -->
        <div class="widgets-column">
          <!-- 1. Water Tracker Widget -->
          <div class="widget-card">
            <div class="widget-header">
              <div class="widget-title-wrap">
                <div class="widget-icon water">${icons.droplet}</div>
                <h3 class="widget-title">Hydration</h3>
              </div>
              <span class="widget-value">${((safeLog.waterIntake || 0) / 1000)}L / ${waterGoal / 1000}L</span>
            </div>

            <div class="water-progress-bar">
              <div class="water-progress-fill" style="width: ${waterPct}%;"></div>
            </div>

            <div class="water-quick-buttons">
              <button class="water-btn" data-action="add-water" data-amount="250">+250 ml</button>
              <button class="water-btn" data-action="add-water" data-amount="500">+500 ml</button>
              <button class="water-btn" data-action="custom-water">Custom</button>
            </div>
          </div>

          <!-- 2. Mood & Energy Tracker Widget -->
          <div class="widget-card">
            <div class="widget-header">
              <div class="widget-title-wrap">
                <div class="widget-icon mood">${icons.smile}</div>
                <h3 class="widget-title">Daily Mood</h3>
              </div>
              <span class="widget-value">${getMoodLabel(safeLog.mood ? safeLog.mood.rating : 0)}</span>
            </div>

            <div class="mood-selector-row">
              ${renderMoodButtons(safeLog.mood ? safeLog.mood.rating : 0)}
            </div>
          </div>

          <!-- 3. Sleep & Exercise Mini Grid -->
          <div class="two-column-widgets">
            <!-- Sleep Widget -->
            <div class="mini-widget-card" id="openSleepModalBtn">
              <div class="mini-widget-top">
                <span style="font-size: 13px; font-weight: 700; color: var(--text-secondary);">Sleep</span>
                <span style="color: var(--secondary-accent);">${icons.moon}</span>
              </div>
              <div class="mini-widget-num">
                ${safeLog.sleep && safeLog.sleep.hours ? safeLog.sleep.hours + 'h' : '--'}
              </div>
              <div class="mini-widget-desc">
                ${safeLog.sleep && safeLog.sleep.quality ? `${safeLog.sleep.quality}/5 Quality score` : 'Tap to log rest'}
              </div>
            </div>

            <!-- Exercise Widget -->
            <div class="mini-widget-card" id="openExerciseModalBtn">
              <div class="mini-widget-top">
                <span style="font-size: 13px; font-weight: 700; color: var(--text-secondary);">Exercise</span>
                <span style="color: var(--success);">${icons.activity}</span>
              </div>
              <div class="mini-widget-num">
                ${safeLog.exercise && safeLog.exercise.minutes ? safeLog.exercise.minutes + 'm' : '--'}
              </div>
              <div class="mini-widget-desc">
                ${safeLog.exercise && safeLog.exercise.type ? safeLog.exercise.type : 'Tap to log active time'}
              </div>
            </div>
          </div>

          <!-- 4. Deep Focus Pomodoro Timer -->
          <div class="widget-card">
            <div class="widget-header">
              <div class="widget-title-wrap">
                <div class="widget-icon focus">${icons.clock}</div>
                <h3 class="widget-title">Deep Focus</h3>
              </div>
              <span class="widget-value">${safeLog.focusMinutes || 0}m logged today</span>
            </div>

            <div class="focus-timer-box">
              <span class="focus-time-display" id="focusTimeDisplay">${formatTimer(focusRemainingSeconds)}</span>
              <div class="focus-controls">
                <button class="focus-btn-round play" id="focusPlayBtn" title="Start/Pause">
                  ${focusIsRunning ? icons.pause : icons.play}
                </button>
                <button class="focus-btn-round" id="focusResetBtn" title="Reset (25m)">
                  ${icons.rotateCcw}
                </button>
              </div>
            </div>
          </div>

          <!-- Non-Intrusive Product Tour & Showcase Banner (Dismissible) -->
          ${window.TrackX.showcase && window.TrackX.showcase.getDashboardBannerHTML ? window.TrackX.showcase.getDashboardBannerHTML() : ''}
        </div>
      </div>
    `;

    attachDashboardEvents(container, dateStr);
    if (window.TrackX.perf) window.TrackX.perf.end('dashboard initialization');
  } catch (err) {
    console.error('[TrackX Dashboard Render Error]:', err);
    if (window.TrackX.perf) window.TrackX.perf.end('dashboard initialization');
    const container = document.getElementById('viewToday');
    if (container && (!container.innerHTML || container.innerHTML.trim() === '')) {
      container.innerHTML = `
        <div style="padding: 32px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); margin-top: 12px; text-align: center;">
          <h3 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Refreshing Dashboard...</h3>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">Synchronizing your daily cadence and wellness telemetry.</p>
          <button class="btn-primary" onclick="window.TrackX.dashboard.renderDashboard()" style="margin: 0 auto;">Reload Dashboard</button>
        </div>
      `;
    }
  }
}

  function renderHabitChecklist(habits, log, dateStr) {
    const habitList = Array.isArray(habits) ? habits : [];
    const completedList = (log && Array.isArray(log.completedHabits)) ? log.completedHabits : [];

    if (habitList.length === 0) {
      return `
        <div class="empty-habits-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="empty-habits-icon"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
          <h4 class="empty-habits-title">No Active Habits</h4>
          <p class="empty-habits-desc">Create your first habit to establish your daily cadence and tracking.</p>
        </div>
      `;
    }

    return habitList.map((habit) => {
      const isCompleted = completedList.includes(habit.id);
      const streak = typeof state.calculateHabitStreak === 'function' ? state.calculateHabitStreak(habit.id, dateStr) : 0;

      let categoryColor = 'var(--accent-mind)';
      if (habit.category === 'body') categoryColor = 'var(--accent-body)';
      else if (habit.category === 'focus') categoryColor = 'var(--accent-focus)';
      else if (habit.category === 'growth') categoryColor = 'var(--accent-growth)';

      return `
        <div class="habit-card ${isCompleted ? 'completed' : ''}" data-habit-id="${habit.id}">
          <div class="habit-left">
            <div class="habit-checkbox">
              ${icons.check}
            </div>
            <div class="habit-icon-badge">
              ${habit.icon || '✨'}
            </div>
            <div class="habit-info">
              <span class="habit-name">${habit.name}</span>
              <span class="habit-category-pill" style="color: ${categoryColor};">
                ${habit.category}
              </span>
            </div>
          </div>

          <div class="habit-right">
            ${streak > 0 ? `
              <div class="habit-streak-badge">
                ${icons.flame}
                <span>${streak}d</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderMoodButtons(selectedRating) {
    const moods = [
      { 
        rating: 1, 
        label: 'Low', 
        svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>' 
      },
      { 
        rating: 2, 
        label: 'Fair', 
        svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="15" x2="16" y2="15"></line><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>' 
      },
      { 
        rating: 3, 
        label: 'Neutral', 
        svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>' 
      },
      { 
        rating: 4, 
        label: 'Good', 
        svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 13.5s1.5 3 4 3 4-3 4-3"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>' 
      },
      { 
        rating: 5, 
        label: 'Peak', 
        svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 13s1.5 3.5 4 3.5 4-3.5 4-3.5"></path><path d="M9 9l.01 0"></path><path d="M15 9l.01 0"></path><line x1="12" y1="2" x2="12" y2="4"></line></svg>' 
      }
    ];

    return moods.map((m) => `
      <button class="mood-btn ${selectedRating === m.rating ? 'selected' : ''}" data-rating="${m.rating}" title="${m.label}">
        <span class="mood-icon-wrap">${m.svg}</span>
        <span class="mood-label">${m.label}</span>
      </button>
    `).join('');
  }

  function getMoodLabel(rating) {
    const map = { 1: 'Low', 2: 'Fair', 3: 'Neutral', 4: 'Good', 5: 'Peak' };
    return map[rating] || 'Not logged';
  }

  function formatTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function attachDashboardEvents(container, dateStr) {
    const summaryBtn = container.querySelector('#heroDailySummaryBtn');
    if (summaryBtn) {
      summaryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDailySummaryModal();
      });
    }

    container.querySelectorAll('.habit-card').forEach((card) => {
      card.addEventListener('click', () => {
        const habitId = card.dataset.habitId;
        state.toggleHabit(habitId, dateStr);
      });
    });

    container.querySelectorAll('[data-action="add-water"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const amount = parseInt(btn.dataset.amount, 10);
        state.addWater(amount, dateStr);
      });
    });

    const customWaterBtn = container.querySelector('[data-action="custom-water"]');
    if (customWaterBtn) {
      customWaterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = prompt('Enter water amount in ml (e.g. 350):', '250');
        if (input && !isNaN(input)) {
          state.addWater(parseInt(input, 10), dateStr);
        }
      });
    }

    container.querySelectorAll('.mood-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rating = parseInt(btn.dataset.rating, 10);
        state.setMood(rating, rating, ['Balanced'], '', dateStr);
      });
    });

    const sleepBtn = container.querySelector('#openSleepModalBtn');
    if (sleepBtn) {
      sleepBtn.addEventListener('click', () => {
        openSleepDialog(dateStr);
      });
    }

    const exerciseBtn = container.querySelector('#openExerciseModalBtn');
    if (exerciseBtn) {
      exerciseBtn.addEventListener('click', () => {
        openExerciseDialog(dateStr);
      });
    }

    const playBtn = container.querySelector('#focusPlayBtn');
    const resetBtn = container.querySelector('#focusResetBtn');
    const display = container.querySelector('#focusTimeDisplay');

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (focusIsRunning) {
          clearInterval(focusInterval);
          focusIsRunning = false;
          playBtn.innerHTML = icons.play;
        } else {
          focusIsRunning = true;
          playBtn.innerHTML = icons.pause;
          if (focusInterval) clearInterval(focusInterval);
          focusInterval = setInterval(() => {
            if (focusRemainingSeconds > 0) {
              focusRemainingSeconds--;
              if (display) display.textContent = formatTimer(focusRemainingSeconds);

              if ((25 * 60 - focusRemainingSeconds) % 300 === 0 && focusRemainingSeconds < 25 * 60) {
                state.addFocusMinutes(5, dateStr);
              }
            } else {
              clearInterval(focusInterval);
              focusIsRunning = false;
              if (playBtn) playBtn.innerHTML = icons.play;
              focusRemainingSeconds = 25 * 60;
              state.addFocusMinutes(25, dateStr);
              if (display) display.textContent = formatTimer(focusRemainingSeconds);
            }
          }, 1000);
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        clearInterval(focusInterval);
        focusIsRunning = false;
        focusRemainingSeconds = 25 * 60;
        if (playBtn) playBtn.innerHTML = icons.play;
        if (display) display.textContent = formatTimer(focusRemainingSeconds);
      });
    }
  }

  function openSleepDialog(dateStr) {
    const log = state.getDayLog(dateStr);
    const safeLog = log || {};
    const currentHours = safeLog.sleep && safeLog.sleep.hours ? safeLog.sleep.hours : 8;
    const currentQuality = safeLog.sleep && safeLog.sleep.quality ? safeLog.sleep.quality : 4;

    const hoursInput = prompt('Hours of sleep (e.g. 7.5):', String(currentHours));
    if (hoursInput !== null && !isNaN(hoursInput)) {
      const qualityInput = prompt('Sleep quality (1 to 5 stars):', String(currentQuality));
      state.setSleep(parseFloat(hoursInput), parseInt(qualityInput || 4, 10), '23:00', '07:00', dateStr);
    }
  }

  function openExerciseDialog(dateStr) {
    const log = state.getDayLog(dateStr);
    const safeLog = log || {};
    const currentMins = safeLog.exercise && safeLog.exercise.minutes ? safeLog.exercise.minutes : 30;
    const currentType = safeLog.exercise && safeLog.exercise.type ? safeLog.exercise.type : 'Strength & Cardio';

    const minsInput = prompt('Workout duration in minutes (e.g. 45):', String(currentMins));
    if (minsInput !== null && !isNaN(minsInput)) {
      const typeInput = prompt('Workout type (e.g. Running, Gym, Yoga):', currentType);
      state.setExercise(parseInt(minsInput, 10), typeInput || 'General Fitness', 'moderate', dateStr);
    }
  }

  function startFocusTimer() {
    if (focusIsRunning) return;
    const playBtn = document.getElementById('focusPlayBtn');
    if (playBtn) {
      playBtn.click();
    } else {
      focusIsRunning = true;
      const dateStr = state.getSelectedDate();
      if (focusInterval) clearInterval(focusInterval);
      focusInterval = setInterval(() => {
        if (focusRemainingSeconds > 0) {
          focusRemainingSeconds--;
          const display = document.getElementById('focusTimeDisplay');
          if (display) display.textContent = formatTimer(focusRemainingSeconds);

          if ((25 * 60 - focusRemainingSeconds) % 300 === 0 && focusRemainingSeconds < 25 * 60) {
            state.addFocusMinutes(5, dateStr);
          }
        } else {
          clearInterval(focusInterval);
          focusIsRunning = false;
          const playBtnNow = document.getElementById('focusPlayBtn');
          if (playBtnNow) playBtnNow.innerHTML = icons.play;
          focusRemainingSeconds = 25 * 60;
          state.addFocusMinutes(25, dateStr);
          const display = document.getElementById('focusTimeDisplay');
          if (display) display.textContent = formatTimer(focusRemainingSeconds);
        }
      }, 1000);
    }
  }

  function isFocusActive() {
    return focusIsRunning;
  }

  // ==========================================
  // DAILY PERFORMANCE SUMMARY MODAL
  // ==========================================

  function openDailySummaryModal() {
    const modal = document.getElementById('dailySummaryModal');
    const modalBody = document.getElementById('dailySummaryModalBody');
    if (!modal || !modalBody) return;

    const dateStr = state.getSelectedDate();
    const summary = state.getDailySummary(dateStr);

    modalBody.innerHTML = `
      <!-- Top Score & Completion Header -->
      <div class="summary-top-card">
        <div class="summary-score-left">
          <span class="summary-score-eyebrow">Performance Score</span>
          <div class="summary-score-large">${summary.dailyScore}<span>/100</span></div>
          <p class="summary-score-text">
            ${summary.completionPct >= 80 ? 'Exceptional execution today! You are maintaining strong momentum.' : summary.completionPct >= 50 ? 'Solid progress today! Keep pushing toward daily consistency.' : 'Your day is underway. Complete your remaining habits to build momentum.'}
          </p>
        </div>

        <div class="summary-ring-box">
          <div class="summary-pct-circle">
            <span class="summary-pct-num">${summary.completionPct}%</span>
            <span class="summary-pct-lbl">Habits Done</span>
          </div>
        </div>
      </div>

      <!-- 4 Stats Metric Cards -->
      <div class="summary-stats-grid">
        <div class="summary-stat-box">
          <span class="summary-stat-icon">${icons.check}</span>
          <div class="summary-stat-text">
            <span class="summary-stat-val">${summary.completedCount} / ${summary.totalHabits}</span>
            <span class="summary-stat-lbl">Habits Completed</span>
          </div>
        </div>

        <div class="summary-stat-box">
          <span class="summary-stat-icon">${icons.flame}</span>
          <div class="summary-stat-text">
            <span class="summary-stat-val">${summary.streak} Days</span>
            <span class="summary-stat-lbl">Active Streak</span>
          </div>
        </div>

        <div class="summary-stat-box">
          <span class="summary-stat-icon">${icons.award || '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>'}</span>
          <div class="summary-stat-text">
            <span class="summary-stat-val">+${summary.totalDayXP} XP</span>
            <span class="summary-stat-lbl">Earned Today</span>
          </div>
        </div>

        <div class="summary-stat-box">
          <span class="summary-stat-icon">${icons.trophy || '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34"></path><path d="M4.5 4h15v5a7.5 7.5 0 0 1-15 0V4z"></path></svg>'}</span>
          <div class="summary-stat-text">
            <span class="summary-stat-val">${summary.unlockedAchievements.length > 0 ? summary.unlockedAchievements.length + ' Unlocked' : 'In Progress'}</span>
            <span class="summary-stat-lbl">Milestones</span>
          </div>
        </div>
      </div>

      <!-- Skills Progression for the Day -->
      <div class="summary-skills-section">
        <h4 class="summary-section-title">Developmental Skills Today</h4>
        <div class="summary-skills-list">
          ${summary.skillsSummary.map((s) => `
            <div class="summary-skill-row">
              <div class="summary-skill-header">
                <span class="summary-skill-name">${capitalize(s.category)}</span>
                <span class="summary-skill-pct">${s.completed}/${s.total} completed (${s.pct}%)</span>
              </div>
              <div class="summary-skill-track">
                <div class="summary-skill-fill" style="width: ${s.pct}%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Top Factual Insight -->
      ${summary.topInsight ? `
        <div class="summary-insight-banner">
          <span class="summary-insight-icon">${summary.topInsight.icon}</span>
          <div class="summary-insight-text">
            <span class="summary-insight-headline">${summary.topInsight.headline}</span>
            <span class="summary-insight-desc">${summary.topInsight.detail}</span>
          </div>
        </div>
      ` : ''}

      <button class="btn btn-primary summary-close-action-btn" id="closeDailySummaryActionBtn">
        Got It, Continue
      </button>
    `;

    modal.classList.add('active');

    const closeAction = modalBody.querySelector('#closeDailySummaryActionBtn');
    if (closeAction) {
      closeAction.addEventListener('click', () => modal.classList.remove('active'));
    }
  }

  function setupDailySummaryModalEvents() {
    const modal = document.getElementById('dailySummaryModal');
    const closeBtn = document.getElementById('closeDailySummaryModalBtn');
    if (!modal) return;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
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

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  window.TrackX.dashboard = {
    initDashboard,
    renderDashboard,
    startFocusTimer,
    isFocusActive,
    formatTimer,
    openDailySummaryModal
  };

})(window);
