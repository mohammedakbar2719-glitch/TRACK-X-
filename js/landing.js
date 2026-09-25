/**
 * TRACKX - Public Landing Page Controller
 * Navigation, FAQ accordions, interactive product showcase tabs, feedback form, and legal modals.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};

  let isLandingInitialized = false;

  function initLanding() {
    if (isLandingInitialized) return;
    isLandingInitialized = true;

    setupMobileMenu();
    setupFaqAccordion();
    setupPreviewTabs();
    setupFeedbackForm();
    setupLegalModals();
    setupSmoothScrollLinks();
  }

  function showLandingPage() {
    const landingEl = document.getElementById('publicLanding');
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.querySelector('.app-container');

    if (landingEl) {
      landingEl.style.setProperty('display', 'block', 'important');
      landingEl.style.setProperty('visibility', 'visible', 'important');
      landingEl.style.setProperty('pointer-events', 'auto', 'important');
      landingEl.style.setProperty('z-index', '1', 'important');
    }
    if (authContainer) {
      authContainer.classList.add('hidden');
      authContainer.style.setProperty('display', 'none', 'important');
      authContainer.style.setProperty('pointer-events', 'none', 'important');
      authContainer.style.setProperty('visibility', 'hidden', 'important');
      authContainer.style.setProperty('z-index', '-1', 'important');
    }
    if (appContainer) {
      appContainer.style.setProperty('display', 'none', 'important');
      appContainer.style.setProperty('pointer-events', 'none', 'important');
      appContainer.style.setProperty('visibility', 'hidden', 'important');
      appContainer.style.setProperty('z-index', '-1', 'important');
    }

    // Close any open mobile drawer
    const mobileMenu = document.getElementById('landingMobileMenu');
    if (mobileMenu) mobileMenu.classList.remove('active');
  }

  function hideLandingPage() {
    const landingEl = document.getElementById('publicLanding');
    if (landingEl) {
      landingEl.style.setProperty('display', 'none', 'important');
      landingEl.style.setProperty('visibility', 'hidden', 'important');
      landingEl.style.setProperty('pointer-events', 'none', 'important');
      landingEl.style.setProperty('z-index', '-1', 'important');
    }
  }

  function isLandingVisible() {
    const landingEl = document.getElementById('publicLanding');
    return landingEl && landingEl.style.display !== 'none';
  }

  function setupMobileMenu() {
    const toggleBtn = document.getElementById('landingMobileToggle');
    const mobileMenu = document.getElementById('landingMobileMenu');

    if (toggleBtn && mobileMenu) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = mobileMenu.classList.toggle('active');
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      // Close menu when clicking any mobile nav link
      mobileMenu.querySelectorAll('.landing-mobile-nav-link').forEach((link) => {
        link.addEventListener('click', () => {
          mobileMenu.classList.remove('active');
          toggleBtn.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  function setupFaqAccordion() {
    const faqItems = document.querySelectorAll('.landing-faq-list .faq-item');
    faqItems.forEach((item) => {
      const btn = item.querySelector('.faq-question-btn');
      if (!btn) return;

      btn.addEventListener('click', () => {
        const wasOpen = item.classList.contains('open');
        // Close other items for crisp single-accordion feel
        faqItems.forEach((other) => {
          other.classList.remove('open');
          const otherBtn = other.querySelector('.faq-question-btn');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        });

        if (!wasOpen) {
          item.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function setupPreviewTabs() {
    const tabBtns = document.querySelectorAll('.landing-preview-tabs .landing-tab-btn');
    const panels = document.querySelectorAll('.landing-preview-display .landing-preview-panel');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-preview');
        if (!targetView) return;

        tabBtns.forEach((b) => b.classList.remove('active'));
        panels.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPanel = document.getElementById(`previewPanel-${targetView}`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  function setupFeedbackForm() {
    const form = document.getElementById('landingFeedbackForm');
    const successCard = document.getElementById('landingFeedbackSuccess');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('feedbackName');
      const emailInput = document.getElementById('feedbackEmail');
      const typeSelect = document.getElementById('feedbackType');
      const msgInput = document.getElementById('feedbackMessage');
      const submitBtn = document.getElementById('feedbackSubmitBtn');

      const message = (msgInput ? msgInput.value : '').trim();
      if (!message) {
        if (msgInput) msgInput.focus();
        return;
      }

      const feedbackData = {
        name: (nameInput ? nameInput.value : '').trim() || 'Anonymous',
        email: (emailInput ? emailInput.value : '').trim() || 'Not provided',
        type: (typeSelect ? typeSelect.value : 'General Feedback'),
        message,
        createdAt: new Date().toISOString(),
        userAgent: navigator.userAgent
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      try {
        // 1. Save to Firestore if available
        const fb = window.TrackX.firebase;
        if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
          const db = fb.getFirestore();
          if (db) {
            await db.collection('feedback').add(feedbackData);
          }
        }

        // 2. Also save to LocalStorage for offline resilience
        try {
          const existing = JSON.parse(localStorage.getItem('trackx_feedback_submissions') || '[]');
          existing.push(feedbackData);
          localStorage.setItem('trackx_feedback_submissions', JSON.stringify(existing));
        } catch (storageErr) {}

        // Show success state
        form.style.display = 'none';
        if (successCard) {
          successCard.classList.add('active');
        }

        if (window.TrackX.utils && window.TrackX.utils.showToast) {
          window.TrackX.utils.showToast({
            title: 'Feedback Received',
            message: 'Thank you for helping us improve TrackX.',
            type: 'success',
            icon: '✉️'
          });
        }
      } catch (err) {
        console.warn('[TrackX Feedback Warning]:', err);
        // Fallback to local storage on network error
        try {
          const existing = JSON.parse(localStorage.getItem('trackx_feedback_submissions') || '[]');
          existing.push(feedbackData);
          localStorage.setItem('trackx_feedback_submissions', JSON.stringify(existing));
        } catch (e) {}

        form.style.display = 'none';
        if (successCard) successCard.classList.add('active');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Feedback';
        }
      }
    });
  }

  function setupLegalModals() {
    // Privacy Modal
    const privacyModal = document.getElementById('privacyModal');
    const openPrivacyBtns = document.querySelectorAll('[data-open-privacy]');
    const closePrivacyBtn = document.getElementById('closePrivacyBtn');

    openPrivacyBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (privacyModal) privacyModal.classList.add('active');
      });
    });

    if (closePrivacyBtn && privacyModal) {
      closePrivacyBtn.addEventListener('click', () => privacyModal.classList.remove('active'));
      privacyModal.addEventListener('click', (e) => {
        if (e.target === privacyModal) privacyModal.classList.remove('active');
      });
    }

    // Terms Modal
    const termsModal = document.getElementById('termsModal');
    const openTermsBtns = document.querySelectorAll('[data-open-terms]');
    const closeTermsBtn = document.getElementById('closeTermsBtn');

    openTermsBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (termsModal) termsModal.classList.add('active');
      });
    });

    if (closeTermsBtn && termsModal) {
      closeTermsBtn.addEventListener('click', () => termsModal.classList.remove('active'));
      termsModal.addEventListener('click', (e) => {
        if (e.target === termsModal) termsModal.classList.remove('active');
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (privacyModal) privacyModal.classList.remove('active');
        if (termsModal) termsModal.classList.remove('active');
      }
    });
  }

  function setupSmoothScrollLinks() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      const href = anchor.getAttribute('href');
      // In-page section anchors
      if (['#features', '#how-it-works', '#why-trackx', '#preview', '#about', '#feedback', '#faq'].includes(href)) {
        anchor.addEventListener('click', (e) => {
          e.preventDefault();
          const targetEl = document.querySelector(href);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }

          // If clicking footer links with data-preview-target, switch the preview tab
          const previewTarget = anchor.getAttribute('data-preview-target');
          if (previewTarget) {
            const targetTab = document.querySelector(`.landing-tab-btn[data-preview="${previewTarget}"]`);
            if (targetTab) targetTab.click();
          }
        });
      }

      // Explicit routing triggers for auth buttons on landing page
      if (href === '#login') {
        anchor.addEventListener('click', (e) => {
          e.preventDefault();
          if ((window.location.hash || '') === '#login') {
            if (window.TrackX.auth && typeof window.TrackX.auth.handleRouteProtection === 'function') {
              window.TrackX.auth.handleRouteProtection();
            }
          } else {
            window.location.hash = '#login';
          }
        });
      }

      if (href === '#signup') {
        anchor.addEventListener('click', (e) => {
          e.preventDefault();
          if ((window.location.hash || '') === '#signup') {
            if (window.TrackX.auth && typeof window.TrackX.auth.handleRouteProtection === 'function') {
              window.TrackX.auth.handleRouteProtection();
            }
          } else {
            window.location.hash = '#signup';
          }
        });
      }

      if (href === '#' || href === '#home') {
        anchor.addEventListener('click', (e) => {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
    });
  }

  window.TrackX.landing = {
    initLanding,
    showLandingPage,
    hideLandingPage,
    isLandingVisible
  };

})(window);
