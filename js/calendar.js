/**
 * TRACKX - Google Calendar-Style Calendar View Module
 * Clean, information-dense, familiar calendar UX with uncluttered date cells.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { state } = window.TrackX;
  const {
    formatDateKey,
    parseDateKey,
    getMonthYearLabel,
    getDaysInMonth,
    getFirstDayOfWeek,
    formatDisplayDate,
    formatFullDate,
    icons,
    isToday,
    getTodayKey,
    addDays
  } = window.TrackX.utils;

  let currentCalYear = new Date().getFullYear();
  let currentCalMonth = new Date().getMonth();
  let currentCalView = 'month'; // 'month' | 'week' | 'day'

  let isCalendarInitialized = false;

  function initCalendar() {
    if (isCalendarInitialized) return;
    isCalendarInitialized = true;

    state.subscribe((event) => {
      if (state.getActiveView() === 'calendar') {
        renderCalendar();
      }
    });
  }

  function getCategoryColor(category) {
    const map = {
      body: 'var(--accent-body, #4F6B55)',    // Health / Exercise (restrained sage green)
      mind: 'var(--accent-mind, #5A5A56)',    // Mindfulness / Wellness (secondary graphite)
      focus: 'var(--accent-focus, #3A3A38)',   // Productivity / Deep Work (primary graphite)
      growth: 'var(--accent-growth, #8A7045)'   // Personal Growth (warm amber/ochre)
    };
    return map[category] || 'var(--primary)';
  }

  function renderCalendar() {
    if (window.TrackX.perf) window.TrackX.perf.start('calendar rendering');
    const container = document.getElementById('viewCalendar');
    if (!container) {
      if (window.TrackX.perf) window.TrackX.perf.end('calendar rendering');
      return;
    }

    // Lazy on-demand cloud fetch for visible month
    if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.loadCalendarMonth === 'function') {
      window.TrackX.firestoreSync.loadCalendarMonth(currentCalYear, currentCalMonth);
    }

    const monthLabel = getMonthYearLabel(currentCalYear, currentCalMonth);
    const selectedDate = state.getSelectedDate();
    const selectedLog = state.getDayLog(selectedDate);
    const selectedScore = state.calculateDailyScore(selectedDate);
    const activeHabits = state.data.habits || [];

    container.innerHTML = `
      <div class="gcal-wrapper">
        <!-- 1. Google Calendar Top Toolbar -->
        <header class="gcal-toolbar">
          <div class="gcal-toolbar-left">
            <button class="gcal-btn-today" id="gcalTodayBtn" title="Jump to Today">
              Today
            </button>
            <div class="gcal-nav-buttons">
              <button class="gcal-btn-nav" id="gcalPrevBtn" title="Previous" aria-label="Previous">
                ${icons.chevronLeft}
              </button>
              <button class="gcal-btn-nav" id="gcalNextBtn" title="Next" aria-label="Next">
                ${icons.chevronRight}
              </button>
            </div>
            <h1 class="gcal-month-title">${monthLabel}</h1>
          </div>

          <div class="gcal-toolbar-right">
            <!-- View Selector (Month / Week / Day) -->
            <div class="gcal-view-selector" role="tablist">
              <button class="gcal-view-tab ${currentCalView === 'month' ? 'active' : ''}" data-view="month">Month</button>
              <button class="gcal-view-tab ${currentCalView === 'week' ? 'active' : ''}" data-view="week">Week</button>
              <button class="gcal-view-tab ${currentCalView === 'day' ? 'active' : ''}" data-view="day">Day</button>
            </div>
          </div>
        </header>

        <!-- 2. Main Calendar Frame -->
        <div class="gcal-grid-frame">
          <!-- Weekday Headers -->
          <div class="gcal-weekdays-row">
            <div>SUN</div>
            <div>MON</div>
            <div>TUE</div>
            <div>WED</div>
            <div>THU</div>
            <div>FRI</div>
            <div>SAT</div>
          </div>

          <!-- Calendar Grid View Content -->
          <div id="gcalGridContainer">
            ${currentCalView === 'month' 
              ? renderMonthGrid(currentCalYear, currentCalMonth, selectedDate, activeHabits)
              : currentCalView === 'week'
              ? renderWeekGrid(selectedDate, activeHabits)
              : renderDayGrid(selectedDate, activeHabits)}
          </div>
        </div>

        <!-- 3. Selected Day Details Panel (Clean Event & Habit Inspector) -->
        <div class="gcal-detail-panel">
          <div class="gcal-detail-top">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-muted);">Selected Date</span>
              <h2 class="gcal-detail-date-title">${formatFullDate(selectedDate)}</h2>
            </div>

            <div class="gcal-detail-pills">
              ${renderSelectedDetailsHeaderPills(selectedLog, selectedScore, activeHabits)}
              <button class="btn-primary" id="gcalJumpToTodayBtn" style="padding: 6px 14px; font-size: 13px; border-radius: 6px;">
                Open in Today Dashboard
              </button>
            </div>
          </div>

          <!-- Interactive Habit Checklist for the Selected Date -->
          <div>
            <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
              Habits for this Day (Click to toggle)
            </span>
            <div class="gcal-detail-habits-list">
              ${renderDetailHabitsList(activeHabits, selectedLog, selectedDate)}
            </div>
          </div>

          <!-- Tertiary Wellness Metadata Row -->
          <div class="gcal-detail-wellness-row">
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;">Hydration:</span>
              <strong style="color: var(--text-primary); margin-left: 4px; font-variant-numeric: tabular-nums;">${(selectedLog.waterIntake || 0) / 1000}L / ${(selectedLog.waterGoal || 2500) / 1000}L</strong>
            </div>
            <span>•</span>
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;">Sleep:</span>
              <strong style="color: var(--text-primary); margin-left: 4px; font-variant-numeric: tabular-nums;">${selectedLog.sleep && selectedLog.sleep.hours ? selectedLog.sleep.hours + 'h (' + (selectedLog.sleep.quality || 4) + '/5 quality)' : 'Not logged'}</strong>
            </div>
            <span>•</span>
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;">Focus:</span>
              <strong style="color: var(--text-primary); margin-left: 4px; font-variant-numeric: tabular-nums;">${selectedLog.focusMinutes || 0}m</strong>
            </div>
            <span>•</span>
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px;">Mood:</span>
              <strong style="color: var(--text-primary); margin-left: 4px;">${getMoodText(selectedLog.mood ? selectedLog.mood.rating : 0)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    attachCalendarEvents(container);
    if (window.TrackX.perf) window.TrackX.perf.end('calendar rendering');
  }

  // ---------------------------------------------------------
  // Month View Generator
  // ---------------------------------------------------------
  function renderMonthGrid(year, month, selectedDateStr, activeHabits) {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfWeek(year, month);
    const daysInPrevMonth = getDaysInMonth(year, month - 1);

    let html = '<div class="gcal-month-grid">';

    // Leading days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const prevDayNum = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateKey = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(prevDayNum).padStart(2, '0')}`;
      html += renderDayCell(dateKey, prevDayNum, true, selectedDateStr, activeHabits);
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateKey = `${year}-${mStr}-${dStr}`;
      html += renderDayCell(dateKey, day, false, selectedDateStr, activeHabits);
    }

    // Trailing days to fill the complete 7-column calendar
    const totalRendered = firstDay + daysInMonth;
    const trailing = totalRendered % 7 === 0 ? 0 : 7 - (totalRendered % 7);
    for (let i = 1; i <= trailing; i++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const dateKey = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      html += renderDayCell(dateKey, i, true, selectedDateStr, activeHabits);
    }

    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------
  // Individual Date Cell Generator (Uncluttered, No Habit Text)
  // ---------------------------------------------------------
  function renderDayCell(dateKey, dayNumber, isOtherMonth, selectedDateStr, activeHabits) {
    const isSel = dateKey === selectedDateStr;
    const isTod = isToday(dateKey);
    const dayLog = state.data.logs[dateKey];
    const completedList = (dayLog && dayLog.completedHabits) ? dayLog.completedHabits : [];
    const completedCount = completedList.length;

    let indicatorHtml = '';
    if (!isOtherMonth && completedCount > 0) {
      indicatorHtml = `
        <div class="gcal-cell-indicators">
          <div class="gcal-dots-row">
            ${completedList.slice(0, 5).map((hid) => {
              const habit = activeHabits.find(h => h.id === hid);
              const color = habit ? getCategoryColor(habit.category) : 'var(--primary)';
              return `<span class="gcal-mini-dot" style="background: ${color};" title="${habit ? habit.name : ''}"></span>`;
            }).join('')}
          </div>
          <span class="gcal-cell-summary">${completedCount}/${activeHabits.length}</span>
        </div>
      `;
    }

    return `
      <div class="gcal-day-cell ${isOtherMonth ? 'other-month' : ''} ${isSel ? 'selected' : ''} ${isTod ? 'today' : ''}" data-date="${dateKey}">
        <div class="gcal-day-header">
          <span class="gcal-day-num">${dayNumber}</span>
        </div>
        ${indicatorHtml}
      </div>
    `;
  }

  // ---------------------------------------------------------
  // Week View Generator
  // ---------------------------------------------------------
  function renderWeekGrid(selectedDateStr, activeHabits) {
    const date = parseDateKey(selectedDateStr);
    const dayOfWeek = date.getDay();
    const sundayKey = addDays(selectedDateStr, -dayOfWeek);

    let html = '<div class="gcal-month-grid">';
    for (let i = 0; i < 7; i++) {
      const currentKey = addDays(sundayKey, i);
      const currDate = parseDateKey(currentKey);
      html += renderDayCell(currentKey, currDate.getDate(), false, selectedDateStr, activeHabits);
    }
    html += '</div>';
    return html;
  }

  // ---------------------------------------------------------
  // Day View Generator
  // ---------------------------------------------------------
  function renderDayGrid(selectedDateStr, activeHabits) {
    const currDate = parseDateKey(selectedDateStr);
    const dayLog = state.data.logs[selectedDateStr];
    const completedList = (dayLog && dayLog.completedHabits) ? dayLog.completedHabits : [];

    return `
      <div style="background: var(--bg-card); padding: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px;">
          <span style="font-size: 26px; font-weight: 700; color: var(--primary);">${currDate.getDate()}</span>
          <span style="font-size: 16px; font-weight: 600; color: var(--text-primary);">${currDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', year: 'numeric' })}</span>
        </div>
        <div class="gcal-detail-habits-list">
          ${renderDetailHabitsList(activeHabits, dayLog, selectedDateStr)}
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------
  // Details Section Helpers
  // ---------------------------------------------------------
  function renderSelectedDetailsHeaderPills(log, score, activeHabits) {
    const completedCount = log && log.completedHabits ? log.completedHabits.length : 0;
    const total = activeHabits.length || 1;
    const pct = Math.min(100, Math.round((completedCount / total) * 100));

    return `
      <span class="gcal-stat-pill"><strong>${pct}%</strong> completed</span>
      <span class="gcal-stat-pill"><strong>${completedCount} of ${activeHabits.length}</strong> completed</span>
      <span class="gcal-stat-pill">Daily score: <strong>${score}</strong></span>
    `;
  }

  function renderDetailHabitsList(activeHabits, log, dateStr) {
    if (activeHabits.length === 0) {
      return `<p style="font-size: 13px; color: var(--text-muted);">No habits created yet.</p>`;
    }

    const completed = (log && log.completedHabits) ? log.completedHabits : [];

    return activeHabits.map((habit) => {
      const isDone = completed.includes(habit.id);
      return `
        <div class="gcal-detail-habit-row ${isDone ? 'completed' : ''}" data-habit-id="${habit.id}">
          <div class="gcal-detail-check-icon">
            ${isDone ? icons.check : ''}
          </div>
          <span class="gcal-detail-habit-name">${habit.name}</span>
          <span class="gcal-detail-habit-cat">${habit.category}</span>
        </div>
      `;
    }).join('');
  }

  function getMoodText(rating) {
    const map = { 1: 'Low', 2: 'Fair', 3: 'Neutral', 4: 'Good', 5: 'Peak' };
    return map[rating] || 'Not logged';
  }

  // ---------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------
  function attachCalendarEvents(container) {
    // Navigation: Today
    const todayBtn = container.querySelector('#gcalTodayBtn');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        currentCalYear = now.getFullYear();
        currentCalMonth = now.getMonth();
        state.setSelectedDate(getTodayKey());
        renderCalendar();
      });
    }

    // Navigation: Previous
    const prevBtn = container.querySelector('#gcalPrevBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentCalView === 'month') {
          currentCalMonth--;
          if (currentCalMonth < 0) {
            currentCalMonth = 11;
            currentCalYear--;
          }
        } else if (currentCalView === 'week') {
          const sel = state.getSelectedDate();
          state.setSelectedDate(addDays(sel, -7));
          const newD = parseDateKey(state.getSelectedDate());
          currentCalYear = newD.getFullYear();
          currentCalMonth = newD.getMonth();
        } else {
          const sel = state.getSelectedDate();
          state.setSelectedDate(addDays(sel, -1));
          const newD = parseDateKey(state.getSelectedDate());
          currentCalYear = newD.getFullYear();
          currentCalMonth = newD.getMonth();
        }
        renderCalendar();
      });
    }

    // Navigation: Next
    const nextBtn = container.querySelector('#gcalNextBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (currentCalView === 'month') {
          currentCalMonth++;
          if (currentCalMonth > 11) {
            currentCalMonth = 0;
            currentCalYear++;
          }
        } else if (currentCalView === 'week') {
          const sel = state.getSelectedDate();
          state.setSelectedDate(addDays(sel, 7));
          const newD = parseDateKey(state.getSelectedDate());
          currentCalYear = newD.getFullYear();
          currentCalMonth = newD.getMonth();
        } else {
          const sel = state.getSelectedDate();
          state.setSelectedDate(addDays(sel, 1));
          const newD = parseDateKey(state.getSelectedDate());
          currentCalYear = newD.getFullYear();
          currentCalMonth = newD.getMonth();
        }
        renderCalendar();
      });
    }

    // View Selector Tabs (Month / Week / Day)
    container.querySelectorAll('.gcal-view-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        currentCalView = tab.dataset.view;
        renderCalendar();
      });
    });

    // Date Cell Click selects date
    container.querySelectorAll('.gcal-day-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const dateKey = cell.dataset.date;
        if (dateKey) {
          state.setSelectedDate(dateKey);
          renderCalendar();
        }
      });
    });

    // Habit Row Click in Details Panel toggles completion
    container.querySelectorAll('.gcal-detail-habit-row').forEach((row) => {
      row.addEventListener('click', () => {
        const habitId = row.dataset.habitId;
        const selectedDate = state.getSelectedDate();
        if (habitId) {
          state.toggleHabit(habitId, selectedDate);
          renderCalendar();
        }
      });
    });

    // Jump to Today Dashboard button
    const jumpBtn = container.querySelector('#gcalJumpToTodayBtn');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        state.setActiveView('today');
      });
    }
  }

  window.TrackX.calendar = {
    initCalendar,
    renderCalendar
  };

})(window);
