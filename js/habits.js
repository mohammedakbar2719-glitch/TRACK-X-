/**
 * TRACKX - Habits View Module
 * Habit management, category filtering, 7-day completion dots, custom habit creation modal
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { state } = window.TrackX;
  const { icons, getPastNDays, parseDateKey } = window.TrackX.utils;

  let activeCategory = 'all';

  let isHabitsInitialized = false;

  function initHabits() {
    if (isHabitsInitialized) return;
    isHabitsInitialized = true;

    state.subscribe((event) => {
      if (state.getActiveView() === 'habits') {
        renderHabits();
      }
    });
  }

  function renderHabits() {
    const container = document.getElementById('viewHabits');
    if (!container) return;

    const allHabits = state.data.habits;
    const filteredHabits = activeCategory === 'all'
      ? allHabits
      : allHabits.filter((h) => h.category === activeCategory);

    const past7Days = getPastNDays(7);

    container.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">Habits</h1>
          <p class="section-meta">Operational routines and cadence tracking</p>
        </div>
        <button class="btn-primary" id="openNewHabitModalBtn">
          ${icons.plus}
          <span>New Habit</span>
        </button>
      </div>

      <!-- Category Filter Chips -->
      <div class="habits-filter-bar">
        ${renderFilterChip('all', 'All Habits', allHabits.length)}
        ${renderFilterChip('mind', 'Mind', allHabits.filter(h => h.category === 'mind').length)}
        ${renderFilterChip('body', 'Body', allHabits.filter(h => h.category === 'body').length)}
        ${renderFilterChip('focus', 'Focus', allHabits.filter(h => h.category === 'focus').length)}
        ${renderFilterChip('growth', 'Growth', allHabits.filter(h => h.category === 'growth').length)}
      </div>

      <!-- Habits Grid -->
      <div class="habits-grid">
        ${filteredHabits.length === 0 ? `
          <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div style="width: 36px; height: 36px; border-radius: var(--radius-xs); background: var(--bg-input); border: 1px solid var(--border-subtle); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 8px; color: var(--text-muted);">
              ${icons.check}
            </div>
            <h3 style="font-weight: 600; font-size: 14px; margin-top: 4px; color: var(--text-primary);">No habits in this category</h3>
            <p style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">Click "+ New Habit" above to create one.</p>
          </div>
        ` : filteredHabits.map((habit) => renderHabitManageCard(habit, past7Days)).join('')}
      </div>
    `;

    attachHabitEvents(container);
  }

  function renderFilterChip(categoryKey, label, count) {
    const isActive = activeCategory === categoryKey;
    return `
      <button class="filter-chip ${isActive ? 'active' : ''}" data-category="${categoryKey}">
        ${label} <span style="opacity: 0.65; font-variant-numeric: tabular-nums;">(${count})</span>
      </button>
    `;
  }

  function renderHabitManageCard(habit, past7Days) {
    const streak = state.calculateHabitStreak(habit.id);

    let catColor = 'var(--accent-mind)';
    if (habit.category === 'body') catColor = 'var(--accent-body)';
    else if (habit.category === 'focus') catColor = 'var(--accent-focus)';
    else if (habit.category === 'growth') catColor = 'var(--accent-growth)';

    return `
      <div class="habit-manage-card" data-habit-id="${habit.id}">
        <div class="habit-manage-top">
          <div class="habit-manage-icon-wrap">
            <div class="habit-icon-badge" style="background: var(--bg-input);">
              ${habit.icon || '✓'}
            </div>
            <div>
              <h3 class="habit-manage-name">${habit.name}</h3>
              <span class="habit-category-pill" style="color: ${catColor}; font-size: 11px;">
                ${habit.category} • ${habit.frequency || 'Daily'}
              </span>
            </div>
          </div>

          <div class="habit-manage-actions">
            <button class="icon-action-btn delete" data-action="delete" title="Delete Habit">
              ${icons.trash}
            </button>
          </div>
        </div>

        <!-- Mini 7-Day Completion Dots -->
        <div class="habit-week-dots">
          ${past7Days.map((dStr) => {
            const dObj = parseDateKey(dStr);
            const dayLetter = dObj.toLocaleDateString('en-US', { weekday: 'narrow' });
            const dayLog = state.data.logs[dStr];
            const isDone = dayLog && dayLog.completedHabits && dayLog.completedHabits.includes(habit.id);

            return `
              <div class="week-dot-col" title="${dStr}: ${isDone ? 'Completed' : 'Missed'}">
                <span class="week-dot-label">${dayLetter}</span>
                <div class="week-dot-circle ${isDone ? 'done' : ''}">
                  ${isDone ? icons.check : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--warning); font-variant-numeric: tabular-nums;">
            ${icons.flame}
            <span>${streak}d current streak</span>
          </div>
          <button class="btn-secondary" style="padding: 5px 12px; font-size: 12px;" data-action="quick-toggle">
            ${isHabitDoneToday(habit.id) ? 'Mark Undone' : 'Mark Done'}
          </button>
        </div>
      </div>
    `;
  }

  function isHabitDoneToday(habitId) {
    const todayLog = state.getDayLog(state.getSelectedDate());
    return todayLog.completedHabits.includes(habitId);
  }

  function attachHabitEvents(container) {
    container.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeCategory = chip.dataset.category;
        renderHabits();
      });
    });

    const newBtn = container.querySelector('#openNewHabitModalBtn');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        const modal = document.getElementById('newHabitModal');
        if (modal) modal.classList.add('active');
      });
    }

    container.querySelectorAll('.habit-manage-card').forEach((card) => {
      const habitId = card.dataset.habitId;

      const deleteBtn = card.querySelector('[data-action="delete"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Are you sure you want to delete this habit?')) {
            state.deleteHabit(habitId);
          }
        });
      }

      const toggleBtn = card.querySelector('[data-action="quick-toggle"]');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.toggleHabit(habitId);
        });
      }
    });
  }

  window.TrackX.habits = {
    initHabits,
    renderHabits
  };

})(window);
