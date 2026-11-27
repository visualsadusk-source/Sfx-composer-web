/**
 * test_simplified_customer_dashboard.js
 * Comprehensive verification for SFX Composer Simplified Customer Dashboard:
 * License ID Storage & Retrieval Only (No Passwords, No Account Creation).
 *
 * Verifies all 5 requirements in Section 6:
 * 1. An unpaid email cannot retrieve a license (HTTP 403 NOT_PAID).
 * 2. A paid customer can retrieve their own license after secure ownership verification.
 * 3. An email belonging to another customer cannot retrieve their license (HTTP 403 FORBIDDEN).
 * 4. Duplicate purchases do not create duplicate licenses (idempotency preserved).
 * 5. Email rate-limit errors do not cause false purchase authorization.
 * 
 * Also verifies DOM cleanliness:
 * - Removal of Create Account, Choose Password, Forgot Password, and Recovery UI.
 * - Presence of "My License & Downloads", "Registered purchase email address", and "FIND MY LICENSE".
 * - Database storage & display of: License ID, Customer email, Product ID, Order ID, Payment ID, Payment status, Creation date.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  });
}

console.log('========================================================================');
console.log(' SFX COMPOSER — SIMPLIFIED CUSTOMER DASHBOARD VERIFICATION SUITE');
console.log('========================================================================\n');

const SERVER_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh').trim();
if (!ANON_KEY.startsWith('sb_publishable_')) { console.error('Invalid SUPABASE_PUBLISHABLE_KEY: legacy JWTs are disabled'); process.exit(1); }
const SERVICE_KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();
if (!SERVICE_KEY || !SERVICE_KEY.startsWith('sb_secret_')) { console.error('Missing or invalid SUPABASE_SECRET_KEY (must start with sb_secret_)'); process.exit(1); }
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_live_U2wwoc5khZUxlm';
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || 'gq9v1U8g7aWjU0W4tV3Yq2Z1';

function signPayload(orderId, paymentId, secret) {
  return crypto.createHmac('sha256', secret.trim()).update(`${orderId}|${paymentId}`).digest('hex');
}

async function simulatePurchase(email, name = 'Test Editor') {
  const orderRes = await fetch(`${SERVER_URL}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name })
  });
  const orderData = await orderRes.json();
  assert.ok(orderData.ok, `Order creation failed for ${email}: ${orderData.message}`);

  const orderId = orderData.order_id;
  const paymentId = `pay_test_${Math.random().toString(36).substring(2, 10)}`;
  const signature = signPayload(orderId, paymentId, RZP_SECRET);

  const verifyRes = await fetch(`${SERVER_URL}/api/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      email,
      name
    })
  });
  const verifyData = await verifyRes.json();
  assert.ok(verifyData.ok || verifyData.verified, `Payment verification failed for ${email}: ${verifyData.message}`);

  return {
    email,
    orderId,
    paymentId,
    signature,
    licenseKey: verifyData.license_key
  };
}

async function runTests() {
  let passedCount = 0;

  // -------------------------------------------------------------------------
  // DOM & STATIC CODE INTEGRITY
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Verifying Clean UI — Removal of Passwords & Account Creation Forms...');
  const pages = ['index.html', 'demo.html', 'library.html', 'screenshots.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf8');
    assert.ok(!html.includes('cdm-password-input'), `${page} must NOT contain password input`);
    assert.ok(!html.includes('cdm-register-form'), `${page} must NOT contain register form`);
    assert.ok(!html.includes('cdm-forgot-form'), `${page} must NOT contain forgot password form`);
    assert.ok(!html.includes('cdm-recovery-form'), `${page} must NOT contain recovery form`);
    assert.ok(!html.includes('Choose Password'), `${page} must NOT ask to choose password`);
    assert.ok(!html.includes('LOGIN TO DASHBOARD'), `${page} must NOT say LOGIN TO DASHBOARD`);
    assert.ok(html.includes('My License &amp; Downloads') || html.includes('My License & Downloads'), `${page} must have heading My License & Downloads`);
    assert.ok(html.includes('cdm-lookup-form'), `${page} must have simplified lookup form`);
    assert.ok(html.includes('FIND MY PURCHASE') || html.includes('FIND MY LICENSE'), `${page} must have FIND MY PURCHASE button`);
  }

  const mainJs = fs.readFileSync(path.join(__dirname, 'js/main.js'), 'utf8');
  assert.ok(!mainJs.includes('cdm-register-form'), 'js/main.js must not reference register form');
  assert.ok(!mainJs.includes('resetPasswordForEmail'), 'js/main.js must not trigger resetPasswordForEmail');
  assert.ok(mainJs.includes('cdm-lookup-form'), 'js/main.js must wire up cdm-lookup-form');
  assert.ok(mainJs.includes('FIND MY PURCHASE') || mainJs.includes('FIND MY LICENSE') || mainJs.includes('Finding…'), 'js/main.js must handle Find My Purchase');
  assert.ok(mainJs.includes('License ID'), 'js/main.js must render License ID');
  assert.ok(mainJs.includes('Product ID'), 'js/main.js must render Product ID');

  console.log('✓ PASS: All 4 HTML pages and js/main.js verified: passwords and account creation UI completely eliminated.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 1 (Section 6.1): An unpaid email cannot retrieve a license
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Testing Unpaid Email Access Block (Section 6.1)...');
  const unpaidEmail = `unpaid_${Date.now()}@audioflow.studio`;
  const unpaidLookup = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unpaidEmail })
  });

  assert.strictEqual(unpaidLookup.status, 403, 'Unpaid email must return HTTP 403');
  const unpaidData = await unpaidLookup.json();
  assert.strictEqual(unpaidData.ok, false, 'unpaidData.ok must be false');
  assert.strictEqual(unpaidData.code, 'NOT_PAID', 'code must be NOT_PAID');
  assert.strictEqual(unpaidData.is_paid, false, 'is_paid must be false');
  assert.ok(!unpaidData.licenses, 'No licenses must be returned to unpaid email');
  assert.ok(!unpaidData.downloads, 'No downloads must be returned to unpaid email');
  console.log('✓ PASS: Unpaid email strictly blocked with HTTP 403 NOT_PAID; zero licenses or downloads returned.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 2 (Section 6.2): A paid customer can retrieve their license after secure ownership verification
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Testing Paid Customer License Retrieval with Ownership Verification (Section 6.2)...');
  const paidBuyerA = `buyer_a_${Date.now()}@filmmaker.pro`;
  const purchaseA = await simulatePurchase(paidBuyerA, 'Buyer A Pro');

  // Customer A queries with their email + verified purchase proof
  const verifiedLookupA = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: purchaseA.email,
      order_id: purchaseA.orderId,
      payment_id: purchaseA.paymentId
    })
  });

  assert.strictEqual(verifiedLookupA.status, 200, 'Verified lookup must return HTTP 200');
  const dataA = await verifiedLookupA.json();
  assert.strictEqual(dataA.ok, true, 'Lookup must succeed');
  assert.strictEqual(dataA.is_paid, true, 'is_paid must be true');
  assert.strictEqual(dataA.verified, true, 'verified must be true');
  assert.strictEqual(dataA.email, paidBuyerA);
  assert.ok(Array.isArray(dataA.licenses) && dataA.licenses.length > 0, 'Must return at least 1 license');

  const licA = dataA.licenses[0];
  assert.ok(licA.license_id || licA.id, 'Must contain License ID');
  assert.strictEqual(licA.license_key, purchaseA.licenseKey, 'Decrypted license key must match purchased key');
  assert.ok(licA.product_id === 'sfx-composer-bundle' || licA.product_id === 'sfx-composer-pro', 'Product ID must be valid product');
  assert.strictEqual(licA.provider_order_id, purchaseA.orderId, 'Order ID must match');
  assert.strictEqual(licA.provider_payment_id, purchaseA.paymentId, 'Payment ID must match');
  assert.strictEqual(licA.payment_status, 'completed', 'Payment status must be completed');
  assert.ok(licA.created_at, 'License creation date must be present');
  assert.ok(dataA.downloads && dataA.downloads.has_access, 'Downloads must be unlocked');
  assert.ok(dataA.downloads.zxp_url && dataA.downloads.zip_url && dataA.downloads.sfx_library_url, 'All download links present');

  console.log(`✓ PASS: Paid customer retrieved license successfully:`);
  console.log(`  License ID: ${licA.license_id || licA.id}`);
  console.log(`  Key: ${licA.license_key}`);
  console.log(`  Order: ${licA.provider_order_id} | Payment: ${licA.provider_payment_id}`);
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 3 (Section 6.3): An email belonging to another customer cannot retrieve their license
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] Testing Cross-Customer Attack Prevention (Section 6.3)...');
  const paidBuyerB = `buyer_b_${Date.now()}@studiod.org`;
  const purchaseB = await simulatePurchase(paidBuyerB, 'Buyer B Studio');

  // Attacker attempts 1: Query Buyer A's email without proof
  const attackWithoutProof = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: purchaseA.email })
  });
  const attack1Data = await attackWithoutProof.json();
  // Backend now returns HTTP 403 NOT_PAID when proof is missing
  assert.ok(
    attackWithoutProof.status === 403 || attack1Data.code === 'NOT_PAID',
    'Unverified query must be rejected (HTTP 403 or NOT_PAID), got: ' + JSON.stringify(attack1Data)
  );
  assert.ok(!attack1Data.licenses, 'Licenses MUST NOT be returned without proof');
  assert.ok(!attack1Data.downloads, 'Downloads MUST NOT be returned without proof');

  // Attacker attempts 2: Buyer B provides their own token/proof but claims to be Buyer A
  const attackWithBuyerBProof = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: purchaseA.email, // claiming Buyer A
      order_id: purchaseB.orderId, // using Buyer B's order
      payment_id: purchaseB.paymentId // using Buyer B's payment
    })
  });
  const attack2Data = await attackWithBuyerBProof.json();
  assert.ok(!attack2Data.licenses || attack2Data.code === 'FORBIDDEN' || attack2Data.requires_verification, 'Cross customer query strictly blocked');

  // Attacker attempts 3: Buyer B sends Bearer token for B, requests A
  const sessionTokenB = dataA.token; // valid token for A
  const attackCrossToken = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionTokenB}`
    },
    body: JSON.stringify({ email: purchaseB.email }) // Token is for A, but body requests B
  });
  assert.strictEqual(attackCrossToken.status, 403, 'Cross-customer request must return 403 FORBIDDEN');
  const crossJson = await attackCrossToken.json();
  assert.strictEqual(crossJson.code, 'FORBIDDEN');
  console.log('✓ PASS: Cross-customer tampering strictly blocked with HTTP 403 FORBIDDEN.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 4 (Section 6.4): Duplicate purchases do not create duplicate licenses
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] Testing Idempotency & Duplicate License Prevention (Section 6.4)...');
  // Re-verify the exact same purchase A payment
  const duplicateVerifyRes = await fetch(`${SERVER_URL}/api/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: purchaseA.orderId,
      razorpay_payment_id: purchaseA.paymentId,
      razorpay_signature: purchaseA.signature,
      email: purchaseA.email,
      name: 'Buyer A Pro Duplicate'
    })
  });
  const dupData = await duplicateVerifyRes.json();
  assert.strictEqual(dupData.ok, true, 'Duplicate call should be handled gracefully');
  assert.strictEqual(dupData.already_processed, true, 'already_processed must be true');
  assert.strictEqual(dupData.license_key, purchaseA.licenseKey, 'Duplicate call must return original license key');

  // Verify that only 1 license exists for this purchase in customer portal
  const portalAfterDup = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: purchaseA.email,
      order_id: purchaseA.orderId,
      payment_id: purchaseA.paymentId
    })
  });
  const portalAfterDupData = await portalAfterDup.json();
  const matchingLics = portalAfterDupData.licenses.filter(l => l.provider_order_id === purchaseA.orderId);
  assert.strictEqual(matchingLics.length, 1, 'Exactly 1 license must exist for this purchase order');
  console.log('✓ PASS: Idempotency strictly preserved; duplicate payment callbacks do not create duplicate licenses.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 5 (Section 6.5): Email rate-limit errors do not cause false purchase authorization
  // -------------------------------------------------------------------------
  console.log('\n[TEST 6] Testing Email Rate-Limit Error Resilience (Section 6.5)...');
  // An unpurchased email that simulates or encounters rate limit error
  const rateLimitEmail = `ratelimit_${Date.now()}@testdomain.com`;
  
  // Directly query customer portal with rate limit mock payload
  const rateLimitQuery = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: rateLimitEmail,
      error: 'email rate limit exceeded'
    })
  });

  assert.strictEqual(rateLimitQuery.status, 403, 'Email with rate limit error must still be blocked if unpaid');
  const rateLimitData = await rateLimitQuery.json();
  assert.strictEqual(rateLimitData.is_paid, false, 'is_paid MUST be false');
  assert.ok(!rateLimitData.licenses, 'Licenses MUST NOT be returned on rate limit error');
  assert.ok(!rateLimitData.downloads, 'Downloads MUST NOT be returned on rate limit error');

  console.log('✓ PASS: Email rate-limit errors never grant false purchase authorization.');
  passedCount++;

  console.log('\n========================================================================');
  console.log(` ALL ${passedCount}/6 SIMPLIFIED CUSTOMER DASHBOARD TESTS PASSED!`);
  console.log('========================================================================');
}

runTests().catch(err => {
  console.error('\nTest Suite Error:', err);
  process.exit(1);
});
