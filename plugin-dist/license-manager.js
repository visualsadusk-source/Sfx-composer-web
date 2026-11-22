/*
  SFX Composer — License Manager (Direct License Authentication Engine)

  Supabase Project:
    URL: https://wyjazmiihwjlrkggeeez.supabase.co
    Publishable Key: sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh
    Project Reference: wyjazmiihwjlrkggeeez

  Handles:
  - Hardware fingerprinting (persistent device ID)
  - Direct server-side license authentication (email + license key)
  - Token-based activation & secure storage (never stores plaintext license keys)
  - Server-side verification via Supabase Edge Functions / RPCs
  - 7-day offline grace period policy
  - Atomic deactivation and device lock
*/
(function () {
  'use strict';

  var STORAGE_KEY_SESSION = 'sfx_activation_session';
  var STORAGE_KEY_DEVICE = 'sfx_installation_id';
  var OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Safe Node.js require resolver
  function getNodeModule(name) {
    try {
      if (typeof window !== 'undefined' && window.cep_node && typeof window.cep_node.require === 'function') {
        return window.cep_node.require(name);
      }
      if (typeof window !== 'undefined' && typeof window.require === 'function') {
        return window.require(name);
      }
      if (typeof require === 'function') {
        return require(name);
      }
    } catch (e) {}
    return null;
  }

  var nodeCrypto = getNodeModule('crypto');
  var nodeOs = getNodeModule('os');
  var nodeFs = getNodeModule('fs');
  var nodePath = getNodeModule('path');

  // SHA-256 helper
  async function sha256(text) {
    var normalized = String(text || '').trim();
    if (nodeCrypto) {
      return nodeCrypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
    }
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      var buffer = new TextEncoder().encode(normalized);
      var hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return '';
  }

  // Generate stable hardware device ID
  function generateDeviceId() {
    try {
      var existing = localStorage.getItem(STORAGE_KEY_DEVICE);
      if (existing && existing.length >= 16) return existing;
    } catch (e) {}

    var id = '';
    if (nodeOs && nodeCrypto) {
      try {
        var host = nodeOs.hostname() || 'localhost';
        var platform = nodeOs.platform() || 'unknown';
        var username = '';
        try { username = nodeOs.userInfo().username; } catch (e) {}
        var cpuModel = '';
        try {
          var cpus = nodeOs.cpus();
          if (cpus && cpus.length > 0) cpuModel = cpus[0].model;
        } catch (e) {}
        var raw = [host, platform, username, cpuModel].join(':::');
        id = nodeCrypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
      } catch (e) {}
    }

    if (!id) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        id = crypto.randomUUID().replace(/-/g, '');
      } else {
        id = 'inst_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 12);
      }
    }

    try { localStorage.setItem(STORAGE_KEY_DEVICE, id); } catch (e) {}
    return id;
  }

  function getDeviceName() {
    if (nodeOs) {
      try {
        var h = nodeOs.hostname();
        var p = nodeOs.platform();
        var pName = p === 'win32' ? 'Windows' : p === 'darwin' ? 'macOS' : p;
        return (h ? h + ' (' + pName + ')' : pName);
      } catch (e) {}
    }
    if (typeof navigator !== 'undefined') {
      var ua = navigator.userAgent || '';
      if (ua.indexOf('Mac') !== -1) return 'Mac Workstation';
      if (ua.indexOf('Win') !== -1) return 'Windows Workstation';
    }
    return 'Workstation';
  }

  // Secure local credential storage for CEP
  function getBackupFilePath() {
    if (!nodeOs || !nodeFs || !nodePath) return null;
    try {
      var dir = nodePath.join(nodeOs.homedir(), '.sfxcomposer');
      if (!nodeFs.existsSync(dir)) nodeFs.mkdirSync(dir, { recursive: true });
      return nodePath.join(dir, 'activation.json');
    } catch (e) {
      return null;
    }
  }

  function saveCredentials(data) {
    try {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(data));
    } catch (e) {}
    var filePath = getBackupFilePath();
    if (!filePath || !nodeFs) return;
    try {
      nodeFs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
  }

  function readCredentials() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_SESSION);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var filePath = getBackupFilePath();
    if (!filePath || !nodeFs) return null;
    try {
      if (nodeFs.existsSync(filePath)) {
        return JSON.parse(nodeFs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {}
    return null;
  }

  function clearCredentials() {
    try { localStorage.removeItem(STORAGE_KEY_SESSION); } catch (e) {}
    var filePath = getBackupFilePath();
    if (filePath && nodeFs) {
      try { nodeFs.unlinkSync(filePath); } catch (e) {}
    }
  }

  // LicenseManager Singleton
  var LicenseManager = {
    _status: 'checking', // 'checking' | 'active' | 'unactivated' | 'revoked' | 'expired' | 'grace'
    _session: null,
    _listeners: [],
    _initialized: false,
    _verifying: false,

    getDeviceId: function () {
      return generateDeviceId();
    },

    getDeviceName: function () {
      return getDeviceName();
    },

    isActivated: function () {
      return this._status === 'active' || this._status === 'grace';
    },

    isFeatureLocked: function (featureName) {
      return !this.isActivated();
    },

    getStatus: function () {
      return {
        isActivated: this.isActivated(),
        status: this._status,
        email: this._session ? this._session.email : '',
        licenseType: this._session ? (this._session.licenseType || 'SFX Composer Pro') : '',
        deviceId: this.getDeviceId(),
        deviceName: this.getDeviceName(),
        lastVerifiedAt: this._session ? this._session.lastVerifiedAt : null,
        offlineGrace: this._status === 'grace',
        isVerifying: this._verifying
      };
    },

    // Initialize session and verify on startup
    init: async function () {
      if (this._initialized) return this.getStatus();
      this._initialized = true;

      var cached = readCredentials();

      if (cached && cached.activationToken && cached.email) {
        this._session = cached;
        var now = Date.now();
        var lastVer = cached.lastVerifiedAt ? new Date(cached.lastVerifiedAt).getTime() : 0;
        var diff = now - lastVer;

        if (diff < OFFLINE_GRACE_MS) {
          this._status = 'active';
        } else {
          this._status = 'grace';
        }

        // Background online verification
        this._verifyBackground();
      } else {
        this._status = 'unactivated';
        this._session = null;
      }

      this._emitChange();
      return this.getStatus();
    },

    // Direct License Authentication (No OTP required)
    activate: async function (email, licenseKey) {
      var cleanEmail = String(email || '').trim().toLowerCase();
      var cleanKey = String(licenseKey || '').trim().toUpperCase();

      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { ok: false, code: 'INVALID_EMAIL', message: 'Please enter a valid registered email address.' };
      }
      if (!cleanKey || cleanKey.length < 10) {
        return { ok: false, code: 'INVALID_KEY', message: 'Please enter a valid SFX Composer license key.' };
      }

      this._verifying = true;
      this._emitChange();

      var deviceId = this.getDeviceId();
      var deviceName = this.getDeviceName();
      var supabase = window.__sfxSupabase;

      try {
        var res = null;

        // Call direct activate-license Edge Function
        try {
          var payload = {
            email: cleanEmail,
            license_key: cleanKey,
            device_id: deviceId,
            device_name: deviceName
          };

          res = await supabase.invokeFunction('activate-license', payload);
        } catch (edgeErr) {
          if (edgeErr.data && edgeErr.data.code) {
            this._verifying = false;
            this._emitChange();
            return { ok: false, code: edgeErr.data.code, message: edgeErr.data.message };
          }

          // Fallback to direct RPC sfx_activate_license_v2 if Edge Function is offline
          var keyHash = await sha256(cleanKey);
          var rawToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
            : ('tok_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 16));
          var tokenHash = await sha256(rawToken);

          var rpcRes = await supabase.rpc('sfx_activate_license_v2', {
            p_email: cleanEmail,
            p_license_key_hash: keyHash,
            p_device_id: deviceId,
            p_device_name: deviceName,
            p_token_hash: tokenHash
          });

          if (rpcRes && rpcRes.ok) {
            res = {
              ok: true,
              activation_token: rawToken,
              email: cleanEmail,
              max_devices: rpcRes.max_devices,
              status: 'active',
              message: 'Activation Successful! Welcome to SFX Composer.'
            };
          } else {
            res = rpcRes;
          }
        }

        this._verifying = false;

        if (res && res.ok && res.activation_token) {
          var sessionData = {
            email: cleanEmail,
            activationToken: res.activation_token,
            licenseType: 'SFX Composer Pro',
            status: 'active',
            deviceId: deviceId,
            deviceName: deviceName,
            activatedAt: new Date().toISOString(),
            lastVerifiedAt: new Date().toISOString()
          };

          this._session = sessionData;
          this._status = 'active';

          saveCredentials(sessionData);
          this._emitChange();
          return {
            ok: true,
            status: 'active',
            email: cleanEmail,
            message: res.message || 'Activation Successful! Welcome to SFX Composer.'
          };
        } else {
          var code = res ? (res.code || 'ACTIVATION_FAILED') : 'ACTIVATION_FAILED';
          var msg = res ? (res.message || 'Activation failed.') : 'Activation failed.';
          this._emitChange();
          return { ok: false, code: code, message: msg };
        }
      } catch (err) {
        this._verifying = false;
        this._emitChange();
        return {
          ok: false,
          code: 'SERVER_UNAVAILABLE',
          message: 'Unable to reach the activation server. Please check your internet connection.'
        };
      }
    },

    // Verify existing activation token
    verify: async function () {
      if (!this._session || !this._session.activationToken) {
        this._status = 'unactivated';
        this._emitChange();
        return { ok: false, code: 'NOT_ACTIVATED', message: 'No active session found.' };
      }

      this._verifying = true;
      this._emitChange();

      var deviceId = this.getDeviceId();
      var token = this._session.activationToken;

      try {
        var supabase = window.__sfxSupabase;
        var res = null;

        try {
          res = await supabase.invokeFunction('verify-license', {
            activation_token: token,
            device_id: deviceId
          });
        } catch (edgeErr) {
          if (edgeErr.data && edgeErr.data.code) {
            res = edgeErr.data;
          } else {
            var tokenHash = await sha256(token);
            res = await supabase.rpc('sfx_verify_token_v2', {
              p_token_hash: tokenHash,
              p_device_id: deviceId
            });
          }
        }

        this._verifying = false;

        if (res && res.ok) {
          this._status = 'active';
          this._session.lastVerifiedAt = new Date().toISOString();
          saveCredentials(this._session);
          this._emitChange();
          return { ok: true, status: 'active' };
        } else {
          var code = res ? (res.code || 'VERIFICATION_FAILED') : 'VERIFICATION_FAILED';
          if (code === 'REVOKED' || code === 'EXPIRED' || code === 'DEACTIVATED' || code === 'INVALID_SESSION' || code === 'DEVICE_MISMATCH') {
            clearCredentials();
            this._status = code === 'REVOKED' ? 'revoked' : 'unactivated';
            this._session = null;
          }
          this._emitChange();
          return { ok: false, code: code, message: res ? res.message : 'Verification failed.' };
        }
      } catch (err) {
        this._verifying = false;
        var lastVer = this._session.lastVerifiedAt ? new Date(this._session.lastVerifiedAt).getTime() : 0;
        var diff = Date.now() - lastVer;

        if (diff < OFFLINE_GRACE_MS) {
          this._status = 'grace';
          this._emitChange();
          return { ok: true, status: 'active', offline: true, message: 'Verified within offline grace period.' };
        } else {
          this._status = 'unactivated';
          this._emitChange();
          return {
            ok: false,
            code: 'GRACE_EXPIRED',
            message: 'Offline grace period (7 days) has expired. Please connect to the internet to verify your license.'
          };
        }
      }
    },

    _verifyBackground: function () {
      var self = this;
      setTimeout(function () {
        self.verify().catch(function (e) {
          console.warn('[SFX License] Background verify:', e);
        });
      }, 1200);
    },

    // Deactivate device
    deactivate: async function () {
      if (!this._session || !this._session.activationToken) {
        clearCredentials();
        this._status = 'unactivated';
        this._session = null;
        this._emitChange();
        return { ok: true };
      }

      this._verifying = true;
      this._emitChange();

      var deviceId = this.getDeviceId();
      var token = this._session.activationToken;

      try {
        var supabase = window.__sfxSupabase;
        try {
          await supabase.invokeFunction('deactivate-license', {
            activation_token: token,
            device_id: deviceId
          });
        } catch (e) {
          var tokenHash = await sha256(token);
          await supabase.rpc('sfx_deactivate_token_v2', {
            p_token_hash: tokenHash,
            p_device_id: deviceId
          });
        }
      } catch (e) {
        console.warn('[SFX License] Deactivation network error, clearing locally:', e);
      }

      this._verifying = false;
      clearCredentials();
      this._status = 'unactivated';
      this._session = null;
      this._emitChange();

      return { ok: true };
    },

    subscribe: function (fn) {
      if (typeof fn === 'function') {
        this._listeners.push(fn);
        fn(this.getStatus());
      }
      var self = this;
      return function () {
        self._listeners = self._listeners.filter(function (l) { return l !== fn; });
      };
    },

    _emitChange: function () {
      var status = this.getStatus();
      this._listeners.forEach(function (fn) {
        try { fn(status); } catch (e) {}
      });
      if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sfx-license-changed', { detail: status }));
      }
    }
  };

  window.__sfxLicense = LicenseManager;

  // Run on startup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      LicenseManager.init();
    });
  } else {
    LicenseManager.init();
  }
})();
