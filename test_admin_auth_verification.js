const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh').trim();
if (!ANON_KEY.startsWith('sb_publishable_')) { console.error('Invalid SUPABASE_PUBLISHABLE_KEY: legacy JWTs are disabled'); process.exit(1); }
const SERVICE_KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();
if (!SERVICE_KEY || !SERVICE_KEY.startsWith('sb_secret_')) { console.error('Missing or invalid SUPABASE_SECRET_KEY (must start with sb_secret_)'); process.exit(1); }

async function runAdminVerification() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — ADMIN AUTHENTICATION E2E VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function recordPass(testName) {
    totalTests++;
    passedTests++;
    console.log(`✓ PASS [${totalTests}]: ${testName}`);
  }

  // ── TEST 1: SERVER ROUTING & CLEAN URLS ──
  console.log('--- TEST GROUP 1: SERVER ROUTING & CLEAN URLS ---');
  const resAdmin = await fetch('http://localhost:3000/admin');
  assert.strictEqual(resAdmin.status, 200, '/admin route must return 200 OK');
  const textAdmin = await resAdmin.text();
  assert.ok(textAdmin.includes('SFX Composer — Administrator Control Center'), '/admin must serve admin.html content');
  recordPass('Clean URL /admin responds with 200 OK and serves Admin Portal');

  const resAdminHtml = await fetch('http://localhost:3000/admin.html');
  assert.strictEqual(resAdminHtml.status, 200, '/admin.html must return 200 OK');
  const textAdminHtml = await resAdminHtml.text();
  assert.ok(textAdminHtml.includes('id="auth-screen"'), 'admin.html must contain auth-screen element');
  assert.ok(textAdminHtml.includes('id="dashboard-layout"'), 'admin.html must contain dashboard-layout element');
  recordPass('/admin.html responds with 200 OK and valid DOM structure');

  // ── TEST 2: NETLIFY REDIRECT CONFIGURATION ──
  console.log('\n--- TEST GROUP 2: PRODUCTION NETLIFY CONFIGURATION ---');
  const netlifyToml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8');
  assert.ok(netlifyToml.includes('from = "/admin"'), 'netlify.toml must configure /admin redirect');
  assert.ok(netlifyToml.includes('to = "/admin.html"'), 'netlify.toml must route to /admin.html');
  assert.ok(netlifyToml.includes('status = 200'), 'netlify.toml redirect status must be 200 rewrite');
  recordPass('Netlify rewrite configuration for clean URL /admin verified');

  // ── TEST 3: FRONTEND JAVASCRIPT SYNTAX & PREVENTDEFAULT ──
  console.log('\n--- TEST GROUP 3: FRONTEND SCRIPT INTEGRITY ---');
  const adminHtml = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
  const scriptMatches = adminHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
  assert.ok(scriptMatches.length >= 3, 'Must find multiple script blocks in admin.html');

  scriptMatches.forEach((scriptTag, idx) => {
    // Only check inline scripts
    if (!scriptTag.includes('src=')) {
      const code = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
      try {
        new Function(code);
      } catch (err) {
        assert.fail(`Script block ${idx} has syntax error: ${err.message}`);
      }
    }
  });
  recordPass('All inline JavaScript in admin.html validated without syntax errors');

  // Verify form event handling & preventDefault
  assert.ok(adminHtml.includes('formAuthLogin.addEventListener(\'submit\','), 'formAuthLogin submit event listener must exist');
  assert.ok(adminHtml.includes('e.preventDefault();'), 'e.preventDefault() must be called to prevent page reload');
  assert.ok(adminHtml.includes('window.history.replaceState'), 'Query string scrubber must be present on page load');
  recordPass('Form submit listener, e.preventDefault(), and URL scrubber verified in frontend code');

  // ── TEST 4: AUTHENTICATION STATE & SESSION PERSISTENCE ──
  console.log('\n--- TEST GROUP 4: SESSION PERSISTENCE & LOGOUT LOGIC ---');
  assert.ok(adminHtml.includes('localStorage.setItem(\'sfx_admin_token\', token)'), 'Token must persist to localStorage');
  assert.ok(adminHtml.includes('sessionStorage.setItem(\'sfx_admin_token\', token)'), 'Token must persist to sessionStorage');
  assert.ok(adminHtml.includes('localStorage.removeItem(\'sfx_admin_token\')'), 'Logout must clear localStorage token');
  assert.ok(adminHtml.includes('sessionStorage.removeItem(\'sfx_admin_token\')'), 'Logout must clear sessionStorage token');
  assert.ok(adminHtml.includes('supabase.auth.getSession()'), 'Token refresh must check Supabase active session');
  recordPass('Session persistence and dual-storage synchronization (localStorage + sessionStorage) verified');

  // ── TEST 5: INVALID CREDENTIALS ERROR HANDLING ──
  console.log('\n--- TEST GROUP 5: INVALID CREDENTIALS HANDLING ---');
  const invalidLoginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: 'invalid_admin_test@sfxcomposer.com',
      password: 'DefuseWrongPassword999!'
    })
  });
  const invalidLoginData = await invalidLoginRes.json();
  assert.strictEqual(invalidLoginRes.status, 400, 'Invalid credentials must return 400 Bad Request');
  assert.ok(
    invalidLoginData.msg?.toLowerCase().includes('invalid login credentials') ||
    invalidLoginData.error_description?.toLowerCase().includes('invalid login credentials'),
    'Supabase auth must report invalid login credentials'
  );
  recordPass('Invalid credentials correctly rejected by Supabase Auth with standard error');

  // ── TEST 6: PROTECTED EDGE FUNCTIONS — UNAUTHENTICATED ACCESS ──
  console.log('\n--- TEST GROUP 6: PROTECTED EDGE FUNCTIONS (UNAUTHENTICATED) ---');
  const contentUnauth = await fetch(`${SUPABASE_URL}/functions/v1/admin-content`, {
    headers: { 'apikey': ANON_KEY }
  });
  assert.strictEqual(contentUnauth.status, 401, 'Unauthenticated admin-content call must return 401');
  const contentUnauthData = await contentUnauth.json();
  assert.strictEqual(contentUnauthData.ok, false, 'admin-content ok must be false');
  recordPass('admin-content rejects unauthenticated requests with 401 Unauthorized');

  const licensesUnauth = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    headers: { 'apikey': ANON_KEY }
  });
  assert.strictEqual(licensesUnauth.status, 401, 'Unauthenticated admin-licenses call must return 401');
  const licensesUnauthData = await licensesUnauth.json();
  assert.strictEqual(licensesUnauthData.ok, false, 'admin-licenses ok must be false');
  recordPass('admin-licenses rejects unauthenticated requests with 401 Unauthorized');

  // ── TEST 7: PROTECTED EDGE FUNCTIONS — AUTHORIZED ACCESS ──
  console.log('\n--- TEST GROUP 7: PROTECTED EDGE FUNCTIONS (AUTHORIZED) ---');
  const contentAuth = await fetch(`${SUPABASE_URL}/functions/v1/admin-content`, {
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': ANON_KEY
    }
  });
  assert.strictEqual(contentAuth.status, 200, 'Authorized admin-content call must return 200');
  const contentAuthData = await contentAuth.json();
  assert.strictEqual(contentAuthData.ok, true, 'admin-content ok must be true');
  assert.ok(Array.isArray(contentAuthData.videos), 'admin-content must return videos list');
  assert.ok(Array.isArray(contentAuthData.sections), 'admin-content must return sections list');
  recordPass(`admin-content serves content to authorized admin (${contentAuthData.videos.length} videos, ${contentAuthData.sections.length} sections)`);

  const licensesAuth = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': ANON_KEY
    }
  });
  assert.strictEqual(licensesAuth.status, 200, 'Authorized admin-licenses call must return 200');
  const licensesAuthData = await licensesAuth.json();
  assert.strictEqual(licensesAuthData.ok, true, 'admin-licenses ok must be true');
  assert.ok(Array.isArray(licensesAuthData.licenses), 'admin-licenses must return licenses list');
  recordPass(`admin-licenses serves license records to authorized admin (${licensesAuthData.licenses.length} licenses loaded)`);

  // ── TEST 8: AUTHORIZED ADMIN DATABASE & SECRETS CONFIGURATION ──
  console.log('\n--- TEST GROUP 8: ADMIN ROLE & WHITELIST VERIFICATION ---');
  const adminsRes = await fetch(`${SUPABASE_URL}/rest/v1/sfx_admins?select=email`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const adminRecords = await adminsRes.json();
  const adminEmails = adminRecords.map(r => r.email);
  assert.ok(adminEmails.includes('visualsadusk@gmail.com'), 'visualsadusk@gmail.com must be in sfx_admins');
  assert.ok(adminEmails.includes('adarshpaymentway@gmail.com'), 'adarshpaymentway@gmail.com must be in sfx_admins');
  recordPass(`Admin whitelist verified in database (admins: ${adminEmails.join(', ')})`);

  console.log('\n================================================================');
  console.log(` ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log(' Admin Dashboard authentication & session flow is fully operational.');
  console.log('================================================================');
}

runAdminVerification().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
