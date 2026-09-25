/**
 * TRACKX - Product Showcase & Video Tour Module
 * High-performance video player, watermark masking, theatre modal, and non-intrusive dashboard/settings embeds.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};

  const VIDEO_SRC = 'video/Track_X_promotional_ad_sequence_20260920123514.mp4';
  const DISMISSED_STORAGE_KEY = 'trackx_showcase_banner_dismissed';

  let showcaseModal = null;
  let showcaseVideo = null;
  let isPlaying = false;
  let isMuted = false;

  function initShowcase() {
    showcaseModal = document.getElementById('showcaseModal');
    showcaseVideo = document.getElementById('showcaseVideo');

    setupModalEvents();
    setupVideoControls();
    setupGlobalTriggers();
  }

  function setupModalEvents() {
    if (!showcaseModal) return;

    const closeBtn = document.getElementById('closeShowcaseModalBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeShowcaseModal);
    }

    showcaseModal.addEventListener('click', (e) => {
      if (e.target === showcaseModal) {
        closeShowcaseModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!showcaseModal.classList.contains('active')) return;

      if (e.key === 'Escape') {
        closeShowcaseModal();
      } else if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    });
  }

  function setupGlobalTriggers() {
    // Top bar showcase button
    const topBtn = document.getElementById('topShowcaseBtn');
    if (topBtn) {
      topBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openShowcaseModal();
      });
    }

    // Sidebar navigation showcase link
    const sidebarLink = document.getElementById('navSidebarShowcase');
    if (sidebarLink) {
      sidebarLink.addEventListener('click', (e) => {
        e.preventDefault();
        openShowcaseModal();
      });
    }

    // Delegate clicks for any element with data-action="open-showcase"
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action="open-showcase"]');
      if (target) {
        e.preventDefault();
        openShowcaseModal();
      }

      // Handle dismiss of dashboard showcase banner
      const dismissBtn = e.target.closest('#dismissShowcaseBannerBtn');
      if (dismissBtn) {
        e.preventDefault();
        dismissDashboardBanner();
      }
    });
  }

  function openShowcaseModal() {
    if (!showcaseModal) return;
    showcaseModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    if (showcaseVideo) {
      showcaseVideo.currentTime = 0;
      const playPromise = showcaseVideo.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            updatePlayPauseButton(true);
          })
          .catch(() => {
            // Autoplay with audio was blocked by browser; mute and retry
            showcaseVideo.muted = true;
            updateMuteButton(true);
            showcaseVideo.play().then(() => {
              updatePlayPauseButton(true);
            }).catch(() => {
              updatePlayPauseButton(false);
            });
          });
      }
    }
  }

  function closeShowcaseModal() {
    if (!showcaseModal) return;
    showcaseModal.classList.remove('active');
    document.body.style.overflow = '';

    if (showcaseVideo) {
      showcaseVideo.pause();
      updatePlayPauseButton(false);
    }
  }

  function setupVideoControls() {
    if (!showcaseVideo) return;

    const playBtn = document.getElementById('showcasePlayBtn');
    const centerPlayBtn = document.getElementById('showcaseCenterPlayBtn');
    const muteBtn = document.getElementById('showcaseMuteBtn');
    const progressBar = document.getElementById('showcaseProgressBar');
    const progressFill = document.getElementById('showcaseProgressFill');
    const timeDisplay = document.getElementById('showcaseTimeDisplay');
    const fullscreenBtn = document.getElementById('showcaseFullscreenBtn');
    const replayBtn = document.getElementById('showcaseReplayBtn');

    if (playBtn) playBtn.addEventListener('click', togglePlayPause);
    if (centerPlayBtn) centerPlayBtn.addEventListener('click', togglePlayPause);

    if (muteBtn) muteBtn.addEventListener('click', toggleMute);

    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        showcaseVideo.currentTime = 0;
        showcaseVideo.play();
        updatePlayPauseButton(true);
      });
    }

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // Time update & Progress fill
    showcaseVideo.addEventListener('timeupdate', () => {
      const cur = showcaseVideo.currentTime || 0;
      const dur = showcaseVideo.duration || 10;
      const pct = (cur / dur) * 100;

      if (progressFill) progressFill.style.width = pct + '%';
      if (timeDisplay) timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    });

    // End of video
    showcaseVideo.addEventListener('ended', () => {
      updatePlayPauseButton(false);
      const centerWrap = document.getElementById('showcaseCenterOverlay');
      if (centerWrap) centerWrap.classList.add('visible');
    });

    // Scrubber click
    if (progressBar) {
      progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const clickPos = (e.clientX - rect.left) / rect.width;
        const dur = showcaseVideo.duration || 10;
        showcaseVideo.currentTime = clickPos * dur;
      });
    }
  }

  function togglePlayPause() {
    if (!showcaseVideo) return;
    if (showcaseVideo.paused || showcaseVideo.ended) {
      showcaseVideo.play().then(() => updatePlayPauseButton(true)).catch(() => {});
    } else {
      showcaseVideo.pause();
      updatePlayPauseButton(false);
    }
  }

  function updatePlayPauseButton(playing) {
    isPlaying = playing;
    const playBtn = document.getElementById('showcasePlayBtn');
    const centerWrap = document.getElementById('showcaseCenterOverlay');

    if (playBtn) {
      playBtn.innerHTML = playing
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      playBtn.setAttribute('title', playing ? 'Pause (Space)' : 'Play (Space)');
    }

    if (centerWrap) {
      centerWrap.classList.toggle('visible', !playing);
    }
  }

  function toggleMute() {
    if (!showcaseVideo) return;
    showcaseVideo.muted = !showcaseVideo.muted;
    updateMuteButton(showcaseVideo.muted);
  }

  function updateMuteButton(muted) {
    isMuted = muted;
    const muteBtn = document.getElementById('showcaseMuteBtn');
    if (!muteBtn) return;

    muteBtn.innerHTML = muted
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    muteBtn.setAttribute('title', muted ? 'Unmute (M)' : 'Mute (M)');
  }

  function toggleFullscreen() {
    const container = document.getElementById('showcasePlayerBox');
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  function formatTime(seconds) {
    const s = Math.floor(seconds % 60);
    const m = Math.floor(seconds / 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function isBannerDismissed() {
    try {
      return localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
    } catch (e) {
      return false;
    }
  }

  function dismissDashboardBanner() {
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
    } catch (e) {}

    const banner = document.getElementById('dashboardShowcaseCard');
    if (banner) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-10px)';
      banner.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
      }, 300);
    }
  }

  /**
   * Generates HTML for the non-intrusive Today Dashboard Showcase Card.
   * Only rendered if user hasn't explicitly dismissed it.
   */
  function getDashboardBannerHTML() {
    if (isBannerDismissed()) return '';

    return `
      <div class="showcase-banner-card" id="dashboardShowcaseCard">
        <button class="showcase-banner-dismiss-btn" id="dismissShowcaseBannerBtn" title="Dismiss card" aria-label="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div class="showcase-banner-left">
          <div class="showcase-banner-badge">
            <span class="pulse-dot-sm"></span>
            <span>SHOWCASE</span>
          </div>
          <h4 class="showcase-banner-title">Experience Track X in Action</h4>
          <p class="showcase-banner-desc">
            See how smart habits, 14-day streaks & deep focus power your daily momentum.
          </p>
          <button class="showcase-banner-btn" data-action="open-showcase">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
            <span>Watch 10s Tour</span>
          </button>
        </div>

        <div class="showcase-banner-preview" data-action="open-showcase" title="Click to watch video showcase">
          <div class="showcase-banner-video-wrap">
            <video class="showcase-banner-video" src="${VIDEO_SRC}" muted loop playsinline autoplay></video>
            <!-- Watermark shield & scaling applied via CSS -->
            <div class="showcase-banner-shield"></div>
            <div class="showcase-banner-play-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generates HTML for Settings View permanent showcase section.
   */
  function getSettingsShowcaseHTML() {
    return `
      <div class="settings-card showcase-settings-card">
        <div class="showcase-settings-header">
          <div>
            <h3 class="section-title" style="font-size: 16px;">Track X Product Showcase</h3>
            <span class="settings-desc">Official high-definition preview sequence and system tour</span>
          </div>
          <button class="btn-secondary" data-action="open-showcase" style="font-size: 12px; padding: 6px 12px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
            <span>Theatre Mode</span>
          </button>
        </div>

        <div class="settings-video-frame" data-action="open-showcase">
          <video class="settings-embedded-video" src="${VIDEO_SRC}" muted loop playsinline autoplay></video>
          <div class="settings-video-overlay">
            <div class="settings-video-watermark-cover"></div>
            <div class="settings-video-tag">
              <span>• TRACKX HD</span>
            </div>
            <div class="settings-video-play-badge">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>
              <span>Play Showcase</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.TrackX.showcase = {
    initShowcase,
    openShowcaseModal,
    closeShowcaseModal,
    getDashboardBannerHTML,
    getSettingsShowcaseHTML,
    isBannerDismissed
  };

})(window);
