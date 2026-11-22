/*
  SFX Composer — Professional License Activation UI (Direct Authentication)
  Matches SFX Composer dark design system (#0e0e11, blue accent #0a84ff).
  Features:
  - Mandatory First-Launch Activation Gate
  - Direct server-side license verification (Registered Email + License Key)
  - Seamless instant unlock on successful authentication
  - Settings -> License & Activation section injection
*/
(function () {
  'use strict';

  var gateOverlay = null;
  var isKeyVisible = false;

  var ICONS = {
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5L11 9l-1.5-1.5L8 9 3 14a5 5 0 007 7l5-5 1.5 1.5L18 15l1.5 1.5L21 15l-1.5-1.5L21 12l-1.5-1.5L21 9l-1.5-1.5L21 6l-1.5-1.5L21 3z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
  };

  function createGateModal() {
    if (gateOverlay) return gateOverlay;

    gateOverlay = document.createElement('div');
    gateOverlay.id = 'sfx-license-overlay';
    gateOverlay.setAttribute('role', 'dialog');
    gateOverlay.setAttribute('aria-modal', 'true');

    gateOverlay.innerHTML = [
      '<div class="sfx-lic__card">',
      '  <!-- Header -->',
      '  <div class="sfx-lic__header">',
      '    <button type="button" class="sfx-lic__close-btn" id="sfx-lic-close" title="Close">',
      '      ' + ICONS.close,
      '    </button>',
      '    <div class="sfx-lic__logo" id="sfx-lic-card-logo">',
      '      ' + ICONS.shield,
      '    </div>',
      '    <h2 class="sfx-lic__title" id="sfx-lic-card-title">Activate SFX Composer</h2>',
      '    <p class="sfx-lic__subtitle" id="sfx-lic-card-subtitle">Enter your registered email and license key to activate.</p>',
      '  </div>',
      '',
      '  <!-- Body -->',
      '  <div class="sfx-lic__body">',
      '    <!-- Status Banner -->',
      '    <div class="sfx-lic__banner" id="sfx-lic-banner">',
      '      <div class="sfx-lic__banner-icon" id="sfx-lic-banner-icon"></div>',
      '      <div class="sfx-lic__banner-content">',
      '        <div class="sfx-lic__banner-title" id="sfx-lic-banner-title"></div>',
      '        <div class="sfx-lic__banner-msg" id="sfx-lic-banner-msg"></div>',
      '      </div>',
      '    </div>',
      '',
      '    <!-- Direct Authentication Form -->',
      '    <form id="sfx-lic-form" autocomplete="off" onsubmit="return false;">',
      '      <div class="sfx-lic__form-group">',
      '        <label class="sfx-lic__label" for="sfx-lic-email">Registered Email</label>',
      '        <div class="sfx-lic__input-wrap">',
      '          <input type="email" id="sfx-lic-email" class="sfx-lic__input" placeholder="name@example.com" required spellcheck="false" />',
      '        </div>',
      '      </div>',
      '      <div class="sfx-lic__form-group" style="margin-top: 14px;">',
      '        <label class="sfx-lic__label" for="sfx-lic-key">License Key</label>',
      '        <div class="sfx-lic__input-wrap">',
      '          <input type="password" id="sfx-lic-key" class="sfx-lic__input sfx-lic__input--key" placeholder="SFX-XXXX-XXXX-XXXX-XXXX" required spellcheck="false" />',
      '          <button type="button" class="sfx-lic__eye-btn" id="sfx-lic-eye" title="Show or hide key">',
      '            ' + ICONS.eye,
      '          </button>',
      '        </div>',
      '      </div>',
      '      <button type="submit" class="sfx-lic__btn sfx-lic__btn--primary" id="sfx-lic-btn" style="width: 100%; margin-top: 20px;">',
      '        <span id="sfx-lic-btn-text">Verify & Activate</span>',
      '      </button>',
      '    </form>',
      '  </div>',
      '',
      '  <!-- Footer -->',
      '  <div class="sfx-lic__footer">',
      '    <a class="sfx-lic__link" href="https://sfxcomposer.com/pricing" target="_blank" rel="noopener">Purchase License</a>',
      '    <a class="sfx-lic__link" href="mailto:sfxcomposer@gmail.com">Contact Support</a>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(gateOverlay);

    setupGateListeners();
    return gateOverlay;
  }

  function setupGateListeners() {
    var form = gateOverlay.querySelector('#sfx-lic-form');
    var keyInput = gateOverlay.querySelector('#sfx-lic-key');
    var emailInput = gateOverlay.querySelector('#sfx-lic-email');
    var eyeBtn = gateOverlay.querySelector('#sfx-lic-eye');
    var closeBtn = gateOverlay.querySelector('#sfx-lic-close');
    var btn = gateOverlay.querySelector('#sfx-lic-btn');

    // Close button (only functional when not in mandatory first-launch gate mode)
    closeBtn.addEventListener('click', function () {
      if (!gateOverlay.classList.contains('is-gate')) {
        gateOverlay.classList.remove('is-open');
      }
    });

    // Block ESC key in gate mode
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && gateOverlay.classList.contains('is-gate')) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Eye toggle
    eyeBtn.addEventListener('click', function () {
      isKeyVisible = !isKeyVisible;
      keyInput.type = isKeyVisible ? 'text' : 'password';
      eyeBtn.innerHTML = isKeyVisible ? ICONS.eyeOff : ICONS.eye;
    });

    // Auto-format license key as user types
    keyInput.addEventListener('input', function () {
      var val = keyInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val.indexOf('SFX') === 0) val = val.substring(3);
      var parts = ['SFX'];
      for (var i = 0; i < val.length && parts.length < 5; i += 4) {
        parts.push(val.substring(i, i + 4));
      }
      keyInput.value = parts.join('-');
    });

    // Direct License Verification & Activation Submit Handler
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = emailInput.value.trim().toLowerCase();
      var key = keyInput.value.trim().toUpperCase();

      if (!email || !key) {
        showBanner('warning', 'Missing Details', 'Please enter your registered email and license key.');
        return;
      }

      setBtnLoading(btn, '#sfx-lic-btn-text', true, 'Verifying & Activating...');
      showBanner('info', 'Verifying License...', 'Connecting to server to validate credentials...');

      try {
        var res = await window.__sfxLicense.activate(email, key);
        setBtnLoading(btn, '#sfx-lic-btn-text', false, 'Verify & Activate');

        if (res.ok) {
          showBanner('success', 'Activation Successful! Welcome to SFX Composer.', 'License validated. Unlocking full workstation access...');
          setTimeout(function () {
            unlockPlugin();
          }, 800);
        } else {
          handleActivationError(res.code, res.message);
        }
      } catch (err) {
        setBtnLoading(btn, '#sfx-lic-btn-text', false, 'Verify & Activate');
        showBanner('error', 'Connection Error', 'Unable to reach the activation server. Please check your internet connection.');
      }
    });
  }

  function handleActivationError(code, message) {
    switch (code) {
      case 'INVALID_KEY':
        showBanner('error', 'Invalid License Key', 'The license key provided is invalid. Please check for typos.');
        break;
      case 'EMAIL_MISMATCH':
        showBanner('error', 'Email Mismatch', 'The email provided does not match the registered license owner.');
        break;
      case 'ALREADY_ACTIVATED':
        showBanner('error', 'Device Limit Reached (1/1)', 'This license is already active on another workstation. Please deactivate it on that machine first, or contact support for a device reset.');
        break;
      case 'REVOKED':
        showBanner('error', 'License Revoked', 'This license has been revoked. Contact support if you believe this is in error.');
        break;
      case 'EXPIRED':
        showBanner('error', 'License Expired', 'This license has expired. Please renew your license.');
        break;
      case 'SERVER_UNAVAILABLE':
        showBanner('error', 'Server Unavailable', 'Unable to reach the activation server. Please check your internet connection.');
        break;
      default:
        showBanner('error', 'Activation Failed', message || 'An error occurred during activation. Please verify your credentials.');
        break;
    }
  }

  function setBtnLoading(btn, textSelector, loading, label) {
    var textSpan = gateOverlay.querySelector(textSelector);
    btn.disabled = loading;
    if (loading) {
      textSpan.innerHTML = '<span class="sfx-lic__spinner"></span> ' + label;
    } else {
      textSpan.textContent = label;
    }
  }

  function showBanner(type, title, msg) {
    var banner = gateOverlay.querySelector('#sfx-lic-banner');
    var icon = gateOverlay.querySelector('#sfx-lic-banner-icon');
    var titleEl = gateOverlay.querySelector('#sfx-lic-banner-title');
    var msgEl = gateOverlay.querySelector('#sfx-lic-banner-msg');

    banner.className = 'sfx-lic__banner is-visible sfx-lic__banner--' + type;
    icon.innerHTML = (type === 'success') ? ICONS.check : (type === 'error') ? ICONS.alert : ICONS.info;
    titleEl.textContent = title;
    msgEl.textContent = msg;
  }

  function hideBanner() {
    var banner = gateOverlay.querySelector('#sfx-lic-banner');
    if (banner) {
      banner.className = 'sfx-lic__banner';
      banner.style.display = 'none';
    }
  }

  // Mandatory Gate Controls
  function lockPluginWithGate(reasonMessage) {
    createGateModal();
    gateOverlay.classList.add('is-gate', 'is-open');
    document.body.classList.add('sfx-gated');
    if (reasonMessage) {
      showBanner('warning', 'Activation Required', reasonMessage);
    }
  }

  function unlockPlugin() {
    if (gateOverlay) {
      gateOverlay.classList.remove('is-gate', 'is-open');
    }
    document.body.classList.remove('sfx-gated');
    updateSettingsSection();
  }

  // ── Settings -> License & Activation Section Injection ──
  function injectSettingsSection(settingsBody) {
    if (!settingsBody || settingsBody.querySelector('.sfx-license-section')) return;

    var status = window.__sfxLicense ? window.__sfxLicense.getStatus() : { isActivated: false };

    var section = document.createElement('section');
    section.className = 'sfx-section sfx-license-section';

    var lastVerFormatted = 'Today';
    if (status.lastVerifiedAt) {
      try {
        var d = new Date(status.lastVerifiedAt);
        lastVerFormatted = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        lastVerFormatted = status.lastVerifiedAt;
      }
    }

    var badgeClass = status.isActivated ? 'sfx-license-badge--active' : 'sfx-license-badge--inactive';
    var badgeText = status.isActivated ? (ICONS.check + ' Active') : 'Inactive';

    section.innerHTML = [
      '<h3 class="sfx-section__title" style="margin-bottom: 12px;">License & Activation</h3>',
      '<div class="sfx-license-card">',
      '  <div class="sfx-license-row">',
      '    <span class="sfx-license-label">Activation Status</span>',
      '    <span class="sfx-license-badge ' + badgeClass + '" id="sfx-set-badge">' + badgeText + '</span>',
      '  </div>',
      '  <div class="sfx-license-row">',
      '    <span class="sfx-license-label">Registered Email</span>',
      '    <span class="sfx-license-val" id="sfx-set-email">' + (escapeHtml(status.email) || '—') + '</span>',
      '  </div>',
      '  <div class="sfx-license-row">',
      '    <span class="sfx-license-label">License Tier</span>',
      '    <span class="sfx-license-val">SFX Composer Pro (Studio)</span>',
      '  </div>',
      '  <div class="sfx-license-row">',
      '    <span class="sfx-license-label">Active Workstation</span>',
      '    <span class="sfx-license-val" id="sfx-set-device">' + escapeHtml(status.deviceName) + ' (Active 1/1)</span>',
      '  </div>',
      '  <div class="sfx-license-row">',
      '    <span class="sfx-license-label">Last Verified</span>',
      '    <span class="sfx-license-val" id="sfx-set-verified">' + lastVerFormatted + '</span>',
      '  </div>',
      '</div>',
      '<div style="display: flex; gap: 10px; margin-top: 14px;">',
      '  <button type="button" class="sfx-lic__btn sfx-lic__btn--danger" id="sfx-btn-deactivate" style="height: 32px; font-size: 11px;">',
      '    Deactivate This Device',
      '  </button>',
      '</div>'
    ].join('\n');

    settingsBody.appendChild(section);

    // Wire Deactivate button
    var deactBtn = section.querySelector('#sfx-btn-deactivate');
    if (deactBtn) {
      deactBtn.addEventListener('click', async function () {
        var ok = confirm('Are you sure you want to deactivate SFX Composer on this machine? You will need your license key to activate again.');
        if (!ok) return;

        deactBtn.disabled = true;
        deactBtn.textContent = 'Deactivating...';

        await window.__sfxLicense.deactivate();

        // Lock plugin and display gate
        lockPluginWithGate('This workstation was deactivated. Enter your credentials to reactivate.');
      });
    }
  }

  function updateSettingsSection() {
    var settingsBody = document.querySelector('.sfx-settings__body');
    if (!settingsBody) return;

    var existing = settingsBody.querySelector('.sfx-license-section');
    if (existing) {
      existing.remove();
    }
    injectSettingsSection(settingsBody);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Watch for Settings view opening
  function observeSettings() {
    var observer = new MutationObserver(function () {
      var settingsBody = document.querySelector('.sfx-settings__body');
      if (settingsBody && !settingsBody.querySelector('.sfx-license-section')) {
        injectSettingsSection(settingsBody);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Check gate on boot
  function checkGateOnStartup() {
    if (!window.__sfxLicense) {
      setTimeout(checkGateOnStartup, 100);
      return;
    }

    var status = window.__sfxLicense.getStatus();
    if (!status.isActivated) {
      lockPluginWithGate();
    } else {
      unlockPlugin();
    }

    // Subscribe to license changes
    window.__sfxLicense.subscribe(function (cur) {
      if (!cur.isActivated) {
        lockPluginWithGate(cur.status === 'revoked' ? 'Your license has been revoked.' : null);
      } else {
        unlockPlugin();
      }
    });
  }

  // Global UI API
  window.__sfxLicenseUI = {
    lockGate: lockPluginWithGate,
    unlockGate: unlockPlugin,
    updateSettings: updateSettingsSection
  };

  // Run startup gate & observer
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      observeSettings();
      checkGateOnStartup();
    });
  } else {
    observeSettings();
    checkGateOnStartup();
  }
})();
