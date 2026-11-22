/**
 * test_access_control_security.js
 * Comprehensive Automated Security Test Suite for Purchase & Download Access Control.
 * 
 * Verifies all 9 mandatory security scenarios (Tests A - I):
 * - Test A: Unauthenticated user cannot access dashboard or downloads (HTTP 401)
 * - Test B: Authenticated unpaid user sees dashboard but downloads & licenses are locked (HTTP 403)
 * - Test C: Authenticated paid user sees dashboard and can access downloads & licenses (HTTP 200)
 * - Test D: Client-side DOM/localStorage tampering cannot bypass download protection (HTTP 403)
 * - Test E: Direct URL access to download files without auth/payment returns 401 or 403
 * - Test F: User A cannot access User B's licenses or downloads (Cross-customer isolation)
 * - Test G: Tampered payment callback cannot grant access without server-side verification
 * - Test H: Duplicate payment callback does not create duplicate licenses (Idempotent)
 * - Test I: Refunded/revoked user loses download and license access immediately
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SERVER_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzMxMTQsImV4cCI6MjExMDc0OTExNH0.FXKso4hkmUYcl_FfjG4GnHxwyCr09j5DkJ6ak1B2auY';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTE3MzExNCwiZXhwIjoyMTEwNzQ5MTE0fQ.Y6GbsUSzkh4b-Uze1JiLSie6PEb8SfG6xg36P4SPrNA';

// Read local .env for Razorpay secret
const envPath = path.join(__dirname, '.env');
let RAZORPAY_KEY_SECRET = 'uV8H0QGodwWPAQKpj9ofqxv1';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('RAZORPAY_KEY_SECRET=')) {
      const val = trimmed.substring('RAZORPAY_KEY_SECRET='.length).trim();
      if (val) RAZORPAY_KEY_SECRET = val;
    }
  });
}

function computeHmacSha256(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function registerTestUser(email, password) {
  // 1. Create verified user via Supabase Auth Admin API
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      email: email,
      password: password,
      email_confirm: true
    })
  });
  const createData = await createRes.json();

  if (createData && createData.msg && createData.msg.includes('already exists')) {
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    const listData = await listRes.json();
    const existing = (listData.users || []).find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify({ password: password, email_confirm: true })
      });
    }
  }

  // 2. Sign in with password to obtain genuine JWT token
  const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();
  return { token: loginData.access_token, user: loginData.user };
}

async function completePayment(email, name, orderId, paymentId) {
  const signature = computeHmacSha256(`${orderId}|${paymentId}`, RAZORPAY_KEY_SECRET);
  const res = await fetch(`${SERVER_URL}/api/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      email: email,
      name: name
    })
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('  SFX COMPOSER — ACCESS CONTROL & SECURITY TEST SUITE (A - I)');
  console.log('================================================================\n');

  let passedCount = 0;
  const totalCount = 9;

  // -------------------------------------------------------------------------
  // TEST A: Unauthenticated user cannot access dashboard or downloads
  // -------------------------------------------------------------------------
  console.log('[TEST A] Unauthenticated Access Protection');
  try {
    // 1. Download endpoint without token
    const dlRes = await fetch(`${SERVER_URL}/api/download?type=zxp`);
    assert.strictEqual(dlRes.status, 401, 'Unauthenticated /api/download must return 401');
    const dlJson = await dlRes.json();
    assert.strictEqual(dlJson.code, 'UNAUTHENTICATED');

    // 2. Direct static download attempt
    const staticRes = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.4.0.zxp`);
    assert.strictEqual(staticRes.status, 401, 'Unauthenticated /downloads/*.zxp must return 401');

    // 3. Customer portal without token
    const portalRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY }
    });
    assert.strictEqual(portalRes.status, 401, 'Unauthenticated customer-portal must return 401');

    console.log('  ✓ Test A PASSED: Unauthenticated requests strictly rejected with HTTP 401');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test A FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST B: Authenticated unpaid user sees dashboard but downloads & licenses are locked
  // -------------------------------------------------------------------------
  console.log('\n[TEST B] Authenticated Unpaid User Access Isolation');
  const unpaidEmail = `unpaid_${Date.now()}@testaccess.com`;
  const unpaidPass = 'TestUnpaidPass!123';
  let unpaidToken = '';

  try {
    const unpaidAuth = await registerTestUser(unpaidEmail, unpaidPass);
    unpaidToken = unpaidAuth.token;
    assert.ok(unpaidToken, 'Unpaid user must receive Supabase JWT token upon signup');

    // 1. Customer portal for unpaid user
    const portalRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${unpaidToken}`
      }
    });
    const portalData = await portalRes.json();
    assert.strictEqual(portalRes.status, 200, 'Portal should respond 200 for authenticated user');
    assert.ok(!portalData.is_paid, 'portal.is_paid MUST be falsy (unpaid) for unpaid user');
    assert.deepStrictEqual(portalData.licenses, [], 'portal.licenses MUST be empty for unpaid user');
    assert.ok(!portalData.downloads, 'portal.downloads MUST be falsy (locked) for unpaid user');

    // 2. Unpaid user attempting download via /api/download
    const dlZxpRes = await fetch(`${SERVER_URL}/api/download?type=zxp&token=${encodeURIComponent(unpaidToken)}`);
    assert.strictEqual(dlZxpRes.status, 403, 'Unpaid user download must return HTTP 403 Forbidden');
    const dlZxpJson = await dlZxpRes.json();
    assert.strictEqual(dlZxpJson.code, 'FORBIDDEN');

    const dlLibRes = await fetch(`${SERVER_URL}/api/download?type=sfx-library&token=${encodeURIComponent(unpaidToken)}`);
    assert.strictEqual(dlLibRes.status, 403, 'Unpaid user SFX library download must return HTTP 403 Forbidden');

    // 3. Verify HTML DOM templates do not contain static download links
    const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="cdm-account-status-banner"'), 'index.html must contain cdm-account-status-banner');
    assert.ok(indexHtml.includes('id="cdm-downloads-container"'), 'index.html must contain cdm-downloads-container');
    assert.ok(!indexHtml.includes('href="/downloads/sfx-composer-pro-v2.4.0.zxp" download class="sfx-button'), 'No static download links inside dashboard');

    console.log('  ✓ Test B PASSED: Authenticated unpaid user has locked downloads (HTTP 403) and no licenses');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test B FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST C: Authenticated paid user sees dashboard and can access downloads & licenses
  // -------------------------------------------------------------------------
  console.log('\n[TEST C] Authenticated Paid User Access Verification');
  const paidEmail = `paid_${Date.now()}@testaccess.com`;
  const paidPass = 'TestPaidPass!123';
  let paidToken = '';
  const orderId = `order_${Date.now()}`;
  const paymentId = `pay_${Date.now()}`;

  try {
    const paidAuth = await registerTestUser(paidEmail, paidPass);
    paidToken = paidAuth.token;
    assert.ok(paidToken, 'Paid user must receive Supabase JWT token');

    // Perform verified purchase
    const payResult = await completePayment(paidEmail, 'Paid Customer', orderId, paymentId);
    assert.strictEqual(payResult.status, 200, 'Payment verification must succeed with 200');
    assert.strictEqual(payResult.data.verified, true);
    assert.ok(payResult.data.license_key, 'Must generate license key');

    // Verify paid user download gateway
    const dlZxpRes = await fetch(`${SERVER_URL}/api/download?type=zxp&token=${encodeURIComponent(paidToken)}`);
    assert.strictEqual(dlZxpRes.status, 200, 'Paid user ZXP download must succeed with HTTP 200');
    const zxpBuffer = await dlZxpRes.arrayBuffer();
    assert.ok(zxpBuffer.byteLength > 100000, `Must receive binary installer file (got ${zxpBuffer.byteLength} bytes)`);

    const dlLibRes = await fetch(`${SERVER_URL}/api/download?type=sfx-library&format=json&token=${encodeURIComponent(paidToken)}`, {
      headers: { 'Accept': 'application/json' }
    });
    assert.strictEqual(dlLibRes.status, 200, 'Paid user SFX Library delivery must succeed with HTTP 200');
    const libJson = await dlLibRes.json();
    assert.strictEqual(libJson.has_access, true);
    assert.ok(libJson.download_url.includes('drive.google.com'), 'Must receive authorized Google Drive URL');

    console.log('  ✓ Test C PASSED: Authenticated paid user successfully unlocks licenses and downloads (HTTP 200)');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test C FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST D: Client-side DOM / localStorage tampering cannot bypass download protection
  // -------------------------------------------------------------------------
  console.log('\n[TEST D] Client-Side Tampering Resilience');
  try {
    // Attacker crafts fake localStorage: { is_paid: true, has_access: true }
    // Attacker modifies DOM to insert <a href="/api/download?type=zxp&token=unpaidToken">
    // Server independently validates entitlement against database and memory store
    const tamperRes = await fetch(`${SERVER_URL}/api/download?type=zxp&token=${encodeURIComponent(unpaidToken)}`, {
      headers: {
        'X-Client-Spoofed-Role': 'paid',
        'X-Client-Paid-Status': 'true'
      }
    });
    assert.strictEqual(tamperRes.status, 403, 'Server gateway MUST reject client-side spoofing with 403');
    const tamperJson = await tamperRes.json();
    assert.strictEqual(tamperJson.code, 'FORBIDDEN');

    console.log('  ✓ Test D PASSED: Client-side tampering completely rejected by server-side authorization');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test D FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST E: Direct URL access to download files without auth/payment returns 401 or 403
  // -------------------------------------------------------------------------
  console.log('\n[TEST E] Direct File Path Protection');
  try {
    // Direct URL to .zxp
    const directZxp = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.4.0.zxp`);
    assert.strictEqual(directZxp.status, 401, 'Direct /downloads/ access without auth must return 401');

    // Direct URL to .zip
    const directZip = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.4.0.zip`);
    assert.strictEqual(directZip.status, 401, 'Direct /downloads/ access without auth must return 401');

    // Direct URL with invalid token
    const directBogus = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.4.0.zxp?token=bogus_token_12345`);
    assert.strictEqual(directBogus.status, 401, 'Direct /downloads/ access with invalid token must return 401');

    // Direct URL with unpaid valid token
    const directUnpaid = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.4.0.zxp?token=${encodeURIComponent(unpaidToken)}`);
    assert.strictEqual(directUnpaid.status, 403, 'Direct /downloads/ access with unpaid token must return 403');

    console.log('  ✓ Test E PASSED: Direct URL paths are strictly gated by server gateway (HTTP 401 / 403)');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test E FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST F: User A cannot access User B's licenses or downloads
  // -------------------------------------------------------------------------
  console.log('\n[TEST F] Cross-Customer Isolation');
  try {
    // User B (unpaid) tries to request User A's (paid) data from customer-portal
    const crossRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${unpaidToken}`
      },
      body: JSON.stringify({
        email: paidEmail // User B claims to be User A
      })
    });
    assert.strictEqual(crossRes.status, 403, 'Cross-customer request MUST be rejected with HTTP 403 Forbidden');
    const crossJson = await crossRes.json();
    assert.strictEqual(crossJson.code, 'FORBIDDEN');
    assert.ok(crossJson.message.includes('belonging to another customer'));

    console.log('  ✓ Test F PASSED: Cross-customer tampering strictly blocked (HTTP 403 Forbidden)');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test F FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST G: Tampered payment callback cannot grant access without server-side verification
  // -------------------------------------------------------------------------
  console.log('\n[TEST G] Payment Signature Tampering Prevention');
  try {
    const fakeOrderId = `order_fake_${Date.now()}`;
    const fakePayId = `pay_fake_${Date.now()}`;
    const fakeSignature = 'd41d8cd98f00b204e9800998ecf8427e00000000000000000000000000000000'; // Bogus hash

    const fakePayRes = await fetch(`${SERVER_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: fakeOrderId,
        razorpay_payment_id: fakePayId,
        razorpay_signature: fakeSignature,
        email: 'attacker@example.com'
      })
    });
    assert.strictEqual(fakePayRes.status, 400, 'Tampered payment callback must return HTTP 400 Bad Request');
    const fakeJson = await fakePayRes.json();
    assert.strictEqual(fakeJson.code, 'INVALID_SIGNATURE');

    console.log('  ✓ Test G PASSED: Tampered Razorpay callback rejected with HTTP 400; no entitlement created');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test G FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST H: Duplicate payment callback does not create duplicate licenses (Idempotent)
  // -------------------------------------------------------------------------
  console.log('\n[TEST H] Duplicate Payment Idempotency');
  try {
    // Send the exact same verified payment payload from Test C again
    const dupRes = await completePayment(paidEmail, 'Paid Customer', orderId, paymentId);
    assert.strictEqual(dupRes.status, 200, 'Duplicate payment call must return 200');
    assert.strictEqual(dupRes.data.already_processed, true, 'Must indicate already_processed: true');
    assert.ok(dupRes.data.license_key, 'Must return existing license key');

    console.log('  ✓ Test H PASSED: Duplicate payment callbacks are handled idempotently without duplicate records');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test H FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST I: Refunded/revoked user loses download and license access immediately
  // -------------------------------------------------------------------------
  console.log('\n[TEST I] Refund & Revocation Immediate Access Cutoff');
  try {
    // 1. Process administrative refund / revocation for the paid customer
    const refundRes = await fetch(`${SERVER_URL}/api/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`
      },
      body: JSON.stringify({
        email: paidEmail,
        order_id: orderId,
        payment_id: paymentId,
        reason: 'Customer requested refund'
      })
    });
    assert.strictEqual(refundRes.status, 200, 'Refund endpoint must return HTTP 200');
    const refundJson = await refundRes.json();
    assert.strictEqual(refundJson.ok, true);
    assert.strictEqual(refundJson.revoked, true);

    // 2. Immediately try to download using previous paid user's token
    const postRefundZxp = await fetch(`${SERVER_URL}/api/download?type=zxp&token=${encodeURIComponent(paidToken)}`);
    assert.strictEqual(postRefundZxp.status, 403, 'Post-refund download must immediately return HTTP 403 Forbidden');
    const postRefundZxpJson = await postRefundZxp.json();
    assert.strictEqual(postRefundZxpJson.code, 'FORBIDDEN');

    const postRefundLib = await fetch(`${SERVER_URL}/api/download?type=sfx-library&token=${encodeURIComponent(paidToken)}`);
    assert.strictEqual(postRefundLib.status, 403, 'Post-refund SFX Library download must return HTTP 403 Forbidden');

    console.log('  ✓ Test I PASSED: Refund immediately revokes download and license privileges (HTTP 403)');
    passedCount++;
  } catch (err) {
    console.error('  ✗ Test I FAILED:', err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  SECURITY TEST SUMMARY: ${passedCount} / ${totalCount} PASSED`);
  console.log('================================================================\n');

  if (passedCount === totalCount) {
    console.log('🎉 ALL 9 CRITICAL ACCESS CONTROL & SECURITY TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error(`❌ ${totalCount - passedCount} TESTS FAILED.`);
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
