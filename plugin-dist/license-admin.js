/*
  SFX Composer — Licensing Admin Dashboard Script
  Architecture: Zero-Trust Admin Authentication via Supabase Auth & Edge Functions.
  All privileged operations (key generation, device reset, revocation) are executed
  inside server-side Edge Functions with Authorization: Bearer <admin_access_token>.
  The Supabase Service Role Key is NEVER exposed in the browser.
*/
(function () {
  'use strict';

  var SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh';
  var STORAGE_SESSION_KEY = 'sfx_admin_auth_session';

  // Elements: Auth UI
  var authLoginBox = document.getElementById('auth-login-box');
  var authStatusBox = document.getElementById('auth-status-box');
  var adminEmailInput = document.getElementById('admin-email');
  var adminPasswordInput = document.getElementById('admin-password');
  var btnAdminLogin = document.getElementById('btn-admin-login');
  var btnSendOtp = document.getElementById('btn-send-otp');
  var btnAdminLogout = document.getElementById('btn-admin-logout');
  var adminUserDisplay = document.getElementById('admin-user-display');
  var btnRefresh = document.getElementById('btn-refresh');

  // OTP Modal Elements
  var modalOtp = document.getElementById('modal-otp');
  var otpModalDescription = document.getElementById('otp-modal-description');
  var formOtp = document.getElementById('form-otp');
  var adminOtpInput = document.getElementById('admin-otp-input');
  var btnCancelOtp = document.getElementById('btn-cancel-otp');
  var btnVerifyOtp = document.getElementById('btn-verify-otp');
  var pendingOtpEmail = '';

  // Metrics
  var valTotal = document.getElementById('val-total');
  var valActive = document.getElementById('val-active');
  var valUnused = document.getElementById('val-unused');
  var valRevoked = document.getElementById('val-revoked');

  // Toolbar & Table
  var searchInput = document.getElementById('search-input');
  var tableBody = document.getElementById('table-body');
  var btnIssueModal = document.getElementById('btn-issue-modal');

  // Modal Issue
  var modalIssue = document.getElementById('modal-issue');
  var btnCancelIssue = document.getElementById('btn-cancel-issue');
  var formIssue = document.getElementById('form-issue');
  var btnDoIssue = document.getElementById('btn-do-issue');
  var newEmail = document.getElementById('new-email');
  var newType = document.getElementById('new-type');
  var newExpiry = document.getElementById('new-expiry');
  var newSendEmail = document.getElementById('new-send-email');
  var issuedKeyWrap = document.getElementById('issued-key-wrap');
  var displayKey = document.getElementById('display-key');
  var emailStatusText = document.getElementById('email-status-text');

  // Current session state
  var currentSession = null;

  function loadSavedSession() {
    try {
      var raw = sessionStorage.getItem(STORAGE_SESSION_KEY) || localStorage.getItem(STORAGE_SESSION_KEY);
      if (raw) {
        currentSession = JSON.parse(raw);
      }
    } catch (e) {
      currentSession = null;
    }
  }

  function saveSession(session) {
    currentSession = session;
    try {
      if (session) {
        sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
      } else {
        sessionStorage.removeItem(STORAGE_SESSION_KEY);
        localStorage.removeItem(STORAGE_SESSION_KEY);
      }
    } catch (e) {}
  }

  function updateAuthUI() {
    if (currentSession && currentSession.access_token) {
      authLoginBox.style.display = 'none';
      authStatusBox.style.display = 'flex';
      adminUserDisplay.textContent = currentSession.email || 'Admin';
      btnIssueModal.disabled = false;
    } else {
      authLoginBox.style.display = 'flex';
      authStatusBox.style.display = 'none';
      adminUserDisplay.textContent = '—';
      btnIssueModal.disabled = true;
      valTotal.textContent = '—';
      valActive.textContent = '—';
      valUnused.textContent = '—';
      valRevoked.textContent = '—';
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 36px;">Please sign in with your administrator account above to load licenses.</td></tr>';
    }
  }

  // Helper: Call Edge Function with admin access token
  async function callEdgeFunction(functionName, payload, method) {
    if (!currentSession || !currentSession.access_token) {
      throw new Error('Not authenticated. Please sign in as an admin.');
    }

    var httpMethod = method || 'POST';
    var url = SUPABASE_URL + '/functions/v1/' + functionName;
    var headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + currentSession.access_token
    };

    var fetchOpts = {
      method: httpMethod,
      headers: headers
    };

    if (httpMethod === 'POST' && payload) {
      fetchOpts.body = JSON.stringify(payload);
    }

    var res = await fetch(url, fetchOpts);
    var data = null;
    try {
      data = await res.json();
    } catch (e) {}

    if (res.status === 401 || res.status === 403) {
      if (data && data.code === 'UNAUTHORIZED') {
        saveSession(null);
        updateAuthUI();
      }
      throw new Error((data && data.message) || ('Authorization failed (HTTP ' + res.status + ')'));
    }

    if (!res.ok) {
      throw new Error((data && data.message) || ('HTTP ' + res.status));
    }

    return data;
  }

  // Refresh Dashboard
  async function refreshDashboard() {
    if (!currentSession || !currentSession.access_token) return;

    btnRefresh.textContent = '↻ Loading...';
    try {
      var query = searchInput.value.trim();
      var data = await callEdgeFunction('admin-licenses', { query: query }, 'POST');

      // Update metrics
      if (data.stats) {
        valTotal.textContent = data.stats.total_licenses !== undefined ? data.stats.total_licenses : '0';
        valActive.textContent = data.stats.active_licenses !== undefined ? data.stats.active_licenses : '0';
        valUnused.textContent = data.stats.unused_licenses !== undefined ? data.stats.unused_licenses : '0';
        valRevoked.textContent = data.stats.revoked_licenses !== undefined ? data.stats.revoked_licenses : '0';
      }

      // Render Table
      renderTable(data.licenses || []);
    } catch (err) {
      console.error('Failed to refresh dashboard:', err);
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 24px;">Failed to load data: ' + escapeHtml(err.message) + '</td></tr>';
    } finally {
      btnRefresh.textContent = '↻ Refresh Data';
    }
  }

  function renderTable(list) {
    if (!list || list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">No licenses found.</td></tr>';
      return;
    }

    var html = list.map(function (l) {
      var statusBadge = '';
      if (l.status === 'active') {
        statusBadge = '<span class="status-badge badge-active">Active</span>';
      } else if (l.status === 'revoked') {
        statusBadge = '<span class="status-badge badge-revoked">Revoked</span>';
      } else {
        statusBadge = '<span class="status-badge badge-expired">Expired</span>';
      }

      var deviceText = '<span style="color: var(--text-muted);">Unused (0/' + (l.max_devices || 1) + ')</span>';
      var hasActiveDevice = l.active_devices && l.active_devices.length > 0;
      if (hasActiveDevice) {
        var dev = l.active_devices[0];
        deviceText = '<strong style="color: var(--success);">' + escapeHtml(dev.device_name || 'Active Machine') + '</strong>';
      }

      var createdDate = l.created_at ? new Date(l.created_at).toLocaleDateString() : '—';

      var actionsHtml = [
        '<div style="display: flex; justify-content: flex-end; gap: 6px;">'
      ];

      if (hasActiveDevice) {
        actionsHtml.push('<button type="button" class="btn btn-warning-sm btn-sm" onclick="window.__adminResetDevice(\'' + l.id + '\')">Reset Device</button>');
      }
      if (l.status === 'active') {
        actionsHtml.push('<button type="button" class="btn btn-danger-sm btn-sm" onclick="window.__adminRevoke(\'' + l.id + '\')">Revoke</button>');
      }

      actionsHtml.push('</div>');

      return [
        '<tr>',
        '  <td><strong>' + escapeHtml(l.email) + '</strong></td>',
        '  <td><span style="text-transform: capitalize;">Standard Pro</span></td>',
        '  <td>' + statusBadge + '</td>',
        '  <td>' + deviceText + '</td>',
        '  <td>' + createdDate + '</td>',
        '  <td>' + actionsHtml.join('') + '</td>',
        '</tr>'
      ].join('');
    }).join('');

    tableBody.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Global action handlers
  window.__adminResetDevice = async function (licenseId) {
    var ok = confirm('Reset active device for this customer? This will allow them to activate on a new computer.');
    if (!ok) return;
    try {
      var res = await callEdgeFunction('reset-device', {
        license_id: licenseId,
        reason: 'Reset via Admin Dashboard'
      });
      alert(res.message || 'Device reset complete.');
      refreshDashboard();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  window.__adminRevoke = async function (licenseId) {
    var ok = confirm('Revoke this license? The customer will immediately lose access to SFX Composer Pro.');
    if (!ok) return;
    try {
      var res = await callEdgeFunction('revoke-license', {
        license_id: licenseId,
        reason: 'Revoked via Admin Dashboard'
      });
      alert(res.message || 'License revoked.');
      refreshDashboard();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  };

  // Sign In: Email + Password
  btnAdminLogin.addEventListener('click', async function () {
    var email = adminEmailInput.value.trim().toLowerCase();
    var password = adminPasswordInput.value;

    if (!email || !email.includes('@')) {
      alert('Please enter a valid administrator email address.');
      return;
    }

    if (!password) {
      // Trigger OTP flow if no password entered
      btnSendOtp.click();
      return;
    }

    btnAdminLogin.disabled = true;
    btnAdminLogin.textContent = 'Signing in...';

    try {
      var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email: email, password: password })
      });

      var data = await res.json();
      if (!res.ok) {
        throw new Error(data.error_description || data.msg || data.message || 'Login failed');
      }

      saveSession({
        access_token: data.access_token,
        email: data.user.email
      });

      updateAuthUI();
      await refreshDashboard();
    } catch (err) {
      alert('Admin sign-in failed: ' + err.message);
    } finally {
      btnAdminLogin.disabled = false;
      btnAdminLogin.textContent = 'Sign In';
    }
  });

  // Sign In: Send OTP Code
  btnSendOtp.addEventListener('click', async function () {
    var email = adminEmailInput.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      alert('Please enter a valid administrator email address to send a login code.');
      return;
    }

    btnSendOtp.disabled = true;
    btnSendOtp.textContent = 'Sending...';

    try {
      var res = await fetch(SUPABASE_URL + '/auth/v1/otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email: email })
      });

      if (!res.ok) {
        var errData = await res.json();
        throw new Error(errData.msg || errData.message || 'Failed to send verification code.');
      }

      pendingOtpEmail = email;
      otpModalDescription.textContent = 'We sent a 6-digit confirmation code to ' + email + '.';
      adminOtpInput.value = '';
      modalOtp.classList.add('is-open');
    } catch (err) {
      alert('Failed to send verification code: ' + err.message);
    } finally {
      btnSendOtp.disabled = false;
      btnSendOtp.textContent = 'Send Code (OTP)';
    }
  });

  btnCancelOtp.addEventListener('click', function () {
    modalOtp.classList.remove('is-open');
  });

  // Verify OTP Code
  formOtp.addEventListener('submit', async function (e) {
    e.preventDefault();
    var code = adminOtpInput.value.trim();
    if (!code || code.length < 6) {
      alert('Please enter the 6-digit confirmation code.');
      return;
    }

    btnVerifyOtp.disabled = true;
    btnVerifyOtp.textContent = 'Verifying...';

    try {
      var res = await fetch(SUPABASE_URL + '/auth/v1/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          type: 'email',
          email: pendingOtpEmail,
          token: code
        })
      });

      var data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || data.message || 'Verification code is invalid or expired.');
      }

      saveSession({
        access_token: data.access_token,
        email: data.user.email
      });

      modalOtp.classList.remove('is-open');
      updateAuthUI();
      await refreshDashboard();
    } catch (err) {
      alert('Verification failed: ' + err.message);
    } finally {
      btnVerifyOtp.disabled = false;
      btnVerifyOtp.textContent = 'Verify & Sign In';
    }
  });

  // Sign Out
  btnAdminLogout.addEventListener('click', function () {
    saveSession(null);
    updateAuthUI();
  });

  btnRefresh.addEventListener('click', function () {
    refreshDashboard();
  });

  var searchTimer = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      refreshDashboard();
    }, 300);
  });

  // Modal: Issue License
  btnIssueModal.addEventListener('click', function () {
    issuedKeyWrap.style.display = 'none';
    formIssue.reset();
    btnDoIssue.style.display = 'inline-flex';
    btnDoIssue.disabled = false;
    btnDoIssue.textContent = 'Generate & Issue';
    btnCancelIssue.textContent = 'Cancel';
    modalIssue.classList.add('is-open');
  });

  btnCancelIssue.addEventListener('click', function () {
    modalIssue.classList.remove('is-open');
  });

  // Form Submit: Issue License (calls Edge Function create-license)
  formIssue.addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = newEmail.value.trim().toLowerCase();
    var exp = newExpiry.value;
    var sendEmail = newSendEmail.checked;

    if (!email || !email.includes('@')) {
      alert('A valid customer email address is required.');
      return;
    }

    var expiresAt = null;
    if (exp === '1y') {
      var d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      expiresAt = d.toISOString();
    } else if (exp === '2y') {
      var d2 = new Date();
      d2.setFullYear(d2.getFullYear() + 2);
      expiresAt = d2.toISOString();
    }

    btnDoIssue.disabled = true;
    btnDoIssue.textContent = 'Generating on Server...';

    try {
      // Execute privileged license generation inside Edge Function
      var res = await callEdgeFunction('create-license', {
        email: email,
        expires_at: expiresAt,
        max_devices: 1,
        send_email: sendEmail
      });

      if (!res.ok || !res.license_key) {
        throw new Error(res.message || 'Failed to generate license key.');
      }

      var rawKey = res.license_key;

      // Show generated plaintext key once
      displayKey.textContent = rawKey;
      issuedKeyWrap.style.display = 'block';

      var btnCopyKey = document.getElementById('btn-copy-key');
      if (btnCopyKey) {
        btnCopyKey.onclick = function () {
          navigator.clipboard.writeText(rawKey).then(function () {
            btnCopyKey.textContent = '✓ Copied to Clipboard!';
            setTimeout(function () { btnCopyKey.textContent = '📋 Copy Key to Clipboard'; }, 2000);
          }).catch(function () {
            alert('License Key: ' + rawKey);
          });
        };
      }

      if (res.email_delivery && res.email_delivery.sent) {
        emailStatusText.textContent = '✓ License stored in database and emailed to customer (' + res.email_delivery.info + ').';
      } else {
        emailStatusText.textContent = '✓ Stored in database. ' + ((res.email_delivery && res.email_delivery.info) || 'Deliver key manually.');
      }

      btnDoIssue.style.display = 'none';
      btnCancelIssue.textContent = 'Done';

      refreshDashboard();
    } catch (err) {
      alert('Failed to issue license: ' + err.message);
      btnDoIssue.disabled = false;
      btnDoIssue.textContent = 'Generate & Issue';
    }
  });

  // Initialization
  loadSavedSession();
  updateAuthUI();
  if (currentSession && currentSession.access_token) {
    refreshDashboard();
  }
})();
