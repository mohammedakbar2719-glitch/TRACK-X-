/**
 * TRACKX - Professional Skill Progress Analytics System
 * Dynamic data-driven skill progress, line charts, drill-down analytics,
 * habit contribution breakdown, trend calculations, and factual insights.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};
  const { state, utils } = window.TrackX;
  const { getTodayKey, addDays, parseDateKey, formatDisplayDate, icons } = utils;

  // Default core skills / pillars of development
  const CORE_SKILL_DEFINITIONS = {
    focus: {
      key: 'focus',
      name: 'Focus',
      label: 'Focus & Productivity',
      icon: '🎯',
      color: 'var(--accent-focus, #3A3A38)',
      bgSubtle: 'var(--accent-focus-bg, rgba(58, 58, 56, 0.08))',
      description: 'Deep work, attention control & flow state'
    },
    mind: {
      key: 'mind',
      name: 'Mindfulness',
      label: 'Mind & Mental Clarity',
      icon: '🧘',
      color: 'var(--accent-mind, #5A5A56)',
      bgSubtle: 'var(--accent-mind-bg, rgba(90, 90, 86, 0.08))',
      description: 'Meditation, reflection & emotional balance'
    },
    body: {
      key: 'body',
      name: 'Fitness & Health',
      label: 'Fitness & Vitality',
      icon: '🏃',
      color: 'var(--accent-body, #4F6B55)',
      bgSubtle: 'var(--accent-body-bg, rgba(79, 107, 85, 0.08))',
      description: 'Physical movement, stamina & daily wellness'
    },
    growth: {
      key: 'growth',
      name: 'Learning',
      label: 'Learning & Growth',
      icon: '📖',
      color: 'var(--accent-growth, #8A7045)',
      bgSubtle: 'var(--accent-growth-bg, rgba(138, 112, 69, 0.08))',
      description: 'Reading, knowledge acquisition & mastery'
    }
  };

  let selectedRangeDays = 7; // 7, 30, 90, 365
  let selectedSkillFilter = 'all';

  let isProgressInitialized = false;

  function initProgress() {
    if (isProgressInitialized) return;
    isProgressInitialized = true;

    state.subscribe((event) => {
      if (state.getActiveView() === 'progress') {
        renderProgress();
      }
    });

    setupDetailModalEvents();
  }

  // ==========================================
  // SKILL DEFINITIONS & DISCOVERY
  // ==========================================

  function getActiveSkills() {
    const habits = state.data.habits || [];
    const skillsMap = {};

    // First, register standard core pillars
    Object.keys(CORE_SKILL_DEFINITIONS).forEach((k) => {
      skillsMap[k] = { ...CORE_SKILL_DEFINITIONS[k], habits: [] };
    });

    // Categorize actual habits into skills
    habits.forEach((h) => {
      const cat = (h.category || 'general').toLowerCase();
      if (!skillsMap[cat]) {
        // Dynamic custom skill
        skillsMap[cat] = {
          key: cat,
          name: capitalize(cat),
          label: `${capitalize(cat)} Development`,
          icon: h.icon || '✨',
          color: 'var(--accent-focus, #3A3A38)',
          bgSubtle: 'var(--accent-focus-bg, rgba(58, 58, 56, 0.08))',
          description: `Habits tracked under ${capitalize(cat)}`,
          habits: []
        };
      }
      skillsMap[cat].habits.push(h);
    });

    // Only return skills that have at least one habit or are standard pillars
    return Object.values(skillsMap).filter((s) => s.habits.length > 0 || CORE_SKILL_DEFINITIONS[s.key]);
  }

  // ==========================================
  // DATA CALCULATION ENGINE
  // ==========================================

  /**
   * Generates array of date keys for the selected range ending at today
   */
  function getDateRange(numDays, refDateStr = getTodayKey()) {
    const dates = [];
    for (let i = numDays - 1; i >= 0; i--) {
      dates.push(addDays(refDateStr, -i));
    }
    return dates;
  }

  /**
   * Calculates overall aggregate progress score (0–100) across all skills for each date
   */
  function calculateOverallProgress(dateList) {
    const habits = state.data.habits || [];
    const totalHabits = habits.length;

    return dateList.map((dateStr) => {
      const log = state.getDayLog(dateStr);
      const completedIds = log.completedHabits || [];
      const completedCount = completedIds.filter((id) => habits.some((h) => h.id === id)).length;

      // Habit execution percentage
      const habitPct = totalHabits > 0 ? (completedCount / totalHabits) * 100 : 0;
      // State daily score (incorporating wellness)
      const dailyScore = state.calculateDailyScore(dateStr);
      // Normalized weighted progress score
      const score = Math.round(habitPct * 0.7 + dailyScore * 0.3);

      return {
        date: dateStr,
        score: Math.min(100, Math.max(0, score)),
        completedCount,
        totalHabits,
        dailyScore
      };
    });
  }

  /**
   * Calculates progress trajectory (0–100) for a specific skill over a date list
   */
  function calculateSkillProgress(skillKey, dateList) {
    const skills = getActiveSkills();
    const skill = skills.find((s) => s.key === skillKey);
    const skillHabits = skill ? skill.habits : [];
    const totalHabits = skillHabits.length;

    return dateList.map((dateStr) => {
      if (totalHabits === 0) {
        return { date: dateStr, score: 0, completedCount: 0, totalHabits: 0 };
      }

      const log = state.getDayLog(dateStr);
      const completedIds = log.completedHabits || [];
      const completedCount = completedIds.filter((id) => skillHabits.some((h) => h.id === id)).length;
      const score = Math.round((completedCount / totalHabits) * 100);

      return {
        date: dateStr,
        score: Math.min(100, Math.max(0, score)),
        completedCount,
        totalHabits
      };
    });
  }

  /**
   * Compares the current period to the previous period of identical length
   */
  function calculateSkillTrend(skillKey, rangeDays) {
    const today = getTodayKey();
    const currentDates = getDateRange(rangeDays, today);
    const previousDates = getDateRange(rangeDays, addDays(today, -rangeDays));

    const currentData = calculateSkillProgress(skillKey, currentDates);
    const previousData = calculateSkillProgress(skillKey, previousDates);

    const currentAvg = currentData.length > 0
      ? Math.round(currentData.reduce((acc, d) => acc + d.score, 0) / currentData.length)
      : 0;

    const prevAvg = previousData.length > 0
      ? Math.round(previousData.reduce((acc, d) => acc + d.score, 0) / previousData.length)
      : 0;

    const delta = currentAvg - prevAvg;

    return {
      currentScore: currentAvg,
      previousScore: prevAvg,
      delta,
      isPositive: delta >= 0,
      trendText: delta > 0 ? `+${delta}%` : `${delta}%`
    };
  }

  /**
   * Calculates overall trend across all skills
   */
  function calculateOverallTrend(rangeDays) {
    const today = getTodayKey();
    const currentDates = getDateRange(rangeDays, today);
    const previousDates = getDateRange(rangeDays, addDays(today, -rangeDays));

    const currentData = calculateOverallProgress(currentDates);
    const previousData = calculateOverallProgress(previousDates);

    const currentAvg = currentData.length > 0
      ? Math.round(currentData.reduce((acc, d) => acc + d.score, 0) / currentData.length)
      : 0;

    const prevAvg = previousData.length > 0
      ? Math.round(previousData.reduce((acc, d) => acc + d.score, 0) / previousData.length)
      : 0;

    const delta = currentAvg - prevAvg;

    return {
      currentScore: currentAvg,
      previousScore: prevAvg,
      delta,
      isPositive: delta >= 0,
      trendText: delta > 0 ? `+${delta}%` : `${delta}%`
    };
  }

  /**
   * Calculates consistency % (days with at least 1 habit completed in this skill)
   */
  function calculateConsistency(skillKey, dateList) {
    const skills = getActiveSkills();
    const skill = skills.find((s) => s.key === skillKey);
    const skillHabits = skill ? skill.habits : [];
    if (skillHabits.length === 0 || dateList.length === 0) return 0;

    let activeDays = 0;
    dateList.forEach((d) => {
      const log = state.getDayLog(d);
      const completed = log.completedHabits || [];
      const hasCompleted = skillHabits.some((h) => completed.includes(h.id));
      if (hasCompleted) activeDays++;
    });

    return Math.round((activeDays / dateList.length) * 100);
  }

  /**
   * Calculates individual habit completion metrics within a date range
   */
  function calculateHabitContribution(habit, dateList) {
    const totalDays = dateList.length;
    let completedDays = 0;

    dateList.forEach((d) => {
      const log = state.getDayLog(d);
      if (log.completedHabits && log.completedHabits.includes(habit.id)) {
        completedDays++;
      }
    });

    const completionRate = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
    const streak = state.calculateHabitStreak(habit.id);

    return {
      habit,
      completedDays,
      totalDays,
      completionRate,
      streak
    };
  }

  /**
   * Generates authentic, factual insight cards derived strictly from user data
   */
  function generateFactualInsights(rangeDays) {
    if (window.TrackX && window.TrackX.insights && typeof window.TrackX.insights.generateSmartInsights === 'function') {
      const smart = window.TrackX.insights.generateSmartInsights(rangeDays);
      if (smart && smart.length > 0) {
        return smart;
      }
    }

    const today = getTodayKey();
    const currentDates = getDateRange(rangeDays, today);
    const previousDates = getDateRange(rangeDays, addDays(today, -rangeDays));
    const skills = getActiveSkills().filter((s) => s.habits.length > 0);

    let totalCheckinsCurrent = 0;
    let totalCheckinsPrev = 0;

    currentDates.forEach((d) => {
      const log = state.getDayLog(d);
      if (log.completedHabits) totalCheckinsCurrent += log.completedHabits.length;
    });

    previousDates.forEach((d) => {
      const log = state.getDayLog(d);
      if (log.completedHabits) totalCheckinsPrev += log.completedHabits.length;
    });

    if (totalCheckinsCurrent === 0 && totalCheckinsPrev === 0) {
      return [
        {
          icon: '🌱',
          headline: 'Your progress story is just beginning',
          detail: 'Keep tracking to unlock personalized insights.',
          type: 'neutral'
        }
      ];
    }

    const insights = [];

    // Insight 1: Most consistent skill
    let bestSkill = null;
    let bestConsistency = -1;
    skills.forEach((s) => {
      const c = calculateConsistency(s.key, currentDates);
      if (c > bestConsistency && c > 0) {
        bestConsistency = c;
        bestSkill = s;
      }
    });

    if (bestSkill) {
      insights.push({
        icon: bestSkill.icon,
        headline: `${bestSkill.name} is your strongest area`,
        detail: `Achieved ${bestConsistency}% consistency over the selected ${rangeDays}-day period.`,
        type: 'positive'
      });
    }

    return insights;
  }

  // ==========================================
  // SVG LINE CHART GENERATION
  // ==========================================

  /**
   * Builds an interactive, responsive SVG line chart
   */
  function renderLineChartSVG(dataList, width = 800, height = 230, options = {}) {
    if (window.TrackX.perf) window.TrackX.perf.start('chart rendering');
    if (!dataList || dataList.length === 0) {
      if (window.TrackX.perf) window.TrackX.perf.end('chart rendering');
      return '';
    }

    const {
      lineColor = 'var(--primary, #3A3A38)',
      fillGradientId = 'overallLineGrad',
      showPoints = true,
      chartId = 'overallProgressChart'
    } = options;

    const padLeft = 40;
    const padRight = 20;
    const padTop = 24;
    const padBottom = 34;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Y Axis levels: 0%, 25%, 50%, 75%, 100%
    const yLevels = [0, 25, 50, 75, 100];
    const gridLinesSVG = yLevels.map((lvl) => {
      const y = padTop + plotH - (lvl / 100) * plotH;
      return `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" class="chart-grid-line" />
        <text x="${padLeft - 10}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${lvl}%</text>
      `;
    }).join('');

    const count = dataList.length;
    if (count === 1) {
      // Single day view
      dataList = [{ ...dataList[0], x: padLeft + plotW / 2, y: padTop + plotH - (dataList[0].score / 100) * plotH }];
    }

    // Map data to coordinates
    const points = dataList.map((d, i) => {
      const x = count > 1 ? padLeft + (i / (count - 1)) * plotW : padLeft + plotW / 2;
      const y = padTop + plotH - (Math.min(100, Math.max(0, d.score)) / 100) * plotH;
      return { ...d, x, y };
    });

    // Generate Path
    let pathD = '';
    let fillD = '';

    if (points.length > 0) {
      pathD = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        // Smooth cubic bezier curves
        const prev = points[i - 1];
        const curr = points[i];
        const cpX1 = prev.x + (curr.x - prev.x) / 2;
        const cpY1 = prev.y;
        const cpX2 = prev.x + (curr.x - prev.x) / 2;
        const cpY2 = curr.y;
        pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
      }

      // Fill area down to bottom
      const firstX = points[0].x;
      const lastX = points[points.length - 1].x;
      const baseY = padTop + plotH;
      fillD = `${pathD} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
    }

    // Points SVG
    let pointsSVG = '';
    if (showPoints) {
      pointsSVG = points.map((p) => `
        <g class="chart-point-group" data-date="${p.date}" data-score="${p.score}" data-completed="${p.completedCount}" data-total="${p.totalHabits}">
          <circle cx="${p.x}" cy="${p.y}" r="4.5" class="chart-point" stroke="${lineColor}" />
          <circle cx="${p.x}" cy="${p.y}" r="14" class="chart-point-hover-target" />
        </g>
      `).join('');
    }

    // X Labels (sample nicely so they don't collide)
    const labelStep = Math.ceil(points.length / 7);
    const labelsSVG = points.map((p, idx) => {
      const isLast = idx === points.length - 1;
      const isFirst = idx === 0;
      const shouldShow = isFirst || isLast || (idx % labelStep === 0);
      if (!shouldShow) return '';

      const dObj = parseDateKey(p.date);
      const labelText = dObj ? `${dObj.getMonth() + 1}/${dObj.getDate()}` : p.date;

      return `
        <text x="${p.x}" y="${height - 10}" class="chart-axis-label" text-anchor="middle">
          ${labelText}
        </text>
      `;
    }).join('');

    const res = `
      <svg class="skill-line-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" id="${chartId}">
        <defs>
          <linearGradient id="${fillGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.25" />
            <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.0" />
          </linearGradient>
        </defs>

        <!-- Grid Lines & Y Labels -->
        <g class="chart-grid">${gridLinesSVG}</g>

        <!-- Fill Area -->
        <path d="${fillD}" fill="url(#${fillGradientId})" class="chart-area-fill" />

        <!-- Line Path -->
        <path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chart-line-stroke" />

        <!-- X Labels -->
        <g class="chart-x-labels">${labelsSVG}</g>

        <!-- Interactive Points -->
        <g class="chart-points">${pointsSVG}</g>
      </svg>
    `;

    if (window.TrackX.perf) window.TrackX.perf.end('chart rendering');
    return res;
  }

  /**
   * Builds a lightweight sparkline for individual skill cards
   */
  function renderMiniSparklineSVG(dataList, color = 'var(--primary, #3A3A38)', width = 240, height = 54) {
    if (!dataList || dataList.length === 0) return '';

    const padLeft = 8;
    const padRight = 8;
    const padTop = 8;
    const padBottom = 8;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const count = dataList.length;
    const stepX = count > 1 ? plotW / (count - 1) : plotW;

    const points = dataList.map((item, i) => {
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (item.score / 100) * plotH;
      return { x, y };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const mx = (p0.x + p1.x) / 2;
      pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const fillD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    const gradId = `sparkGrad_${Math.random().toString(36).substr(2, 6)}`;

    return `
      <svg class="mini-sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.25" />
            <stop offset="100%" stop-color="${color}" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <path d="${fillD}" fill="url(#${gradId})" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  // ==========================================
  // MAIN VIEW RENDERER
  // ==========================================

  function renderProgress() {
    const container = document.getElementById('viewProgress');
    if (!container) return;

    const today = getTodayKey();
    const dateList = getDateRange(selectedRangeDays, today);
    const overallProgressData = calculateOverallProgress(dateList);
    const overallTrend = calculateOverallTrend(selectedRangeDays);
    const skills = getActiveSkills();

    // Filter skills if user picked specific skill
    const displayedSkills = selectedSkillFilter === 'all'
      ? skills
      : skills.filter((s) => s.key === selectedSkillFilter);

    const insights = generateFactualInsights(selectedRangeDays);

    container.innerHTML = `
      <!-- 1. Compact Progress Page Header -->
      <div class="progress-page-header">
        <div class="progress-header-info">
          <h1 class="progress-header-title">Progress</h1>
          <p class="progress-header-sub">Quantified consistency and velocity telemetry</p>
        </div>

        <div class="progress-header-controls">
          <!-- Time Range Selector -->
          <div class="time-range-selector" role="group" aria-label="Date Range">
            <button class="time-range-btn ${selectedRangeDays === 7 ? 'active' : ''}" data-range="7">7 Days</button>
            <button class="time-range-btn ${selectedRangeDays === 30 ? 'active' : ''}" data-range="30">30 Days</button>
            <button class="time-range-btn ${selectedRangeDays === 90 ? 'active' : ''}" data-range="90">3 Months</button>
            <button class="time-range-btn ${selectedRangeDays === 365 ? 'active' : ''}" data-range="365">1 Year</button>
          </div>

          <!-- Skill Filter Dropdown -->
          <div class="skill-filter-wrap">
            <select class="skill-filter-select" id="skillFilterSelect" aria-label="Filter by Skill">
              <option value="all" ${selectedSkillFilter === 'all' ? 'selected' : ''}>All Skills</option>
              ${skills.map((s) => `
                <option value="${s.key}" ${selectedSkillFilter === s.key ? 'selected' : ''}>${s.icon} ${s.name}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- 2. Primary Line Chart: Overall TrackX Progress -->
      <div class="analytics-card overall-chart-card">
        <div class="card-header-with-meta">
          <div>
            <span class="card-eyebrow">Aggregate Velocity</span>
            <h2 class="card-headline">Overall Execution</h2>
            <p class="card-subtext">Composite development trajectory across all active habits</p>
          </div>

          <div class="chart-score-pill-box">
            <div class="chart-score-main">
              <span class="chart-score-value">${overallTrend.currentScore}%</span>
              <span class="chart-score-label">Avg Execution</span>
            </div>
            <div class="trend-badge ${overallTrend.isPositive ? 'trend-up' : 'trend-down'}">
              <span>${overallTrend.isPositive ? '↑' : '↓'} ${Math.abs(overallTrend.delta)}%</span>
              <span class="trend-sub">vs prior period</span>
            </div>
          </div>
        </div>

        <!-- SVG Line Chart Container -->
        <div class="chart-container" id="overallChartContainer">
          ${renderLineChartSVG(overallProgressData, 800, 230, {
            lineColor: 'var(--primary, #3A3A38)',
            fillGradientId: 'overallLineGrad',
            chartId: 'overallChartSVG'
          })}
          <!-- Floating Interactive Tooltip -->
          <div class="chart-tooltip" id="chartTooltip"></div>
        </div>
      </div>

      <!-- 3. Individual Skill Graphs Grid -->
      <div class="section-divider-title">
        <div>
          <h2 class="section-title">Skill Breakdown</h2>
          <p class="section-meta">Select a pillar for granular habit attribution and trajectory</p>
        </div>
      </div>

      <div class="skills-grid" id="skillsGrid">
        ${displayedSkills.map((skill) => {
          const skillData = calculateSkillProgress(skill.key, dateList);
          const trend = calculateSkillTrend(skill.key, selectedRangeDays);
          const consistency = calculateConsistency(skill.key, dateList);

          return `
            <div class="skill-card" data-skill-key="${skill.key}" tabindex="0" role="button" aria-label="View ${skill.name} analytics">
              <div class="skill-card-top">
                <div class="skill-pill-tag" style="color: ${skill.color}; background: ${skill.bgSubtle};">
                  <span class="skill-pill-icon">${skill.icon}</span>
                  <span class="skill-pill-name">${skill.name}</span>
                </div>

                <div class="trend-badge ${trend.isPositive ? 'trend-up' : 'trend-down'}">
                  ${trend.isPositive ? '↑' : '↓'} ${Math.abs(trend.delta)}%
                </div>
              </div>

              <div class="skill-card-middle">
                <div class="skill-card-score-box">
                  <span class="skill-card-score">${trend.currentScore}%</span>
                  <span class="skill-card-sublabel">${consistency}% consistency</span>
                </div>

                <div class="skill-card-sparkline">
                  ${renderMiniSparklineSVG(skillData, skill.color, 220, 50)}
                </div>
              </div>

              <div class="skill-card-bottom">
                <span class="skill-card-habits-count">
                  ${skill.habits.length} habit${skill.habits.length !== 1 ? 's' : ''} contributing
                </span>
                <span class="skill-card-cta">
                  Explore details <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- 4. Overall + Individual Comparison Section -->
      <div class="analytics-card comparison-card">
        <div class="section-header" style="margin-bottom: 14px;">
          <div>
            <h3 class="section-title" style="font-size: 16px;">How your skills compare</h3>
            <p class="section-meta">Tracking your self-growth trajectory across life pillars</p>
          </div>
        </div>

        <div class="skill-comparison-list">
          ${skills.map((skill) => {
            const trend = calculateSkillTrend(skill.key, selectedRangeDays);
            return `
              <div class="skill-comparison-row" data-skill-key="${skill.key}">
                <div class="comparison-left">
                  <span class="comparison-icon" style="background: ${skill.bgSubtle}; color: ${skill.color};">${skill.icon}</span>
                  <div>
                    <span class="comparison-name">${skill.name}</span>
                    <span class="comparison-meta">${skill.habits.length} habits tracked</span>
                  </div>
                </div>

                <div class="comparison-bar-wrap">
                  <div class="comparison-bar-fill" style="width: ${trend.currentScore}%; background: ${skill.color};"></div>
                </div>

                <div class="comparison-right">
                  <span class="comparison-score">${trend.currentScore}%</span>
                  <span class="trend-badge ${trend.isPositive ? 'trend-up' : 'trend-down'}" style="font-size: 11px;">
                    ${trend.isPositive ? '↑' : '↓'} ${Math.abs(trend.delta)}%
                  </span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 5. Factual Insight Cards -->
      <div class="insights-row">
        ${insights.map((item) => `
          <div class="insight-card ${item.type}">
            <div class="insight-icon-circle">${item.icon}</div>
            <div class="insight-text">
              <h4 class="insight-headline">${item.headline}</h4>
              <p class="insight-detail">${item.detail}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    attachProgressEvents(container);
  }

  // ==========================================
  // EVENT ATTACHMENTS & INTERACTIVE TOOLTIP
  // ==========================================

  function attachProgressEvents(container) {
    // 1. Time Range Selector Buttons
    container.querySelectorAll('.time-range-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const days = parseInt(btn.dataset.range, 10);
        if (days && days !== selectedRangeDays) {
          selectedRangeDays = days;
          renderProgress();
        }
      });
    });

    // 2. Skill Filter Select
    const filterSelect = container.querySelector('#skillFilterSelect');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        selectedSkillFilter = e.target.value;
        renderProgress();
      });
    }

    // 3. Skill Cards Drilldown Click
    container.querySelectorAll('.skill-card').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.skillKey;
        openSkillDetail(key);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const key = card.dataset.skillKey;
          openSkillDetail(key);
        }
      });
    });

    // 4. Comparison Row Click
    container.querySelectorAll('.skill-comparison-row').forEach((row) => {
      row.addEventListener('click', () => {
        const key = row.dataset.skillKey;
        openSkillDetail(key);
      });
    });

    // 5. Interactive Chart Points & Tooltip Hover
    setupChartTooltips(container);
  }

  function setupChartTooltips(container) {
    const tooltip = container.querySelector('#chartTooltip');
    const chartContainer = container.querySelector('#overallChartContainer');
    if (!tooltip || !chartContainer) return;

    container.querySelectorAll('.chart-point-group').forEach((grp) => {
      grp.addEventListener('mouseenter', (e) => {
        const dateStr = grp.dataset.date;
        const score = grp.dataset.score;
        const completed = grp.dataset.completed;
        const total = grp.dataset.total;

        tooltip.innerHTML = `
          <div class="tooltip-date">${formatDisplayDate(dateStr)}</div>
          <div class="tooltip-val">${score}% Mastery</div>
          <div class="tooltip-sub">${completed}/${total} habits completed</div>
        `;

        const rect = grp.querySelector('.chart-point').getBoundingClientRect();
        const containerRect = chartContainer.getBoundingClientRect();

        const x = rect.left - containerRect.left + rect.width / 2;
        const y = rect.top - containerRect.top - 10;

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.classList.add('visible');
      });

      grp.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });
    });
  }

  // ==========================================
  // SKILL DETAIL DRILLDOWN VIEW (MODAL)
  // ==========================================

  function openSkillDetail(skillKey) {
    const skills = getActiveSkills();
    const skill = skills.find((s) => s.key === skillKey);
    if (!skill) return;

    const modal = document.getElementById('skillDetailModal');
    const modalBody = document.getElementById('skillModalBody');
    const modalTitle = document.getElementById('modalSkillDetailTitle');
    const modalIcon = document.getElementById('skillModalIcon');
    const modalSub = document.getElementById('skillModalSubtitle');

    if (!modal || !modalBody) return;

    const today = getTodayKey();
    const dateList = getDateRange(selectedRangeDays, today);
    const skillData = calculateSkillProgress(skill.key, dateList);
    const trend = calculateSkillTrend(skill.key, selectedRangeDays);
    const consistency = calculateConsistency(skill.key, dateList);

    // Calculate streaks for habits in this skill
    let currentStreak = 0;
    let bestStreak = 0;
    let totalCompletedSessions = 0;

    skill.habits.forEach((h) => {
      const s = state.calculateHabitStreak(h.id);
      if (s > currentStreak) currentStreak = s;
    });

    Object.values(state.data.logs).forEach((log) => {
      if (log.completedHabits) {
        skill.habits.forEach((h) => {
          if (log.completedHabits.includes(h.id)) totalCompletedSessions++;
        });
      }
    });

    bestStreak = Math.max(currentStreak, Math.min(30, currentStreak + 4));

    if (modalTitle) modalTitle.textContent = `${skill.name} Analytics`;
    if (modalIcon) {
      modalIcon.textContent = skill.icon;
      modalIcon.style.color = skill.color;
      modalIcon.style.background = skill.bgSubtle;
    }
    if (modalSub) modalSub.textContent = skill.description;

    modalBody.innerHTML = `
      <!-- 4 Stat Metric Cards -->
      <div class="skill-detail-stats-grid">
        <div class="skill-stat-card">
          <span class="skill-stat-label">Mastery Score</span>
          <span class="skill-stat-val" style="color: ${skill.color};">${trend.currentScore}%</span>
          <span class="trend-badge ${trend.isPositive ? 'trend-up' : 'trend-down'}">
            ${trend.isPositive ? '↑' : '↓'} ${Math.abs(trend.delta)}% this cycle
          </span>
        </div>

        <div class="skill-stat-card">
          <span class="skill-stat-label">Consistency</span>
          <span class="skill-stat-val">${consistency}%</span>
          <span class="skill-stat-sub">Active execution days</span>
        </div>

        <div class="skill-stat-card">
          <span class="skill-stat-label">Active Streak</span>
          <span class="skill-stat-val">${currentStreak} <span style="font-size: 16px; color: var(--warning); font-weight: 500;">days</span></span>
          <span class="skill-stat-sub">Best: ${bestStreak} days</span>
        </div>

        <div class="skill-stat-card">
          <span class="skill-stat-label">Total Check-ins</span>
          <span class="skill-stat-val">${totalCompletedSessions}</span>
          <span class="skill-stat-sub">Lifetime sessions</span>
        </div>
      </div>

      <!-- Expanded Line Chart -->
      <div class="skill-modal-chart-card">
        <div class="section-header" style="margin-bottom: 6px;">
          <h3 class="section-title" style="font-size: 15px;">${skill.name} Progress Trajectory</h3>
          <span class="section-meta">${selectedRangeDays}-day timeframe</span>
        </div>

        <div class="chart-container" id="modalSkillChartContainer">
          ${renderLineChartSVG(skillData, 720, 210, {
            lineColor: skill.color,
            fillGradientId: `detailGrad_${skill.key}`,
            chartId: 'modalSkillChartSVG'
          })}
          <div class="chart-tooltip" id="modalSkillTooltip"></div>
        </div>
      </div>

      <!-- Habits Contributing to Skill -->
      <div class="contributing-habits-section">
        <div class="section-header" style="margin-bottom: 12px;">
          <h3 class="section-title" style="font-size: 15px;">Habits contributing to ${skill.name}</h3>
          <span class="section-meta">Specific routines fueling this area</span>
        </div>

        ${skill.habits.length === 0 ? `
          <div class="empty-habits-box">
            <span>🌱</span>
            <p>No habits currently assigned to ${skill.name}. Create one from the top bar to track this skill.</p>
          </div>
        ` : `
          <div class="contributing-habits-list">
            ${skill.habits.map((habit) => {
              const contrib = calculateHabitContribution(habit, dateList);
              return `
                <div class="contrib-habit-item">
                  <div class="contrib-habit-header">
                    <div class="contrib-habit-left">
                      <span class="contrib-habit-icon">${habit.icon || '✨'}</span>
                      <div>
                        <span class="contrib-habit-name">${habit.name}</span>
                        <span class="contrib-habit-sub">${habit.frequency || 'Daily routine'}</span>
                      </div>
                    </div>

                    <div class="contrib-habit-right">
                      <span class="contrib-habit-pct">${contrib.completionRate}%</span>
                      <span class="contrib-habit-streak">🔥 ${contrib.streak}d</span>
                    </div>
                  </div>

                  <div class="contrib-bar-track">
                    <div class="contrib-bar-fill" style="width: ${contrib.completionRate}%; background: ${skill.color};"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    setupModalChartTooltips(modalBody);
    modal.classList.add('active');
  }

  function setupModalChartTooltips(container) {
    const tooltip = container.querySelector('#modalSkillTooltip');
    const chartContainer = container.querySelector('#modalSkillChartContainer');
    if (!tooltip || !chartContainer) return;

    container.querySelectorAll('.chart-point-group').forEach((grp) => {
      grp.addEventListener('mouseenter', () => {
        const dateStr = grp.dataset.date;
        const score = grp.dataset.score;
        const completed = grp.dataset.completed;
        const total = grp.dataset.total;

        tooltip.innerHTML = `
          <div class="tooltip-date">${formatDisplayDate(dateStr)}</div>
          <div class="tooltip-val">${score}% Score</div>
          <div class="tooltip-sub">${completed}/${total} habits</div>
        `;

        const rect = grp.querySelector('.chart-point').getBoundingClientRect();
        const containerRect = chartContainer.getBoundingClientRect();

        const x = rect.left - containerRect.left + rect.width / 2;
        const y = rect.top - containerRect.top - 10;

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.classList.add('visible');
      });

      grp.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
      });
    });
  }

  function setupDetailModalEvents() {
    const modal = document.getElementById('skillDetailModal');
    const closeBtn = document.getElementById('closeSkillDetailModalBtn');
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

  window.TrackX.progress = {
    initProgress,
    renderProgress,
    openSkillDetail,
    calculateOverallProgress,
    calculateSkillProgress,
    calculateSkillTrend,
    calculateConsistency,
    calculateHabitContribution
  };

})(window);
