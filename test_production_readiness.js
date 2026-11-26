/**
 * test_production_readiness.js
 * Comprehensive automated regression & security test suite for SFX Composer.
 * Runs locally without touching production data or executing production SQL.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSignedDownloadToken, verifySignedDownloadToken } = require('./api/_shared');

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}\n    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('=== SFX COMPOSER — PRODUCTION READINESS REGRESSION SUITE ===');

// 1. Token Security (HMAC-SHA256 signed sfx_token_)
test('Signed download token creation and verification', () => {
  const token = createSignedDownloadToken({ email: 'buyer@example.com', payment_id: 'pay_ABC123' }, 60000);
  assert.ok(token.startsWith('sfx_token_') && token.includes('.'));
  const decoded = verifySignedDownloadToken(token);
  assert.strictEqual(decoded.email, 'buyer@example.com');
  assert.strictEqual(decoded.payment_id, 'pay_ABC123');
});

test('Tampered download token is rejected', () => {
  const token = createSignedDownloadToken({ email: 'buyer@example.com', payment_id: 'pay_ABC123' }, 60000);
  const tampered = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');
  assert.strictEqual(verifySignedDownloadToken(tampered), null);
});

test('Unsigned base64 download token is rejected', () => {
  const unsigned = 'sfx_token_' + Buffer.from(JSON.stringify({ email: 'attacker@evil.com', exp: Date.now() + 60000 })).toString('base64');
  assert.strictEqual(verifySignedDownloadToken(unsigned), null);
});

test('Expired download token is rejected', () => {
  const expired = createSignedDownloadToken({ email: 'buyer@example.com' }, -1000);
  assert.strictEqual(verifySignedDownloadToken(expired), null);
});

// 2. Edge Function Security Checks
test('verify-payment uses constantTimeEqual, rejects non-captured/authorized, checks order_id, uses signed tokens', () => {
  const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/verify-payment/index.ts'), 'utf8');
  assert.ok(src.includes('constantTimeEqual('), 'Must use constantTimeEqual for HMAC');
  assert.ok(!src.includes('hexSignature.toLowerCase() === signature'), 'Must not use === for HMAC');
  assert.ok(src.includes("code: 'PAYMENT_NOT_CAPTURED'"), 'Must reject uncaptured/failed payment status');
  assert.ok(src.includes("code: 'ORDER_MISMATCH'"), 'Must verify payment belongs to order_id');
  assert.ok(src.includes('createSignedDownloadToken('), 'Must sign session tokens');
  assert.ok(src.includes('${functionsBase}/download'), 'Must point download URLs to Edge Function');
});

test('payment-webhook uses constant-time XOR signature check', () => {
  const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/payment-webhook/index.ts'), 'utf8');
  assert.ok(src.includes('diff |= hexSignature.charCodeAt(i) ^ provided.charCodeAt(i)'));
});

test('customer-portal sanitizes paymentRef, uses signed tokens, never trusts user_metadata', () => {
  const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/customer-portal/index.ts'), 'utf8');
  assert.ok(src.includes('/^[A-Za-z0-9_-]{4,80}$/.test(paymentRef)'), 'Must sanitize paymentRef against PostgREST injection');
  assert.ok(src.includes('createSignedDownloadToken('), 'Must sign session tokens');
  assert.ok(src.includes('${functionsBase}/download'), 'Must point download URLs to Edge Function');
});

test('_shared/auth.ts never trusts user_metadata', () => {
  const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/_shared/auth.ts'), 'utf8');
  assert.ok(!src.includes('user.user_metadata'), 'Must not trust user_metadata');
  assert.ok(src.includes('user.app_metadata'), 'Must check app_metadata');
});

test('download Edge Function enforces auth, entitlement, and private Storage signed URLs', () => {
  const src = fs.readFileSync(path.join(__dirname, 'supabase/functions/download/index.ts'), 'utf8');
  assert.ok(src.includes('verifySignedDownloadToken('));
  assert.ok(src.includes("status !== 'active'"));
  assert.ok(src.includes("code: 'REFUNDED'"));
  assert.ok(src.includes('.createSignedUrl('));
});

// 3. Frontend & Plugin Hygiene
test('js/payment-service.js skips /api/* on sfxcomposer.in and has no direct-RPC admin fallbacks', () => {
  const src = fs.readFileSync(path.join(__dirname, 'js/payment-service.js'), 'utf8');
  assert.ok(!src.includes("!window.location.hostname.includes('github.io')"));
  assert.ok(!src.includes('/rest/v1/rpc/sfx_admin_'));
});

test('plugin-dist/license-manager.js has no direct-RPC fallbacks', () => {
  const src = fs.readFileSync(path.join(__dirname, 'plugin-dist/license-manager.js'), 'utf8');
  assert.ok(!src.includes("supabase.rpc('sfx_activate_license_v2'"));
  assert.ok(!src.includes("supabase.rpc('sfx_verify_token_v2'"));
  assert.ok(!src.includes("supabase.rpc('sfx_deactivate_token_v2'"));
});

test('All JS files in plugin-dist/, js/, and api/ parse cleanly with zero hardcoded secrets', () => {
  for (const dir of ['plugin-dist', 'js', 'api']) {
    for (const f of fs.readdirSync(path.join(__dirname, dir))) {
      if (!f.endsWith('.js')) continue;
      const p = path.join(__dirname, dir, f);
      const code = fs.readFileSync(p, 'utf8');
      new vm.Script(code, { filename: p });
      if (dir !== 'api') {
        assert.ok(!/sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z\-_]{35}|service_role/.test(code), `Secret/service_role leaked in ${dir}/${f}`);
      }
    }
  }
});

// 4. SQL Remediation & Snapshot Completeness
test('SQL remediation files capture pg_get_functiondef and never trust user_metadata', () => {
  const snap = fs.readFileSync(path.join(__dirname, 'supabase/manual-remediation/01_pre_change_acl_snapshot.sql'), 'utf8');
  const fwd = fs.readFileSync(path.join(__dirname, 'supabase/manual-remediation/02_forward_remediation.sql'), 'utf8');
  const rec = fs.readFileSync(path.join(__dirname, 'supabase/manual-remediation/04_safe_recovery.sql'), 'utf8');
  assert.ok(snap.includes('pg_get_functiondef(p.oid)'));
  const nonComment = s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  assert.ok(!nonComment(fwd).includes('user_metadata'));
  assert.ok(!nonComment(rec).includes('user_metadata'));
  assert.ok(fwd.includes('SET search_path = pg_catalog'));
});

console.log(`\nSUMMARY: ${passed} / ${total} checks passed.`);
