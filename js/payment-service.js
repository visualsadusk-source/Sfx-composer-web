/**
 * SFX Composer — Secure Supabase & Razorpay Payment & Licensing Service
 * Connects frontend directly to Supabase Edge Functions on project wyjazmiihwjlrkggeeez.
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

    // ── 1. Create Order via Supabase Edge Function ──
    createOrder: async function (email) {
      var cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Please provide a valid email address.');
      }

      var res = await fetch(CONFIG.FUNCTIONS_URL + '/create-razorpay-order', {
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

      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to create order');
      }

      return data;
    },

    // ── 2. Verify Payment & Generate License via Backend ──
    verifyPayment: async function (verificationPayload) {
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/verify-payment', {
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

      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Payment verification failed');
      }

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
    },

    // ── 3. Customer Portal: Fetch Orders & Licenses ──
    getCustomerPortal: async function (email) {
      var cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Valid email required');
      }

      var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_get_customer_portal_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ p_email: cleanEmail })
      });

      var data = await res.json().catch(function () {
        return { ok: false, message: 'Failed to retrieve customer data' };
      });

      if (!res.ok || !data.ok) {
        throw new Error(data.message || 'Failed to retrieve portal data');
      }

      return data;
    },

    // ── 4. Admin API RPC Helpers (requires serviceKey in admin session) ──
    getAdminStats: async function (serviceKey) {
      var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_admin_get_stats_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        },
        body: '{}'
      });
      return await res.json();
    },

    getAdminOrders: async function (serviceKey, limit) {
      var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_admin_get_orders_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        },
        body: JSON.stringify({ p_limit: limit || 50 })
      });
      return await res.json();
    },

    searchAdminLicenses: async function (serviceKey, query) {
      var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_admin_search_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        },
        body: JSON.stringify({ p_query: query || '' })
      });
      return await res.json();
    },

    revokeLicense: async function (serviceKey, licenseId, reason) {
      var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_revoke_license_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        },
        body: JSON.stringify({
          p_license_id: licenseId,
          p_reason: reason || 'Revoked by admin'
        })
      });
      return await res.json();
    },

    resetDevice: async function (serviceKey, licenseId) {
      var res = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/sfx_reset_device_v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey
        },
        body: JSON.stringify({
          p_license_id: licenseId
        })
      });
      return await res.json();
    },

    issueComplimentaryLicense: async function (serviceKey, email, type, expiryArg, sendEmail) {
      var cleanEmail = String(email || '').trim().toLowerCase();
      var res = await fetch(CONFIG.FUNCTIONS_URL + '/create-license', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + serviceKey
        },
        body: JSON.stringify({
          email: cleanEmail,
          max_devices: 1,
          send_email: !!sendEmail
        })
      });
      return await res.json();
    }
  };

  window.SFX_PAYMENT_SERVICE = PaymentService;
})(window);
