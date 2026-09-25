/**
 * TRACKX - Authentication Module (Phase 1 & Phase 2)
 * Complete Login and Sign Up flows, live password requirements validation,
 * show/hide toggles, Google Auth, Firestore user document creation, and error handling.
 */

(function (window) {
  'use strict';

  window.TrackX = window.TrackX || {};

  let isSubmitting = false;
  let currentUser = null;
  let isAuthInitialized = false;
  let authUnsubscribe = null;

  // Authentication State Machine: 'loading' | 'authenticated' | 'unauthenticated'
  let authState = 'loading';

  const PROTECTED_ROUTES = [
    'today',
    'habits',
    'progress',
    'calendar',
    'achievements',
    'settings',
    'focus',
    'wellness',
    'showcase'
  ];

  const AUTH_ROUTES = [
    'login',
    'signup',
    'forgot-password'
  ];

  const LANDING_ROUTES = [
    '',
    'home',
    'landing',
    'features',
    'how-it-works',
    'why-trackx',
    'preview',
    'about',
    'feedback',
    'faq'
  ];

  function isLandingRoute(route) {
    if (!route) return true;
    return LANDING_ROUTES.includes(route);
  }

  // Robust RFC email validation regex
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let currentResetActionCode = null;

  function showLoadingScreen(customText = 'Loading TrackX...') {
    const loader = document.getElementById('authLoadingScreen');
    if (loader) {
      loader.classList.remove('hidden');
      loader.style.setProperty('display', 'flex', 'important');
      loader.style.setProperty('pointer-events', 'auto', 'important');
      loader.style.setProperty('visibility', 'visible', 'important');
      loader.style.setProperty('z-index', '99999', 'important');
    }
    const textEl = document.querySelector('.auth-loading-text');
    if (textEl && customText) {
      textEl.textContent = customText;
    }
  }

  function hideLoadingScreen() {
    const loader = document.getElementById('authLoadingScreen');
    if (loader) {
      loader.classList.add('hidden');
      loader.style.setProperty('display', 'none', 'important');
      loader.style.setProperty('pointer-events', 'none', 'important');
      loader.style.setProperty('visibility', 'hidden', 'important');
      loader.style.setProperty('z-index', '-1', 'important');
    }
  }

  function initAuth() {
    if (isAuthInitialized) return;
    isAuthInitialized = true;

    setupLoginFormEvents();
    setupSignupFormEvents();
    setupForgotPasswordFormEvents();
    setupResetPasswordFormEvents();
    setupPasswordRequirementsChecker();
    setupPasswordVisibilityToggles();
    setupGoogleAuth();
    setupLogoutButtons();
    setupNavigationLinks();
    checkInitialAuthState();
  }

  // ==========================================
  // VIEW SWITCHING (Login <-> Sign Up <-> Forgot <-> Reset)
  // ==========================================

  function switchAuthView(viewName) {
    // If public landing page is active, hide it
    if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
      window.TrackX.landing.hideLandingPage();
    }

    // If user is already authenticated, redirect them to Today view instead of showing auth views
    if (authState === 'authenticated' && AUTH_ROUTES.includes(viewName)) {
      history.replaceState(null, '', '#today');
      hideAuthScreen();
      if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
        window.TrackX.app.switchView('today');
      }
      return;
    }

    const loginView = document.getElementById('loginView');
    const signupView = document.getElementById('signupView');
    const forgotView = document.getElementById('forgotPasswordView');
    const resetView = document.getElementById('resetPasswordView');

    hideAuthAlert();

    // Reset active classes
    if (loginView) loginView.classList.remove('active');
    if (signupView) signupView.classList.remove('active');
    if (forgotView) forgotView.classList.remove('active');
    if (resetView) resetView.classList.remove('active');

    if (viewName === 'signup') {
      if (signupView) signupView.classList.add('active');
      history.replaceState({ authView: 'signup' }, '', '#signup');
    } else if (viewName === 'forgot-password') {
      if (forgotView) {
        forgotView.classList.add('active');
        const form = document.getElementById('forgotPasswordForm');
        const successCard = document.getElementById('forgotSuccessCard');
        if (form) form.style.display = 'block';
        if (successCard) successCard.style.display = 'none';
        clearFieldError('forgotEmail', 'forgotEmailError');
      }
      history.replaceState({ authView: 'forgot-password' }, '', '#forgot-password');
    } else if (viewName === 'reset-password') {
      if (resetView) {
        resetView.classList.add('active');
        const form = document.getElementById('resetPasswordForm');
        const successCard = document.getElementById('resetSuccessCard');
        const invalidCard = document.getElementById('resetInvalidCard');
        if (form && (!invalidCard || invalidCard.style.display !== 'block')) {
          form.style.display = 'block';
        }
        if (successCard) successCard.style.display = 'none';
        clearFieldError('resetPassword', 'resetPasswordError');
        clearFieldError('resetConfirmPassword', 'resetConfirmError');
      }
      history.replaceState({ authView: 'reset-password' }, '', '#reset-password');
    } else {
      if (loginView) loginView.classList.add('active');
      history.replaceState({ authView: 'login' }, '', '#login');
    }
  }

  function handleRouteProtection() {
    // If still in loading state, wait for checkInitialAuthState to resolve
    if (authState === 'loading') return;

    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    const route = hash.split('?')[0];

    if (authState === 'authenticated') {
      // Authenticated users should not see auth routes or landing routes
      if (AUTH_ROUTES.includes(route) || isLandingRoute(route)) {
        history.replaceState(null, '', '#today');
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        hideAuthScreen();
        if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
          window.TrackX.app.switchView('today');
        }
        return;
      }

      // If accessing a protected route, ensure app is visible and view rendered
      if (PROTECTED_ROUTES.includes(route)) {
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        hideAuthScreen();
        if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
          window.TrackX.app.switchView(route);
        }
        return;
      }

      // Default fallback for authenticated: send to #today
      history.replaceState(null, '', '#today');
      if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
        window.TrackX.landing.hideLandingPage();
      }
      hideAuthScreen();
      if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
        window.TrackX.app.switchView('today');
      }
      return;
    }

    if (authState === 'unauthenticated') {
      // If landing route: show public homepage, hide auth screen and app container
      if (isLandingRoute(route)) {
        hideAuthScreen();
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
          appContainer.style.setProperty('display', 'none', 'important');
          appContainer.style.setProperty('pointer-events', 'none', 'important');
        }
        if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
          window.TrackX.landing.showLandingPage();
        }
        return;
      }

      // Allow auth pages (login, signup, forgot-password)
      if (AUTH_ROUTES.includes(route)) {
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        showAuthScreen();
        switchAuthView(route);
        return;
      }

      if (route.startsWith('reset-password')) {
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        showAuthScreen();
        switchAuthView('reset-password');
        return;
      }

      // Protected route requested while unauthenticated: redirect to login
      if (PROTECTED_ROUTES.includes(route)) {
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        showAuthScreen();
        switchAuthView('login');
        history.replaceState(null, '', '#login');
        return;
      }

      // Default fallback for unauthenticated: show public homepage
      history.replaceState(null, '', '#home');
      hideAuthScreen();
      const appContainer = document.querySelector('.app-container');
      if (appContainer) {
        appContainer.style.setProperty('display', 'none', 'important');
        appContainer.style.setProperty('pointer-events', 'none', 'important');
      }
      if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
        window.TrackX.landing.showLandingPage();
      }
    }
  }

  function navigateToRoute(targetHash) {
    const cleanHash = targetHash.startsWith('#') ? targetHash : '#' + targetHash;
    if ((window.location.hash || '') === cleanHash) {
      handleRouteProtection();
    } else {
      window.location.hash = cleanHash;
    }
  }

  function setupNavigationLinks() {
    // Navigate from Login to Sign Up
    const linkSignUp = document.getElementById('linkSignUp');
    if (linkSignUp) {
      linkSignUp.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#signup');
      });
    }

    // Navigate from Sign Up to Login
    const linkLoginFromSignup = document.getElementById('linkLoginFromSignup');
    if (linkLoginFromSignup) {
      linkLoginFromSignup.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#login');
      });
    }

    // "Forgot password?" link on Login
    const forgotLink = document.getElementById('linkForgotPassword');
    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#forgot-password');
      });
    }

    // Back to Login from Forgot Password
    const linkBackForgot = document.getElementById('linkBackToLoginFromForgot');
    if (linkBackForgot) {
      linkBackForgot.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#login');
      });
    }

    const btnBackAfterForgot = document.getElementById('btnBackToLoginAfterForgot');
    if (btnBackAfterForgot) {
      btnBackAfterForgot.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#login');
      });
    }

    // Back to Login from Reset Password
    const linkBackReset = document.getElementById('linkBackToLoginFromReset');
    if (linkBackReset) {
      linkBackReset.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#login');
      });
    }

    const btnBackAfterReset = document.getElementById('btnBackToLoginAfterReset');
    if (btnBackAfterReset) {
      btnBackAfterReset.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#login');
      });
    }

    const btnRequestNewLink = document.getElementById('btnRequestNewResetLink');
    if (btnRequestNewLink) {
      btnRequestNewLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#forgot-password');
      });
    }

    // Continue as Guest buttons
    const continueGuest = (e) => {
      e.preventDefault();
      history.replaceState(null, '', '#today');
      hideAuthScreen();
      if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
        window.TrackX.app.switchView('today');
      }
    };

    const btnGuestLogin = document.getElementById('btnContinueGuestLogin');
    if (btnGuestLogin) btnGuestLogin.addEventListener('click', continueGuest);

    const btnGuestSignup = document.getElementById('btnContinueGuestSignup');
    if (btnGuestSignup) btnGuestSignup.addEventListener('click', continueGuest);

    // Event delegation on authContainer for Back to Home links and brand logos
    const authContainer = document.getElementById('authContainer');
    if (authContainer) {
      authContainer.addEventListener('click', (e) => {
        const homeTarget = e.target.closest('.auth-back-to-home, .auth-home-link, .auth-brand-logo, [href="#home"]');
        if (homeTarget) {
          e.preventDefault();
          navigateToRoute('#home');
        }
      });
    }

    // Direct event listener fallbacks for back to home buttons
    const linkHomeLogin = document.getElementById('linkBackToHomeFromLogin');
    if (linkHomeLogin) {
      linkHomeLogin.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#home');
      });
    }

    const linkHomeSignup = document.getElementById('linkBackToHomeFromSignup');
    if (linkHomeSignup) {
      linkHomeSignup.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToRoute('#home');
      });
    }

    // Respond to browser back/forward buttons & URL hash changes with route guarding
    window.addEventListener('hashchange', () => {
      handleRouteProtection();
    });
  }

  // ==========================================
  // PASSWORD VISIBILITY TOGGLES
  // ==========================================

  function setupPasswordVisibilityToggles() {
    // 1. Login Password Toggle
    bindPasswordToggle('togglePasswordBtn', 'loginPassword');

    // 2. Signup Password Toggle
    bindPasswordToggle('toggleSignupPasswordBtn', 'signupPassword');

    // 3. Signup Confirm Password Toggle
    bindPasswordToggle('toggleSignupConfirmBtn', 'signupConfirmPassword');

    // 4. Reset Password Toggle
    bindPasswordToggle('toggleResetPasswordBtn', 'resetPassword');

    // 5. Reset Confirm Password Toggle
    bindPasswordToggle('toggleResetConfirmBtn', 'resetConfirmPassword');
  }

  function bindPasswordToggle(btnId, inputId) {
    const toggleBtn = document.getElementById(btnId);
    const passwordInput = document.getElementById(inputId);

    if (!toggleBtn || !passwordInput) return;

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPassword = passwordInput.getAttribute('type') === 'password';
      passwordInput.setAttribute('type', isPassword ? 'text' : 'password');

      const eyeOpen = toggleBtn.querySelector('.eye-open-icon');
      const eyeClosed = toggleBtn.querySelector('.eye-closed-icon');

      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
      }

      const label = isPassword ? 'Hide password' : 'Show password';
      toggleBtn.setAttribute('aria-label', label);
      toggleBtn.setAttribute('title', label);
      toggleBtn.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
    });
  }

  // ==========================================
  // PASSWORD REQUIREMENTS REAL-TIME CHECKER
  // ==========================================

  function checkPasswordCriteria(password) {
    return {
      hasLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password)
    };
  }

  function bindPasswordCriteriaChecker(passwordInputId, confirmInputId, reqIds, errorIds) {
    const passwordInput = document.getElementById(passwordInputId);
    const confirmInput = document.getElementById(confirmInputId);

    const reqLength = document.getElementById(reqIds.length);
    const reqUppercase = document.getElementById(reqIds.uppercase);
    const reqLowercase = document.getElementById(reqIds.lowercase);
    const reqNumber = document.getElementById(reqIds.number);

    if (!passwordInput) return;

    const updateUIItem = (element, isMet) => {
      if (!element) return;
      element.classList.toggle('met', isMet);
      const icon = element.querySelector('.password-req-icon');
      if (icon) {
        icon.textContent = isMet ? '✓' : '●';
      }
    };

    passwordInput.addEventListener('input', () => {
      const pwd = passwordInput.value;
      const criteria = checkPasswordCriteria(pwd);

      updateUIItem(reqLength, criteria.hasLength);
      updateUIItem(reqUppercase, criteria.hasUppercase);
      updateUIItem(reqLowercase, criteria.hasLowercase);
      updateUIItem(reqNumber, criteria.hasNumber);

      clearFieldError(passwordInputId, errorIds.passwordError);

      // Check confirm password matching in real-time if already entered
      if (confirmInput && confirmInput.value) {
        if (confirmInput.value !== pwd) {
          showFieldError(confirmInputId, errorIds.confirmError, 'Passwords do not match.');
        } else {
          clearFieldError(confirmInputId, errorIds.confirmError);
        }
      }
    });

    if (confirmInput) {
      confirmInput.addEventListener('input', () => {
        const pwd = passwordInput.value;
        const confirmPwd = confirmInput.value;

        if (confirmPwd && confirmPwd !== pwd) {
          showFieldError(confirmInputId, errorIds.confirmError, 'Passwords do not match.');
        } else {
          clearFieldError(confirmInputId, errorIds.confirmError);
        }
      });
    }
  }

  function setupPasswordRequirementsChecker() {
    // 1. Signup Password Requirements
    bindPasswordCriteriaChecker(
      'signupPassword',
      'signupConfirmPassword',
      {
        length: 'reqLength',
        uppercase: 'reqUppercase',
        lowercase: 'reqLowercase',
        number: 'reqNumber'
      },
      {
        passwordError: 'signupPasswordError',
        confirmError: 'signupConfirmError'
      }
    );

    // 2. Reset Password Requirements
    bindPasswordCriteriaChecker(
      'resetPassword',
      'resetConfirmPassword',
      {
        length: 'resetReqLength',
        uppercase: 'resetReqUppercase',
        lowercase: 'resetReqLowercase',
        number: 'resetReqNumber'
      },
      {
        passwordError: 'resetPasswordError',
        confirmError: 'resetConfirmError'
      }
    );
  }

  // ==========================================
  // FORGOT PASSWORD FORM HANDLING (Phase 4)
  // ==========================================

  function setupForgotPasswordFormEvents() {
    const form = document.getElementById('forgotPasswordForm');
    const emailInput = document.getElementById('forgotEmail');
    const submitBtn = document.getElementById('forgotSubmitBtn');
    const btnSpinner = document.getElementById('forgotBtnSpinner');
    const btnText = document.getElementById('forgotBtnText');
    const successCard = document.getElementById('forgotSuccessCard');

    if (!form || !emailInput) return;

    emailInput.addEventListener('input', () => {
      clearFieldError('forgotEmail', 'forgotEmailError');
      hideAuthAlert();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const email = emailInput.value.trim();
      clearFieldError('forgotEmail', 'forgotEmailError');
      hideAuthAlert();

      // 1. Validation
      if (!email) {
        showFieldError('forgotEmail', 'forgotEmailError', 'Please enter your email.');
        emailInput.focus();
        return;
      }

      if (!EMAIL_REGEX.test(email)) {
        showFieldError('forgotEmail', 'forgotEmailError', 'Please enter a valid email address.');
        emailInput.focus();
        return;
      }

      // 2. Dispatch Reset Email
      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Sending reset link...';

      try {
        const fb = window.TrackX.firebase;
        if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
          const auth = fb.getAuth();
          try {
            await auth.sendPasswordResetEmail(email);
          } catch (err) {
            // Security: do not reveal whether account exists (prevent user enumeration)
            if (err.code === 'auth/network-request-failed') {
              showAuthAlert('Network error. Please check your internet connection and try again.', 'error');
              return;
            }
          }
        } else {
          // Dev Preview
          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        // Show generic confirmation card (safe against account enumeration)
        form.style.display = 'none';
        if (successCard) successCard.style.display = 'block';

        if (window.TrackX.utils && window.TrackX.utils.showToast) {
          window.TrackX.utils.showToast({
            title: 'Email Sent',
            message: 'If an account exists, a reset link has been dispatched.',
            type: 'info',
            icon: '✉️'
          });
        }
      } catch (err) {
        console.error('[TrackX Forgot Password Error]:', err);
        showAuthAlert(translateFirebaseError(err.code || err.message, err), 'error');
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Send Reset Link';
      }
    });
  }

  // ==========================================
  // RESET PASSWORD FORM HANDLING (Phase 4)
  // ==========================================

  function setupResetPasswordFormEvents() {
    const form = document.getElementById('resetPasswordForm');
    const passwordInput = document.getElementById('resetPassword');
    const confirmInput = document.getElementById('resetConfirmPassword');
    const submitBtn = document.getElementById('resetSubmitBtn');
    const btnSpinner = document.getElementById('resetBtnSpinner');
    const btnText = document.getElementById('resetBtnText');
    const successCard = document.getElementById('resetSuccessCard');
    const invalidCard = document.getElementById('resetInvalidCard');

    if (!form || !passwordInput || !confirmInput) return;

    passwordInput.addEventListener('input', () => {
      clearFieldError('resetPassword', 'resetPasswordError');
      hideAuthAlert();
    });

    confirmInput.addEventListener('input', () => {
      clearFieldError('resetConfirmPassword', 'resetConfirmError');
      hideAuthAlert();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const password = passwordInput.value;
      const confirmPassword = confirmInput.value;

      clearFieldError('resetPassword', 'resetPasswordError');
      clearFieldError('resetConfirmPassword', 'resetConfirmError');
      hideAuthAlert();

      // 1. Validation: password requirements
      if (password.length < 8) {
        showFieldError('resetPassword', 'resetPasswordError', 'Password must contain at least 8 characters.');
        passwordInput.focus();
        return;
      }

      const criteria = checkPasswordCriteria(password);
      if (!criteria.hasUppercase || !criteria.hasLowercase || !criteria.hasNumber) {
        showFieldError('resetPassword', 'resetPasswordError', 'Password must meet all requirement criteria.');
        passwordInput.focus();
        return;
      }

      // 2. Validation: confirm password
      if (password !== confirmPassword) {
        showFieldError('resetConfirmPassword', 'resetConfirmError', 'Passwords do not match.');
        confirmInput.focus();
        return;
      }

      // 3. Submit password update
      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;
      if (btnSpinner) btnSpinner.style.display = 'inline-block';
      if (btnText) btnText.textContent = 'Updating password...';

      try {
        const fb = window.TrackX.firebase;
        if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured() && currentResetActionCode) {
          const auth = fb.getAuth();
          await auth.confirmPasswordReset(currentResetActionCode, password);
        } else {
          // Dev Preview
          await new Promise((resolve) => setTimeout(resolve, 800));
        }

        // Show Success Card
        form.style.display = 'none';
        if (successCard) successCard.style.display = 'block';

        if (window.TrackX.utils && window.TrackX.utils.showToast) {
          window.TrackX.utils.showToast({
            title: 'Password Updated',
            message: 'You can now sign in with your new password.',
            type: 'success',
            icon: '🔒'
          });
        }
      } catch (err) {
        console.error('[TrackX Reset Password Error]:', err);
        const code = err.code || err.message;
        if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
          form.style.display = 'none';
          if (invalidCard) {
            const desc = document.getElementById('resetInvalidDesc');
            if (desc) {
              desc.textContent = code === 'auth/expired-action-code'
                ? 'This password reset link has expired. Please request a new one.'
                : 'This password reset link is invalid or has already been used. Please request a new link.';
            }
            invalidCard.style.display = 'block';
          }
        } else {
          showAuthAlert(translateFirebaseError(code, err), 'error');
        }
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        if (btnSpinner) btnSpinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Update Password';
      }
    });
  }

  // ==========================================
  // LOGIN FORM HANDLING (Phase 1)
  // ==========================================

  function setupLoginFormEvents() {
    const form = document.getElementById('loginForm');
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    if (!form || !emailInput || !passwordInput) return;

    emailInput.addEventListener('input', () => {
      clearFieldError('loginEmail', 'emailError');
      hideAuthAlert();
    });

    passwordInput.addEventListener('input', () => {
      clearFieldError('loginPassword', 'passwordError');
      hideAuthAlert();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      clearFieldError('loginEmail', 'emailError');
      clearFieldError('loginPassword', 'passwordError');
      hideAuthAlert();

      // 1. Validation: Email
      if (!email || !EMAIL_REGEX.test(email)) {
        showFieldError('loginEmail', 'emailError', 'Please enter a valid email address.');
        emailInput.focus();
        return;
      }

      // 2. Validation: Empty Password
      if (!password) {
        showFieldError('loginPassword', 'passwordError', 'Please enter your password.');
        passwordInput.focus();
        return;
      }

      // 3. Initiate Login Workflow
      await handleLoginSubmission(email, password);
    });
  }

  async function handleLoginSubmission(email, password) {
    setLoadingState(true, 'login');

    try {
      const fb = window.TrackX.firebase;
      
      if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
        const auth = fb.getAuth();
        await auth.signInWithEmailAndPassword(email, password);
        // Successful login triggers onAuthStateChanged listener
      } else {
        await new Promise((resolve) => setTimeout(resolve, 800));

        showAuthAlert(
          'Email or password is incorrect. (Connect your project keys in js/firebase-config.js for live Firebase Auth)',
          'error'
        );
      }
    } catch (err) {
      console.error('[TrackX Auth Error]:', err);
      const friendlyMessage = translateFirebaseError(err.code || err.message);
      showAuthAlert(friendlyMessage, 'error');
    } finally {
      setLoadingState(false, 'login');
    }
  }

  // ==========================================
  // SIGN UP FORM HANDLING (Phase 2)
  // ==========================================

  function setupSignupFormEvents() {
    const form = document.getElementById('signupForm');
    const nameInput = document.getElementById('signupName');
    const emailInput = document.getElementById('signupEmail');
    const passwordInput = document.getElementById('signupPassword');
    const confirmInput = document.getElementById('signupConfirmPassword');

    if (!form || !nameInput || !emailInput || !passwordInput || !confirmInput) return;

    nameInput.addEventListener('input', () => {
      clearFieldError('signupName', 'signupNameError');
      hideAuthAlert();
    });

    emailInput.addEventListener('input', () => {
      clearFieldError('signupEmail', 'signupEmailError');
      hideAuthAlert();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const fullName = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmInput.value;

      clearFieldError('signupName', 'signupNameError');
      clearFieldError('signupEmail', 'signupEmailError');
      clearFieldError('signupPassword', 'signupPasswordError');
      clearFieldError('signupConfirmError', 'signupConfirmError');
      hideAuthAlert();

      // 1. Validation: Full name required
      if (!fullName) {
        showFieldError('signupName', 'signupNameError', 'Please enter your name.');
        nameInput.focus();
        return;
      }

      // 2. Validation: Email must be valid
      if (!email || !EMAIL_REGEX.test(email)) {
        showFieldError('signupEmail', 'signupEmailError', 'Please enter a valid email.');
        emailInput.focus();
        return;
      }

      // 3. Validation: Password requirements
      if (password.length < 8) {
        showFieldError('signupPassword', 'signupPasswordError', 'Password must contain at least 8 characters.');
        passwordInput.focus();
        return;
      }

      const criteria = checkPasswordCriteria(password);
      if (!criteria.hasUppercase || !criteria.hasLowercase || !criteria.hasNumber) {
        showFieldError('signupPassword', 'signupPasswordError', 'Password must meet all requirement criteria above.');
        passwordInput.focus();
        return;
      }

      // 4. Validation: Confirm password must match
      if (password !== confirmPassword) {
        showFieldError('signupConfirmPassword', 'signupConfirmError', 'Passwords do not match.');
        confirmInput.focus();
        return;
      }

      // 5. Initiate Account Creation Workflow
      await handleSignupSubmission(fullName, email, password);
    });
  }

  async function handleSignupSubmission(fullName, email, password) {
    setLoadingState(true, 'signup');

    try {
      const fb = window.TrackX.firebase;
      const nowISO = new Date().toISOString();

      if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
        const auth = fb.getAuth();
        showLoadingScreen();
        
        // 1. Create Firebase Authentication account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // 2. Update user profile with Display Name
        if (user.updateProfile) {
          try {
            await user.updateProfile({ displayName: fullName });
          } catch (pErr) {}
        }
        user.displayName = fullName;
        currentUser = user;

        // 3. Initialize user Firestore cloud account and state
        if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.initUserSync === 'function') {
          await window.TrackX.firestoreSync.initUserSync(user);
        }

        // 4. Update application state & user profile
        if (window.TrackX.state) {
          window.TrackX.state.updateProfile({
            name: fullName,
            email: email,
            avatar: '✨'
          });
        }

        // 5. Authenticate user & Redirect to TrackX Today view
        completeRegistrationAndRedirect(fullName);

      } else {
        // Firebase keys pending: simulate network latency & initialize local account
        await new Promise((resolve) => setTimeout(resolve, 900));

        const localUserData = {
          uid: 'usr_' + Date.now(),
          displayName: fullName,
          email: email,
          photoURL: null,
          createdAt: nowISO,
          lastLoginAt: nowISO
        };

        currentUser = localUserData;
        if (window.TrackX.state) {
          window.TrackX.state.updateProfile({
            name: fullName,
            avatar: '✨'
          });
        }

        if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.initUserSync === 'function') {
          await window.TrackX.firestoreSync.initUserSync(localUserData);
        }

        completeRegistrationAndRedirect(fullName);
      }
    } catch (err) {
      console.error('[TrackX Sign Up Error]:', err);
      hideLoadingScreen();
      const friendlyMessage = translateFirebaseError(err.code || err.message);
      showAuthAlert(friendlyMessage, 'error');
    } finally {
      setLoadingState(false, 'signup');
    }
  }

  function completeRegistrationAndRedirect(fullName) {
    authState = 'authenticated';
    isSubmitting = false;
    setGoogleLoadingState(false);
    hideLoadingScreen();
    hideAuthScreen();

    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.style.display = 'flex';
    }

    history.replaceState(null, '', '#today');

    if (currentUser) {
      syncUserProfile(currentUser);
    }

    // Switch view to Today
    if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
      window.TrackX.app.switchView('today');
    }

    // Welcoming celebration
    if (window.TrackX.utils && window.TrackX.utils.showToast) {
      window.TrackX.utils.showToast({
        title: 'Welcome to TrackX!',
        message: `Signed in successfully. Welcome, ${fullName}!`,
        type: 'success',
        icon: '🎉'
      });
      if (window.TrackX.utils.triggerConfetti) {
        window.TrackX.utils.triggerConfetti();
      }
    }
  }

  // ==========================================
  // GOOGLE AUTHENTICATION (Login & Sign Up)
  // ==========================================

  function setupGoogleAuth() {
    const googleButtons = document.querySelectorAll('.btn-google-trigger');

    googleButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        hideAuthAlert();
        setGoogleLoadingState(true);

        const fb = window.TrackX.firebase;
        const nowISO = new Date().toISOString();

        try {
          if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
            const auth = fb.getAuth();
            const provider = fb.getGoogleProvider();

            // 1. Open Google OAuth Popup
            if (window.TrackX.perf) window.TrackX.perf.start('Google authentication');
            const userCredential = await auth.signInWithPopup(provider);
            if (window.TrackX.perf) window.TrackX.perf.end('Google authentication');

            const user = userCredential.user;

            // 2. Firebase authentication completed.
            // onAuthStateChanged listener handles single-pass profile sync, reliable new-user detection in Firestore, clean initialization / hydration, and UI routing.
            currentUser = user;

          } else {
            // Simulated Google Sign-In for local development preview
            if (window.TrackX.perf) window.TrackX.perf.start('Google authentication');
            await new Promise((resolve) => setTimeout(resolve, 300));
            if (window.TrackX.perf) window.TrackX.perf.end('Google authentication');

            const previewUser = {
              uid: 'google_preview_' + Date.now().toString(36),
              displayName: 'New User (Google)',
              email: 'newuser@example.com',
              photoURL: null,
              createdAt: nowISO,
              lastLoginAt: nowISO
            };

            currentUser = previewUser;
            sessionStorage.setItem('trackx_auth_session', JSON.stringify(previewUser));
            syncUserProfile(previewUser);
            completeRegistrationAndRedirect(previewUser.displayName);

            if (window.TrackX.utils && window.TrackX.utils.showToast) {
              window.TrackX.utils.showToast({
                title: 'Development Preview',
                message: 'Signed in with preview Google account. Connect your keys in js/firebase-config.js for live OAuth.',
                type: 'info',
                icon: '⚡'
              });
            }
          }
        } catch (err) {
          console.error('[TrackX Google Auth Error]:', err);
          if (err.code === 'auth/operation-not-supported-in-this-environment' || window.location.protocol === 'file:') {
            console.info('[TrackX Google Auth]: File protocol detected. Activating local preview session.');
            const previewUser = {
              uid: 'google_preview_' + Date.now().toString(36),
              displayName: 'New User (Google)',
              email: 'newuser@example.com',
              photoURL: null,
              createdAt: nowISO,
              lastLoginAt: nowISO
            };
            currentUser = previewUser;
            sessionStorage.setItem('trackx_auth_session', JSON.stringify(previewUser));
            syncUserProfile(previewUser);
            completeRegistrationAndRedirect(previewUser.displayName);
            if (window.TrackX.utils && window.TrackX.utils.showToast) {
              window.TrackX.utils.showToast({
                title: 'Google Sign-In (Local Preview)',
                message: 'Signed in with preview Google account. For live OAuth, run TrackX on http://localhost:5500.',
                type: 'info',
                icon: '⚡'
              });
            }
            return;
          }
          const friendlyMessage = translateFirebaseError(err.code || err.message, err);
          showAuthAlert(friendlyMessage, 'error');
        } finally {
          setGoogleLoadingState(false);
        }
      });
    });
  }

  function setGoogleLoadingState(loading) {
    isSubmitting = loading;
    const googleButtons = document.querySelectorAll('.btn-google-trigger');
    googleButtons.forEach((btn) => {
      btn.disabled = loading;
      btn.classList.toggle('is-loading', loading);
      const spinner = btn.querySelector('.btn-google-spinner');
      const textEl = btn.querySelector('.btn-google-text');
      if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
      if (textEl) textEl.textContent = loading ? 'Signing in with Google...' : 'Continue with Google';
    });

    // Also disable form submit buttons to prevent duplicate submission
    const loginBtn = document.getElementById('loginSubmitBtn');
    const signupBtn = document.getElementById('signupSubmitBtn');
    if (loginBtn) loginBtn.disabled = loading;
    if (signupBtn) signupBtn.disabled = loading;
  }

  function getUserInitials(name) {
    if (!name || typeof name !== 'string') return 'TX';
    const clean = name.trim();
    if (!clean) return 'TX';

    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts[0].length >= 2) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return parts[0].toUpperCase();
  }

  function syncUserProfile(user) {
    if (!user) return;
    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'TrackX User');
    const email = user.email || '';
    const photoURL = user.photoURL || null;
    const initials = getUserInitials(displayName || email);
    const uid = user.uid || '';
    const targetAvatar = photoURL || initials;

    // Update global TrackX profile state ONLY if actual profile information changed
    const existingUser = (window.TrackX.state && window.TrackX.state.data && window.TrackX.state.data.user) || {};
    if (existingUser.name !== displayName || existingUser.avatar !== targetAvatar || existingUser.email !== email || existingUser.uid !== uid) {
      if (window.TrackX.state && typeof window.TrackX.state.updateProfile === 'function') {
        window.TrackX.state.updateProfile({
          name: displayName,
          avatar: targetAvatar,
          email: email,
          uid: uid
        });
      }
    }

    // Update sidebar user card
    const sidebarName = document.getElementById('sidebarUserName');
    if (sidebarName) sidebarName.textContent = displayName;

    const sidebarEmail = document.getElementById('sidebarUserEmail');
    if (sidebarEmail) {
      sidebarEmail.textContent = email;
      sidebarEmail.style.display = email ? 'block' : 'none';
    }

    const sidebarAvatar = document.getElementById('sidebarUserAvatar');
    if (sidebarAvatar) {
      if (photoURL) {
        sidebarAvatar.innerHTML = `<img src="${photoURL}" alt="${displayName}" referrerpolicy="no-referrer">`;
      } else {
        sidebarAvatar.innerHTML = `<div class="user-initials">${initials}</div>`;
      }
    }

    // Show sidebar logout button when authenticated
    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.style.display = 'flex';
    }

    // Update top bar profile avatar
    const topAvatar = document.getElementById('topProfileAvatar');
    if (topAvatar) {
      if (photoURL) {
        topAvatar.innerHTML = `<img src="${photoURL}" alt="${displayName}" referrerpolicy="no-referrer">`;
      } else {
        topAvatar.innerHTML = `<div class="user-initials">${initials}</div>`;
      }
    }

    // Update settings account email and user name if rendered
    const settingsAccountEmail = document.getElementById('settingsAccountEmail');
    if (settingsAccountEmail && email) {
      settingsAccountEmail.textContent = email;
    }
    const settingsUserName = document.getElementById('settingsUserName');
    if (settingsUserName && !settingsUserName.dataset.userModified) {
      settingsUserName.value = displayName;
    }
  }

  // ==========================================
  // SIGN OUT & SESSION MANAGEMENT
  // ==========================================

  function setupLogoutButtons() {
    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signOutUser();
      });
    }

    // Event delegation for settings or other logout buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#settingsLogoutBtn');
      if (btn) {
        e.preventDefault();
        signOutUser();
      }
    });
  }

  async function signOutUser() {
    try {
      showLoadingScreen();
      const fb = window.TrackX.firebase;
      if (fb && typeof fb.getAuth === 'function' && fb.getAuth()) {
        await fb.getAuth().signOut();
      }
    } catch (err) {
      console.warn('[TrackX Logout Warning]:', err);
    } finally {
      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.cleanup === 'function') {
        window.TrackX.firestoreSync.cleanup();
      }

      // Immediately wipe in-memory state so no user data remains in RAM across accounts
      if (window.TrackX.state && typeof window.TrackX.state.resetToCleanState === 'function') {
        window.TrackX.state.resetToCleanState({ uid: '' });
      }

      currentUser = null;
      authState = 'unauthenticated';
      sessionStorage.removeItem('trackx_auth_session');

      if (window.TrackX.storage && typeof window.TrackX.storage.setCurrentUserId === 'function') {
        window.TrackX.storage.setCurrentUserId(null);
      }

      // Hide sidebar logout button when unauthenticated
      const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
      if (sidebarLogoutBtn) {
        sidebarLogoutBtn.style.display = 'none';
      }

      hideLoadingScreen();
      hideAuthScreen();
      const appContainer = document.querySelector('.app-container');
      if (appContainer) {
        appContainer.style.setProperty('display', 'none', 'important');
      }
      history.replaceState(null, '', window.location.pathname);
      if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
        window.TrackX.landing.showLandingPage();
      }

      // Clear login inputs
      const loginEmail = document.getElementById('loginEmail');
      const loginPassword = document.getElementById('loginPassword');
      if (loginEmail) loginEmail.value = '';
      if (loginPassword) loginPassword.value = '';

      if (window.TrackX.utils && window.TrackX.utils.showToast) {
        window.TrackX.utils.showToast({
          title: 'Signed Out',
          message: 'You have been safely logged out of TrackX.',
          type: 'info',
          icon: '👋'
        });
      }
    }
  }

  // ==========================================
  // INITIAL AUTH STATE RESOLUTION
  // ==========================================

  function checkInitialAuthState() {
    // 1. Check if Firebase URL query parameters indicate a password reset action
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    if (mode === 'resetPassword' && oobCode) {
      currentResetActionCode = oobCode;
      authState = 'unauthenticated';
      hideLoadingScreen();
      showAuthScreen();
      switchAuthView('reset-password');
      verifyResetActionCode(oobCode);
      return;
    }

    const fb = window.TrackX.firebase;
    if (fb && typeof fb.getAuth === 'function' && fb.getAuth()) {
      if (!authUnsubscribe) {
        authUnsubscribe = fb.getAuth().onAuthStateChanged(async (user) => {
          if (window.TrackX.perf) window.TrackX.perf.start('onAuthStateChanged');
          if (user) {
            const isSameUser = currentUser && currentUser.uid === user.uid && authState === 'authenticated';
            currentUser = user;
            authState = 'authenticated';
            isSubmitting = false;
            setGoogleLoadingState(false);
            syncUserProfile(user);

            // Keep loading screen active while loading Firestore data
            showLoadingScreen();

            // Set user-scoped storage key
            if (window.TrackX.storage && typeof window.TrackX.storage.setCurrentUserId === 'function') {
              window.TrackX.storage.setCurrentUserId(user.uid);
            }

            if (!isSameUser) {
              if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.initUserSync === 'function') {
                await window.TrackX.firestoreSync.initUserSync(user);
              }

              // Show sidebar logout button when authenticated
              const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
              if (sidebarLogoutBtn) {
                sidebarLogoutBtn.style.display = 'flex';
              }

              // Route to intended view or default to #today if on auth or landing routes
              const rawHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
              const targetRoute = rawHash.split('?')[0];

              hideLoadingScreen();
              if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
                window.TrackX.landing.hideLandingPage();
              }
              hideAuthScreen();

              if (!targetRoute || AUTH_ROUTES.includes(targetRoute) || isLandingRoute(targetRoute)) {
                history.replaceState(null, '', '#today');
                if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
                  window.TrackX.app.switchView('today');
                }
              } else if (PROTECTED_ROUTES.includes(targetRoute)) {
                if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
                  window.TrackX.app.switchView(targetRoute);
                }
              }
            } else {
              hideLoadingScreen();
              hideAuthScreen();
            }
            if (window.TrackX.perf) window.TrackX.perf.end('onAuthStateChanged');
          } else {
            // Unsubscribe active Firestore listeners on logout
            if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.cleanup === 'function') {
              window.TrackX.firestoreSync.cleanup();
            }

            // Immediately wipe in-memory state so previous user data never flashes!
            if (window.TrackX.state && typeof window.TrackX.state.resetToCleanState === 'function') {
              window.TrackX.state.resetToCleanState({ uid: '' });
            }

            if (window.TrackX.storage && typeof window.TrackX.storage.setCurrentUserId === 'function') {
              window.TrackX.storage.setCurrentUserId(null);
            }

            // Hide sidebar logout button when unauthenticated
            const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
            if (sidebarLogoutBtn) {
              sidebarLogoutBtn.style.display = 'none';
            }

            // If in preview mode, check dev session
            const savedSession = sessionStorage.getItem('trackx_auth_session');
            if (savedSession && (!fb.isConfigured || !fb.isConfigured())) {
              try {
                const previewUser = JSON.parse(savedSession);
                currentUser = previewUser;
                authState = 'authenticated';
                syncUserProfile(previewUser);

                if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.initUserSync === 'function') {
                  await window.TrackX.firestoreSync.initUserSync(previewUser);
                }

                hideLoadingScreen();
                hideAuthScreen();

                const rawHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
                const targetRoute = rawHash.split('?')[0];
                if (!targetRoute || AUTH_ROUTES.includes(targetRoute)) {
                  history.replaceState(null, '', '#today');
                  if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
                    window.TrackX.app.switchView('today');
                  }
                }
                return;
              } catch (e) {}
            }

            currentUser = null;
            authState = 'unauthenticated';
            hideLoadingScreen();

            const rawHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
            const targetRoute = rawHash.split('?')[0];

            if (AUTH_ROUTES.includes(targetRoute)) {
              if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
                window.TrackX.landing.hideLandingPage();
              }
              showAuthScreen();
              switchAuthView(targetRoute);
            } else if (targetRoute.startsWith('reset-password')) {
              if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
                window.TrackX.landing.hideLandingPage();
              }
              showAuthScreen();
              switchAuthView('reset-password');
            } else if (isLandingRoute(targetRoute)) {
              hideAuthScreen();
              const appContainer = document.querySelector('.app-container');
              if (appContainer) {
                appContainer.style.setProperty('display', 'none', 'important');
              }
              if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
                window.TrackX.landing.showLandingPage();
              }
            } else if (PROTECTED_ROUTES.includes(targetRoute)) {
              if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
                window.TrackX.landing.hideLandingPage();
              }
              showAuthScreen();
              switchAuthView('login');
              history.replaceState(null, '', '#login');
            } else {
              hideAuthScreen();
              if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
                window.TrackX.landing.showLandingPage();
              }
            }
          }
        });
      }
    } else {
      // Fallback dev preview session check
      const savedSession = sessionStorage.getItem('trackx_auth_session');
      if (savedSession) {
        try {
          const previewUser = JSON.parse(savedSession);
          currentUser = previewUser;
          authState = 'authenticated';
          syncUserProfile(previewUser);

          if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.initUserSync === 'function') {
            window.TrackX.firestoreSync.initUserSync(previewUser);
          }

          hideLoadingScreen();
          hideAuthScreen();

          const rawHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
          const targetRoute = rawHash.split('?')[0];
          if (!targetRoute || AUTH_ROUTES.includes(targetRoute) || isLandingRoute(targetRoute)) {
            history.replaceState(null, '', '#today');
            if (window.TrackX.app && typeof window.TrackX.app.switchView === 'function') {
              window.TrackX.app.switchView('today');
            }
          }
          return;
        } catch (e) {}
      }

      currentUser = null;
      authState = 'unauthenticated';
      hideLoadingScreen();

      const rawHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
      const targetRoute = rawHash.split('?')[0];
      if (AUTH_ROUTES.includes(targetRoute)) {
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        showAuthScreen();
        switchAuthView(targetRoute);
      } else if (targetRoute.startsWith('reset-password')) {
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        showAuthScreen();
        switchAuthView('reset-password');
      } else if (isLandingRoute(targetRoute)) {
        hideAuthScreen();
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
          appContainer.style.setProperty('display', 'none', 'important');
        }
        if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
          window.TrackX.landing.showLandingPage();
        }
      } else if (PROTECTED_ROUTES.includes(targetRoute)) {
        if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
          window.TrackX.landing.hideLandingPage();
        }
        showAuthScreen();
        switchAuthView('login');
        history.replaceState(null, '', '#login');
      } else {
        hideAuthScreen();
        if (window.TrackX.landing && typeof window.TrackX.landing.showLandingPage === 'function') {
          window.TrackX.landing.showLandingPage();
        }
      }
    }
  }

  async function verifyResetActionCode(code) {
    const fb = window.TrackX.firebase;
    if (fb && typeof fb.isConfigured === 'function' && fb.isConfigured()) {
      try {
        const auth = fb.getAuth();
        await auth.verifyPasswordResetCode(code);
      } catch (err) {
        console.warn('[TrackX Verify Reset Code Notice]:', err);
        const form = document.getElementById('resetPasswordForm');
        const invalidCard = document.getElementById('resetInvalidCard');
        const desc = document.getElementById('resetInvalidDesc');
        if (form) form.style.display = 'none';
        if (invalidCard) {
          if (desc) {
            desc.textContent = err.code === 'auth/expired-action-code'
              ? 'This password reset link has expired. Please request a new one.'
              : 'This password reset link is invalid or has already been used. Please request a new link.';
          }
          invalidCard.style.display = 'block';
        }
      }
    }
  }

  function showAuthScreen() {
    if (window.TrackX.landing && typeof window.TrackX.landing.hideLandingPage === 'function') {
      window.TrackX.landing.hideLandingPage();
    }
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.querySelector('.app-container');

    if (authContainer) {
      authContainer.classList.remove('hidden');
      authContainer.style.setProperty('display', 'flex', 'important');
      authContainer.style.setProperty('pointer-events', 'auto', 'important');
      authContainer.style.setProperty('visibility', 'visible', 'important');
      authContainer.style.setProperty('z-index', '9999', 'important');
    }
    if (appContainer) {
      appContainer.style.setProperty('display', 'none', 'important');
      appContainer.style.setProperty('pointer-events', 'none', 'important');
      appContainer.style.setProperty('visibility', 'hidden', 'important');
      appContainer.style.setProperty('z-index', '-1', 'important');
    }
  }

  function hideAuthScreen() {
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.querySelector('.app-container');

    if (authContainer) {
      authContainer.classList.add('hidden');
      authContainer.style.setProperty('display', 'none', 'important');
      authContainer.style.setProperty('pointer-events', 'none', 'important');
      authContainer.style.setProperty('visibility', 'hidden', 'important');
      authContainer.style.setProperty('z-index', '-1', 'important');
    }
    if (appContainer) {
      // Only display appContainer if landing page is not currently visible AND user is authenticated
      const isLanding = window.TrackX.landing && typeof window.TrackX.landing.isLandingVisible === 'function' && window.TrackX.landing.isLandingVisible();
      if (!isLanding && authState === 'authenticated') {
        appContainer.style.setProperty('display', 'flex', 'important');
        appContainer.style.setProperty('pointer-events', 'auto', 'important');
        appContainer.style.setProperty('visibility', 'visible', 'important');
        appContainer.style.setProperty('z-index', '1', 'important');
      } else {
        appContainer.style.setProperty('display', 'none', 'important');
        appContainer.style.setProperty('pointer-events', 'none', 'important');
      }
    }
  }

  // ==========================================
  // UI HELPERS (Loading, Errors & Alerts)
  // ==========================================

  function setLoadingState(loading, formType = 'login') {
    isSubmitting = loading;

    if (formType === 'signup') {
      const submitBtn = document.getElementById('signupSubmitBtn');
      const btnSpinner = document.getElementById('signupBtnSpinner');
      const btnText = document.getElementById('signupBtnText');
      const nameInput = document.getElementById('signupName');
      const emailInput = document.getElementById('signupEmail');
      const passwordInput = document.getElementById('signupPassword');
      const confirmInput = document.getElementById('signupConfirmPassword');

      if (submitBtn) submitBtn.disabled = loading;
      if (nameInput) nameInput.disabled = loading;
      if (emailInput) emailInput.disabled = loading;
      if (passwordInput) passwordInput.disabled = loading;
      if (confirmInput) confirmInput.disabled = loading;

      if (btnSpinner) btnSpinner.style.display = loading ? 'inline-block' : 'none';
      if (btnText) btnText.textContent = loading ? 'Creating account...' : 'Create Account';
    } else {
      const submitBtn = document.getElementById('loginSubmitBtn');
      const btnSpinner = document.getElementById('loginBtnSpinner');
      const btnText = document.getElementById('loginBtnText');
      const emailInput = document.getElementById('loginEmail');
      const passwordInput = document.getElementById('loginPassword');

      if (submitBtn) submitBtn.disabled = loading;
      if (emailInput) emailInput.disabled = loading;
      if (passwordInput) passwordInput.disabled = loading;

      if (btnSpinner) btnSpinner.style.display = loading ? 'inline-block' : 'none';
      if (btnText) btnText.textContent = loading ? 'Signing in...' : 'Log In';
    }

    const googleButtons = document.querySelectorAll('.btn-google-trigger');
    googleButtons.forEach((btn) => {
      btn.disabled = loading;
    });
  }

  function showFieldError(inputId, errorElId, message) {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(errorElId);

    if (input) {
      input.classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorElId);
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  function clearFieldError(inputId, errorElId) {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(errorElId);

    if (input) {
      input.classList.remove('has-error');
      input.setAttribute('aria-invalid', 'false');
      input.removeAttribute('aria-describedby');
    }
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  function showAuthAlert(message, type = 'error') {
    const alertBox = document.getElementById('authAlert');
    const alertText = document.getElementById('authAlertText');

    if (!alertBox || !alertText) return;

    alertBox.className = `auth-alert ${type}`;
    alertText.textContent = message;
    alertBox.style.display = 'flex';
  }

  function hideAuthAlert() {
    const alertBox = document.getElementById('authAlert');
    if (alertBox) alertBox.style.display = 'none';
  }

  function translateFirebaseError(code, err) {
    switch (code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Google sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Please allow popups or try again.';
      case 'auth/account-exists-with-different-credential':
        return 'An account already exists with this email using a different sign-in method. Please log in with your email and password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password is too weak. Please choose a stronger password.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email or password is incorrect.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Please contact support.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again in a few minutes.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your internet connection.';
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not enabled in your Firebase Console. Please enable Google provider under Authentication -> Sign-in method.';
      case 'auth/operation-not-supported-in-this-environment':
        return 'Google sign-in popups cannot run directly from a local file (file://). Please serve TrackX using a local server (e.g. Live Server or http://localhost:5500).';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized in Firebase Console. Go to Authentication -> Settings -> Authorized Domains and add your domain.';
      case 'auth/expired-action-code':
        return 'This password reset link has expired. Please request a new one.';
      case 'auth/invalid-action-code':
        return 'This password reset link is invalid or has already been used. Please request a new link.';
      case 'auth/timeout':
        return 'Google sign-in timed out. Please try again.';
      default:
        return 'An error occurred during authentication. Please try again.';
    }
  }

  window.TrackX.auth = {
    initAuth,
    showAuthScreen,
    hideAuthScreen,
    showLoadingScreen,
    hideLoadingScreen,
    switchAuthView,
    signOutUser,
    syncUserProfile,
    getUserInitials,
    handleRouteProtection,
    setGoogleLoadingState,
    getAuthState: () => authState,
    getCurrentUser: () => currentUser,
    isAuthenticated: () => authState === 'authenticated' && currentUser !== null,
    // Helper to allow developers to preview authenticated dashboard anytime
    bypassAuthForPreview: () => {
      authState = 'authenticated';
      currentUser = currentUser || {
        uid: 'preview_user_dev',
        displayName: 'TrackX Explorer',
        email: 'explorer@example.com',
        photoURL: null
      };
      sessionStorage.setItem('trackx_auth_session', JSON.stringify(currentUser));
      syncUserProfile(currentUser);
      if (window.TrackX.firestoreSync && typeof window.TrackX.firestoreSync.initUserSync === 'function') {
        window.TrackX.firestoreSync.initUserSync(currentUser);
      }
      hideLoadingScreen();
      hideAuthScreen();
      if (window.TrackX.utils && window.TrackX.utils.showToast) {
        window.TrackX.utils.showToast({
          title: 'Developer Preview',
          message: 'Previewing authenticated TrackX dashboard',
          type: 'info',
          icon: '🔓'
        });
      }
    }
  };

})(window);
