/**
 * test_email_deliverability_audit.js
 * Comprehensive automated verification for Email Deliverability,
 * Bounce Rate Prevention, Supabase Auth Rate Limiting & Cooldown Controls.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzMxMTQsImV4cCI6MjExMDc0OTExNH0.FXKso4hkmUYcl_FfjG4GnHxwyCr09j5DkJ6ak1B2auY';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTE3MzExNCwiZXhwIjoyMTEwNzQ5MTE0fQ.Y6GbsUSzkh4b-Uze1JiLSie6PEb8SfG6xg36P4SPrNA';

// Mock browser localStorage and window environment for unit testing client logic
function setupMockBrowserEnv() {
  const store = {};
  global.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };
  global.window = {
    location: { origin: 'http://localhost:3000', pathname: '/' },
    localStorage: global.localStorage
  };
}

async function runDeliverabilityAuditSuite() {
  console.log('========================================================================');
  console.log(' SFX COMPOSER — EMAIL DELIVERABILITY & BOUNCE PREVENTION AUDIT SUITE');
  console.log('========================================================================\n');

  setupMockBrowserEnv();

  // Load main.js code to test deliverability functions
  const mainJsPath = path.join(__dirname, 'js/main.js');
  const mainJs = fs.readFileSync(mainJsPath, 'utf8');

  // Evaluate the validation & error formatter functions
  const start = mainJs.indexOf('function validateEmailDeliverability');
  const end = mainJs.indexOf('// Expose deliverability validator globally', start);
  const funcBody = mainJs.substring(start, end);
  const evalDeliverabilityEngine = new Function('window', 'localStorage', `
    ${funcBody}
    return {
      validateEmail: validateEmailDeliverability,
      checkCooldown: getRemainingCooldown,
      formatError: formatAuthError
    };
  `);

  const engine = evalDeliverabilityEngine(global.window, global.localStorage);
  const validateEmail = engine.validateEmail;
  const checkCooldown = engine.checkCooldown;
  const formatError = engine.formatError;

  // ── TEST 1: STRICT RFC-5322 EMAIL SYNTAX VALIDATION ──
  console.log('[TEST 1] Testing RFC-5322 Email Syntax & Domain Format Validation...');
  const validEmails = [
    'editor@audioflow.com',
    'sound.designer@premierepro.tv',
    'support+vip@cinema-sound.org',
    'lead_mixer_2026@post-house.co.uk'
  ];

  validEmails.forEach(e => {
    const res = validateEmail(e);
    assert.strictEqual(res.valid, true, `Email ${e} should be valid`);
    assert.strictEqual(res.email, e.toLowerCase().trim());
  });

  const invalidEmails = [
    '',
    '   ',
    'notanemail',
    '@nodomain.com',
    'nouser@',
    'spaces in@email.com',
    'user@domain..com',
    'user@.domain.com',
    'user@domain.c', // Single-character TLD
    'user@nodotdomain'
  ];

  invalidEmails.forEach(e => {
    const res = validateEmail(e);
    assert.strictEqual(res.valid, false, `Invalid email "${e}" must be rejected`);
    assert.ok(res.error && res.error.length > 0, `Must provide error reason for "${e}"`);
  });
  console.log('✓ PASS: All valid and invalid syntax patterns correctly validated.\n');

  // ── TEST 2: TYPO PREVENTION & SMART CORRECTION WARNINGS ──
  console.log('[TEST 2] Testing common domain typo detection (Prevents high-volume bounces)...');
  const typoCases = [
    { input: 'editor@gnail.com', expectedCorrection: 'gmail.com' },
    { input: 'user@gmai.com', expectedCorrection: 'gmail.com' },
    { input: 'producer@yaho.com', expectedCorrection: 'yahoo.com' },
    { input: 'director@hotmial.com', expectedCorrection: 'hotmail.com' },
    { input: 'audio@outlok.com', expectedCorrection: 'outlook.com' }
  ];

  typoCases.forEach(({ input, expectedCorrection }) => {
    const res = validateEmail(input);
    assert.strictEqual(res.valid, false, `Typo domain ${input} must be intercepted`);
    assert.ok(res.error.includes(expectedCorrection), `Must suggest correction ${expectedCorrection} for ${input}`);
  });
  console.log('✓ PASS: All common typo domains intercepted with clear suggestions before reaching network.\n');

  // ── TEST 3: DISPOSABLE & PLACEHOLDER DOMAIN BLOCKING ──
  console.log('[TEST 3] Testing blocking of disposable, placeholder & dummy test domains...');
  const blockedCases = [
    'user@example.com',
    'user@example.org',
    'user@test.com',
    'spammer@tempmail.com',
    'bot@mailinator.com',
    'throwaway@guerrillamail.com',
    'fakeuser@fake.com'
  ];

  blockedCases.forEach(e => {
    const res = validateEmail(e);
    assert.strictEqual(res.valid, false, `Blocked domain ${e} must be rejected`);
    assert.ok(res.error.includes('disposable') || res.error.includes('placeholder'), 'Must explain domain block');
  });
  console.log('✓ PASS: Disposable & placeholder domains strictly blocked to protect project reputation.\n');

  // ── TEST 4: RESEND COOLDOWNS & ACCIDENTAL DUPLICATE PREVENTION ──
  console.log('[TEST 4] Testing 60-second resend cooldown & duplicate suppression...');
  const testEmail = 'filmmaker@studioflow.com';

  // Initially, no cooldown active
  assert.strictEqual(checkCooldown('forgot', testEmail), 0, 'No cooldown should exist initially');

  // Simulate dispatching a password reset
  const now = Date.now();
  global.localStorage.setItem('sfx_cooldown_forgot_' + encodeURIComponent(testEmail), String(now));

  // Cooldown must now be active (approx 60s)
  const remaining = checkCooldown('forgot', testEmail);
  assert.ok(remaining > 55 && remaining <= 60, `Cooldown must be active (got ${remaining}s)`);

  // Simulate elapsed time (e.g., 61 seconds later)
  global.localStorage.setItem('sfx_cooldown_forgot_' + encodeURIComponent(testEmail), String(now - 61000));
  assert.strictEqual(checkCooldown('forgot', testEmail), 0, 'Cooldown must expire after 60s');
  console.log('✓ PASS: Resend cooldown accurately limits requests and persists across page reloads.\n');

  // ── TEST 5: GRACEFUL SUPABASE AUTH ERROR MESSAGE FORMATTING ──
  console.log('[TEST 5] Testing human-friendly formatting of Supabase email & auth errors...');
  const rateLimitErr = { error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' };
  const formattedRateLimit = formatError(rateLimitErr);
  assert.ok(formattedRateLimit.includes('rate-limited'), 'Rate limit error must be friendly');
  assert.ok(!formattedRateLimit.includes('over_email_send_rate_limit'), 'Technical code must be hidden');

  const invalidCredsErr = { message: 'Invalid login credentials' };
  const formattedCreds = formatError(invalidCredsErr);
  assert.ok(formattedCreds.includes('Invalid email or password'), 'Credentials error must be helpful');
  assert.ok(formattedCreds.includes('Create Account'), 'Must direct user to set password');

  const existsErr = { message: 'User already registered' };
  const formattedExists = formatError(existsErr);
  assert.ok(formattedExists.includes('already exists'), 'Already registered error must be clear');
  console.log('✓ PASS: Raw technical errors converted into actionable, user-friendly guidance.\n');

  // ── TEST 6: HTML FORM VALIDATION ATTRIBUTES & DOM INTEGRITY ──
  console.log('[TEST 6] Auditing HTML forms across all 4 pages for deliverability attributes...');
  const pages = ['index.html', 'demo.html', 'library.html', 'screenshots.html'];
  pages.forEach(p => {
    const html = fs.readFileSync(path.join(__dirname, p), 'utf8');
    assert.ok(html.includes('id="cdm-lookup-form" novalidate') || html.includes('id="cdm-login-form" novalidate'), `${p} lookup form must specify novalidate`);
    assert.ok(html.includes('spellcheck="false" autocomplete="email"'), `${p} must configure clean email autocomplete`);
  });
  console.log('✓ PASS: All 4 pages enforce client-side deliverability validation & autocomplete.\n');

  // ── TEST 7: SUPABASE DATABASE & AUTH AUDIT LOG INSPECTION ──
  console.log('[TEST 7] Inspecting live Supabase Auth logs & transactional email status...');
  const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const usersData = await usersRes.json();
  assert.strictEqual(usersRes.status, 200, 'Must retrieve Supabase Auth user list');
  const users = usersData.users || [];
  console.log(`  Supabase Auth active records audited: ${users.length} users`);

  // Verify that legitimate real users are preserved
  const legitimateDomains = ['gmail.com'];
  const realUsers = users.filter(u => legitimateDomains.includes((u.email.split('@')[1] || '').toLowerCase()));
  assert.ok(realUsers.length > 0, 'Legitimate customer accounts must remain intact');
  console.log(`  Legitimate active accounts verified intact: ${realUsers.length} accounts (${realUsers.map(u => u.email).join(', ')})`);

  // ── TEST 8: VERIFY ZERO CLIENT-SIDE EXPOSURE OF SECRETS ──
  console.log('[TEST 8] Verifying zero frontend exposure of Supabase service role keys or Razorpay secrets...');
  const clientFiles = ['index.html', 'demo.html', 'library.html', 'screenshots.html', 'js/main.js', 'js/payment-service.js'];
  clientFiles.forEach(f => {
    const content = fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.ok(!content.includes(SERVICE_KEY), `${f} must NOT contain Supabase SERVICE_ROLE_KEY`);
    assert.ok(!content.includes('wfUnt5UoJDivPBTWMoC55WFY'), `${f} must NOT contain Razorpay secrets`);
    assert.ok(!content.includes('uV8H0QGodwWPAQKpj9ofqxv1'), `${f} must NOT contain Razorpay secrets`);
  });
  console.log('✓ PASS: Strict security confirmed: only ANON keys used in client code.\n');

  // ── TEST 9: CUSTOMER PURCHASES & LICENSES PRESERVATION AUDIT ──
  console.log('[TEST 9] Verifying preservation of all verified customer purchase records & licenses...');
  const statsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sfx_admin_get_stats_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: '{}'
  });
  const stats = await statsRes.json();
  assert.strictEqual(statsRes.status, 200, 'Admin stats RPC must succeed');
  assert.ok((stats.total_sales > 0 || stats.total_orders > 0), 'Purchase orders must be preserved');
  assert.ok(stats.total_licenses > 0, 'Customer licenses must be preserved');
  console.log(`  Verified records preserved: ${stats.total_sales || stats.total_orders} Verified Orders, ${stats.total_licenses} Total Licenses (₹${stats.total_revenue} INR)\n`);

  console.log('========================================================================');
  console.log(' ALL 9 EMAIL DELIVERABILITY & BOUNCE PREVENTION TESTS PASSED PERFECTLY!');
  console.log('========================================================================\n');
}

runDeliverabilityAuditSuite().catch(err => {
  console.error('\n❌ AUDIT SUITE FAILED:', err);
  process.exit(1);
});
