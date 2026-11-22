/**
 * SFX Composer — Secure Razorpay & Supabase Payment & Licensing Service
 * Connects frontend to secure serverless backend (Vercel / Node API or Supabase Edge Functions).
 * No service-role keys or backend payment secrets are ever exposed in frontend code.
 */
(function (window) {
  'use strict';

  var CONFIG = {
    SUPABASE_URL: 'https://wyjazmiihwjlrkggeeez.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzMxMTQsImV4cCI6MjExMDc0OTExNH0.FXKso4hkmUYcl_FfjG4GnHxwyCr09j5DkJ6ak1B2auY',
    FUNCTIONS_URL: 'https://wyjazmiihwjlrkggeeez.supabase.co/functions/v1',
    PRICE_INR: 199,
    PRICE_PAISE: 19900,
    CURRENCY: 'INR'
  };

  var PaymentService = {
    getConfig: function () {
      return CONFIG;
    },

    // Determine the optimal API endpoint (Vercel Serverless / Local Node / Supabase Edge Functions)
    getEndpoints: function (action) {
      var endpoints = [];

      // 1. Explicit Custom Backend URL (e.g. window.SFX_API_URL = 'https://api.sfxcomposer.in' or Vercel URL)
      if (window.SFX_API_URL) {
        var base = String(window.SFX_API_URL).replace(/\/$/, '');
        endpoints.push(base + '/' + (action === 'create-order' ? 'create-order' : 'verify-payment'));
      }

      // 2. Same-origin Serverless API (when hosted on Vercel, Node.js server, or localhost)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname.includes('github.io')) {
        endpoints.push(action === 'create-order' ? '/api/create-order' : '/api/verify-payment');
      }

      // 3. Supabase Edge Functions
      var sbAction = action === 'create-order' ? 'create-razorpay-order' : 'verify-payment';
      endpoints.push(CONFIG.FUNCTIONS_URL + '/' + sbAction);

      return endpoints;
    },

    // ── 1. Create Razorpay Order via Secure Backend ──
    createOrder: async function (email) {
      var cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Please provide a valid email address.');
      }

      var endpoints = this.getEndpoints('create-order');
      var lastError = null;

      for (var i = 0; i < endpoints.length; i++) {
        var url = endpoints[i];
        try {
          var res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': CONFIG.SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
              email: cleanEmail,
              amount: CONFIG.PRICE_PAISE,
              currency: CONFIG.CURRENCY
            })
          });

          var data = await res.json().catch(function () {
            return { ok: false, message: 'Invalid response from payment server' };
          });

          if (res.ok && data.ok) {
            return data;
          } else if (res.status === 404 && i < endpoints.length - 1) {
            // Try fallback endpoint
            continue;
          } else {
            throw new Error(data.message || 'Failed to create order');
          }
        } catch (err) {
          lastError = err;
          if (i < endpoints.length - 1) continue;
        }
      }

      throw lastError || new Error('Could not connect to payment backend');
    },

    // ── 2. Verify Payment & Generate License via Backend (HMAC SHA-256) ──
    verifyPayment: async function (verificationPayload) {
      var endpoints = this.getEndpoints('verify-payment');
      var lastError = null;

      for (var i = 0; i < endpoints.length; i++) {
        var url = endpoints[i];
        try {
          var res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': CONFIG.SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
            },
            body: JSON.stringify(verificationPayload)
          });

          var data = await res.json().catch(function () {
            return { ok: false, message: 'Invalid verification response from server' };
          });

          if (res.ok && data.ok) {
            // Cache session locally for Customer Dashboard
            try {
              localStorage.setItem('sfx_customer_session', JSON.stringify({
                email: data.email,
                license_key: data.license_key,
                order_id: data.order_id,
                payment_id: data.payment_id,
                verified_at: new Date().toISOString()
              }));
            } catch (e) {}

            return data;
          } else if (res.status === 404 && i < endpoints.length - 1) {
            continue;
          } else {
            throw new Error(data.message || 'Payment verification failed');
          }
        } catch (err) {
          lastError = err;
          if (i < endpoints.length - 1) continue;
        }
      }

      throw lastError || new Error('Payment verification connection failed');
    },

    // ── 3. Customer Portal: Fetch Orders & Decrypted Licenses (Secured) ──
    getCustomerPortal: async function (authArg) {
      var headers = {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY
      };
      var body = {};

      if (typeof authArg === 'string') {
        headers['Authorization'] = 'Bearer ' + authArg;
      } else if (authArg && typeof authArg === 'object') {
        if (authArg.token) {
          headers['Authorization'] = 'Bearer ' + authArg.token;
        }
        body = authArg;
      }

      var endpoints = [];
      if (window.SFX_API_URL) {
        endpoints.push(String(window.SFX_API_URL).replace(/\/$/, '') + '/customer-portal');
      }
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname.includes('github.io')) {
        endpoints.push('/api/customer-portal');
      }
      endpoints.push(CONFIG.FUNCTIONS_URL + '/customer-portal');

      var lastError = null;
      for (var i = 0; i < endpoints.length; i++) {
        var url = endpoints[i];
        try {
          var res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
          });

          var data = await res.json().catch(function () {
            return { ok: false, message: 'Failed to retrieve customer data' };
          });

          if (res.ok && data.ok) {
            return data;
          } else if (data.requires_verification) {
            return data;
          } else if (data.code === 'NOT_PAID' || data.code === 'FORBIDDEN' || data.code === 'RATE_LIMITED') {
            throw new Error(data.message || 'No verified purchase was found for this email.');
          } else if (res.status === 404 && i < endpoints.length - 1) {
            continue;
          } else {
            throw new Error(data.message || 'Failed to retrieve portal data');
          }
        } catch (err) {
          lastError = err;
          if (i < endpoints.length - 1) continue;
        }
      }

      throw lastError || new Error('Failed to retrieve customer portal data');
    },

    // ── 4. Admin API: Create / Issue License ──
    createLicense: async function (authToken, params) {
      var payload = {};
      if (typeof params === 'string') {
        payload.email = params;
        payload.send_email = true;
        payload.max_devices = 1;
      } else if (params && typeof params === 'object') {
        payload.email = params.email;
        payload.send_email = params.send_email !== undefined ? params.send_email : true;
        payload.max_devices = params.max_devices || 1;
        payload.expires_at = params.expires_at || null;
        payload.license_type = params.license_type || 'lifetime';
      }

      var cleanEmail = String(payload.email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('A valid customer email is required.');
      }
      payload.email = cleanEmail;

      var res = await fetch(CONFIG.FUNCTIONS_URL + '/create-license', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify(payload)
      });

      var data = await res.json().catch(function () {
        return { ok: false, message: 'Failed to communicate with licensing service' };
      });

      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to create license');
      }

      return data;
    },

    issueComplimentaryLicense: async function (authToken, email, type, expiryArg, sendEmail) {
      return await this.createLicense(authToken, {
        email: email,
        license_type: type || 'lifetime',
        expires_at: expiryArg || null,
        send_email: !!sendEmail
      });
    },

    // ── 5. Admin API: Load Licenses, Stats, and Orders ──
    getAdminLicensesData: async function (authToken, query) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({ action: 'list', query: query || '' })
      });

      var data = await res.json().catch(function () {
        return { ok: false, message: 'Failed to load admin data' };
      });

      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to load admin data');
      }

      return data;
    },

    getAdminStats: async function (authToken) {
      try {
        var data = await this.getAdminLicensesData(authToken, '');
        return data.stats || {};
      } catch (e) {
        var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_admin_get_stats_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': authToken,
            'Authorization': 'Bearer ' + authToken
          },
          body: '{}'
        });
        return await res.json();
      }
    },

    getAdminOrders: async function (authToken, limit) {
      try {
        var data = await this.getAdminLicensesData(authToken, '');
        return data.orders || [];
      } catch (e) {
        var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_admin_get_orders_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': authToken,
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ p_limit: limit || 50 })
        });
        return await res.json();
      }
    },

    searchAdminLicenses: async function (authToken, query) {
      try {
        var data = await this.getAdminLicensesData(authToken, query || '');
        return data.licenses || [];
      } catch (e) {
        var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_admin_search_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': authToken,
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ p_query: query || '' })
        });
        return await res.json();
      }
    },

    // ── 6. Admin License Actions ──
    revokeLicense: async function (authToken, licenseId, reason) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'revoke',
          license_id: licenseId,
          reason: reason || 'Revoked by admin'
        })
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to revoke license');
      return data;
    },

    reactivateLicense: async function (authToken, licenseId) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'reactivate',
          license_id: licenseId
        })
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to reactivate license');
      return data;
    },

    resetDevice: async function (authToken, licenseId) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'reset_device',
          license_id: licenseId
        })
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to reset device activations');
      return data;
    },

    extendExpiry: async function (authToken, licenseId, newExpiresAt) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'extend_expiry',
          license_id: licenseId,
          expires_at: newExpiresAt || null
        })
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to extend license expiry');
      return data;
    },

    revealLicenseKey: async function (authToken, licenseId) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'reveal_key',
          license_id: licenseId
        })
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to reveal license key');
      return data;
    },

    reissueLicenseKeyAdmin: async function (authToken, licenseId, reason, sendEmail) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'reissue_key',
          license_id: licenseId,
          reason: reason || 'Admin reissued key',
          send_email: sendEmail !== false
        })
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to reissue license key');
      return data;
    },

    reissueLicenseKeyCustomer: async function (authArg, licenseId) {
      var headers = {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY
      };
      var body = {
        action: 'reissue_key',
        license_id: licenseId
      };

      if (typeof authArg === 'string') {
        headers['Authorization'] = 'Bearer ' + authArg;
      } else if (authArg && typeof authArg === 'object') {
        if (authArg.token) headers['Authorization'] = 'Bearer ' + authArg.token;
        if (authArg.email) body.email = authArg.email;
        if (authArg.order_id) body.order_id = authArg.order_id;
        if (authArg.payment_id) body.payment_id = authArg.payment_id;
      }

      var res = await fetch(CONFIG.FUNCTIONS_URL + '/customer-portal', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to reissue license key');
      return data;
    },

    getAuditLogs: async function (authToken, licenseId, limit) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'get_audit_logs',
          license_id: licenseId || null,
          limit: limit || 50
        })
      });
      var data = await res.json().catch(function () { return { ok: false }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to fetch audit logs');
      return data.logs || [];
    },

    resendLicenseEmail: async function (authToken, orderIdOrLicenseId) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/admin-licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          action: 'resend_email',
          order_id: orderIdOrLicenseId
        })
      });
      var data = await res.json().catch(function () { return { ok: false, message: 'Invalid response from email service' }; });
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to resend license email');
      return data;
    }
  };

  window.SFX_PAYMENT_SERVICE = PaymentService;
})(window);
