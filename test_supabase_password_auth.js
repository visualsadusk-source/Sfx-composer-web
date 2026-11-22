/**
 * test_supabase_password_auth.js
 * (Updated to verify simplification of Customer Dashboard: License ID Storage & Retrieval Only)
 * 
 * Verifies that:
 * 1. Password creation, password reset, account registration and OTP UI are removed.
 * 2. Simplified customer lookup interface ('My License & Downloads') is active.
 * 3. Executes the full simplified customer dashboard verification suite.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('========================================================================');
console.log(' SFX COMPOSER — PASSWORD AUTH DEPRECATION & SIMPLIFICATION VERIFICATION');
console.log('========================================================================\n');

// 1. Check all HTML pages for complete absence of password forms & OTP
const htmlFiles = ['index.html', 'demo.html', 'screenshots.html', 'library.html'];
const removedElements = [
  'cdm-password-input',
  'cdm-toggle-password-btn',
  'cdm-link-forgot-password',
  'cdm-register-form',
  'cdm-forgot-form',
  'cdm-recovery-form',
  'cdm-otp-step',
  'cdm-otp-input',
  'cdm-btn-verify-otp',
  'cdm-btn-resend-otp',
  'signInWithOtp',
  'verifyOtp'
];

htmlFiles.forEach(file => {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
  removedElements.forEach(elem => {
    assert.ok(!content.includes(elem), `${file} must NOT contain removed auth element "${elem}"`);
  });
  assert.ok(content.includes('My License &amp; Downloads') || content.includes('My License & Downloads'), `${file} must contain 'My License & Downloads'`);
  assert.ok(content.includes('cdm-lookup-form'), `${file} must contain 'cdm-lookup-form'`);
  assert.ok(content.includes('cdm-email-input'), `${file} must contain 'cdm-email-input'`);
  assert.ok(content.includes('cdm-btn-find-license'), `${file} must contain 'cdm-btn-find-license'`);
});
console.log('✓ PASS: All 4 HTML pages verified clean of password forms & equipped with simplified lookup UI.\n');

// 2. Run test_simplified_customer_dashboard.js
console.log('Running test_simplified_customer_dashboard.js...\n');
const result = spawnSync('node', ['test_simplified_customer_dashboard.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

assert.strictEqual(result.status, 0, 'test_simplified_customer_dashboard.js must pass with exit code 0');
console.log('\n✓ PASS: Verified password authentication replaced with simplified license ID retrieval.');
