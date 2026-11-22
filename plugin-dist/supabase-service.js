/*
  SFX Composer — Supabase Service Client
  Connects to project wyjazmiihwjlrkggeeez (https://wyjazmiihwjlrkggeeez.supabase.co)
  Handles:
  - Supabase Auth Email OTP generation & verification
  - Edge Functions invocation with structured error handling
  - PostgREST RPC invocation
  - Network timeouts & offline detection
*/
(function () {
  'use strict';

  var SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh';
  var DEFAULT_TIMEOUT_MS = 15000;

  var SupabaseService = {
    getUrl: function () {
      return SUPABASE_URL;
    },

    getPublishableKey: function () {
      return SUPABASE_ANON_KEY;
    },

    getHeaders: function (customHeaders) {
      var h = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      };
      if (customHeaders) {
        for (var k in customHeaders) {
          if (Object.prototype.hasOwnProperty.call(customHeaders, k)) {
            h[k] = customHeaders[k];
          }
        }
      }
      return h;
    },

    // Step 1: Send OTP to customer's email via Supabase Auth
    sendEmailOtp: async function (email) {
      var cleanEmail = String(email || '').trim().toLowerCase();
      var url = SUPABASE_URL + '/auth/v1/otp';
      var headers = this.getHeaders();

      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, DEFAULT_TIMEOUT_MS) : null;

      try {
        var res = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ email: cleanEmail }),
          signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);

        var data = null;
        try { data = await res.json(); } catch (e) {}

        if (!res.ok) {
          var msg = (data && (data.msg || data.message || data.error_description)) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.code = (data && data.error_code) || ('HTTP_' + res.status);
          err.status = res.status;
          throw err;
        }

        return { ok: true, email: cleanEmail };
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          var timeoutErr = new Error('Connection timed out while sending verification code.');
          timeoutErr.code = 'TIMEOUT';
          throw timeoutErr;
        }
        throw err;
      }
    },

    // Step 2: Verify OTP code with Supabase Auth
    verifyEmailOtp: async function (email, token) {
      var cleanEmail = String(email || '').trim().toLowerCase();
      var cleanToken = String(token || '').trim();
      var url = SUPABASE_URL + '/auth/v1/verify';
      var headers = this.getHeaders();

      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, DEFAULT_TIMEOUT_MS) : null;

      try {
        var res = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            type: 'email',
            email: cleanEmail,
            token: cleanToken
          }),
          signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);

        var data = null;
        try { data = await res.json(); } catch (e) {}

        if (!res.ok) {
          var msg = (data && (data.msg || data.message || data.error_description)) || 'Token has expired or is invalid.';
          var err = new Error(msg);
          err.code = (data && data.error_code) || 'INVALID_OTP';
          err.status = res.status;
          throw err;
        }

        // Returns { access_token, token_type, expires_in, user }
        return {
          ok: true,
          accessToken: data.access_token,
          user: data.user
        };
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          var timeoutErr = new Error('Connection timed out while verifying code.');
          timeoutErr.code = 'TIMEOUT';
          throw timeoutErr;
        }
        throw err;
      }
    },

    // Invoke Supabase Edge Function
    invokeFunction: async function (functionName, payload, options) {
      var opts = options || {};
      var timeoutMs = opts.timeout || DEFAULT_TIMEOUT_MS;
      var url = SUPABASE_URL + '/functions/v1/' + functionName;

      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

      try {
        var headers = this.getHeaders(opts.headers);
        var fetchOpts = {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload || {})
        };
        if (controller) fetchOpts.signal = controller.signal;

        var res = await fetch(url, fetchOpts);
        if (timeoutId) clearTimeout(timeoutId);

        var data = null;
        try { data = await res.json(); } catch (e) {}

        if (!res.ok) {
          var errorObj = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
          errorObj.status = res.status;
          errorObj.code = (data && data.code) || ('HTTP_' + res.status);
          errorObj.data = data;
          throw errorObj;
        }

        return data;
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          var timeoutErr = new Error('Request timed out while connecting to server.');
          timeoutErr.code = 'TIMEOUT';
          throw timeoutErr;
        }
        if (!err.status && !err.code) {
          err.code = 'NETWORK_ERROR';
        }
        throw err;
      }
    },

    // Invoke Supabase PostgREST RPC
    rpc: async function (functionName, params, options) {
      var opts = options || {};
      var timeoutMs = opts.timeout || DEFAULT_TIMEOUT_MS;
      var url = SUPABASE_URL + '/rest/v1/rpc/' + functionName;

      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;

      try {
        var headers = this.getHeaders(opts.headers);
        var fetchOpts = {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(params || {})
        };
        if (controller) fetchOpts.signal = controller.signal;

        var res = await fetch(url, fetchOpts);
        if (timeoutId) clearTimeout(timeoutId);

        var data = null;
        try { data = await res.json(); } catch (e) {}

        if (!res.ok) {
          var errorObj = new Error((data && (data.message || data.hint)) || ('HTTP ' + res.status));
          errorObj.status = res.status;
          errorObj.code = (data && data.code) || ('HTTP_' + res.status);
          errorObj.data = data;
          throw errorObj;
        }

        return data;
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          var timeoutErr = new Error('RPC request timed out.');
          timeoutErr.code = 'TIMEOUT';
          throw timeoutErr;
        }
        if (!err.status && !err.code) {
          err.code = 'NETWORK_ERROR';
        }
        throw err;
      }
    }
  };

  window.__sfxSupabase = SupabaseService;
})();
