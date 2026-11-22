/**
 * test_secure_purchase_access.js
 * Comprehensive automated verification for Final Requirement:
 * Secure Purchase-Only License & Download Access.
 * 
 * Verifies:
 * 1. Customer Input UI (Only two fields: Purchase Email Address + Razorpay Payment ID, and button: FIND MY LICENSE)
 * 2. Successful Payment Scenario: valid email + valid payment ID -> retrieves existing license key + authorized downloads.
 * 3. Unpaid Scenario: query with non-purchased email + payment ID -> HTTP 403, zero licenses or downloads.
 * 4. Pending Payment Scenario: order created on backend but not paid/completed -> HTTP 403, zero licenses or downloads.
 * 5. Failed / Tampered Payment Scenario: tampered signature callback rejected -> HTTP 403, zero licenses or downloads.
 * 6. Refunded / Revoked Scenario: order refunded via admin -> HTTP 403 REFUNDED, immediate cutoff.
 * 7. Mismatched Payment Scenario: Customer A email with Customer B payment ID -> HTTP 403, access denied.
 * 8. Email-Only Attempt: query with only email (no payment ID) -> HTTP 403, strictly rejected.
 * 9. Payment-ID-Only Attempt: query with only payment ID (no email) -> HTTP 403, strictly rejected.
 * 10. Existing License Retrieval Only: lookup NEVER creates a new license, only retrieves existing.
 * 11. Product Isolation:
 *     - Plugin only: shows plugin license + installers, hides 7GB library.
 *     - Library only: shows 7GB library download, hides plugin license.
 *     - Bundle: shows both.
 * 12. Rate limiting and abuse protection.
 * 13. Zero secret exposure in frontend files.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

// Load environment variables
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

const SERVER_URL = 'http://localhost:3000';
const RZP_SECRET = process.env.RAZORPAY_KEY_SECRET || 'gq9v1U8g7aWjU0W4tV3Yq2Z1';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTE3MzExNCwiZXhwIjoyMTEwNzQ5MTE0fQ.Y6GbsUSzkh4b-Uze1JiLSie6PEb8SfG6xg36P4SPrNA';

function signPayload(orderId, paymentId, secret) {
  return crypto.createHmac('sha256', secret.trim()).update(`${orderId}|${paymentId}`).digest('hex');
}

async function simulatePurchase(email, productId = 'sfx-composer-bundle', productName = 'SFX Composer Complete Bundle', amount = 19900) {
  const orderRes = await fetch(`${SERVER_URL}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: 'Test Editor', product_id: productId, product_name: productName, amount })
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
      name: 'Test Editor',
      product_id: productId,
      product_name: productName,
      amount
    })
  });
  const verifyData = await verifyRes.json();
  assert.ok(verifyData.ok, `Payment verification failed for ${email}: ${verifyData.message}`);

  return {
    email,
    orderId,
    paymentId,
    signature,
    licenseKey: verifyData.license_key
  };
}

async function runTests() {
  console.log('========================================================================');
  console.log(' SFX COMPOSER — SECURE PURCHASE-ONLY ACCESS VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passedCount = 0;

  // -------------------------------------------------------------------------
  // TEST 1: DOM & CUSTOMER INPUT FIELDS
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Verifying Customer Input: Only Purchase Email + Payment ID & FIND MY LICENSE button...');
  const pages = ['index.html', 'demo.html', 'library.html', 'screenshots.html'];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf8');

    // Forbidden UI
    assert.ok(!html.includes('cdm-password-input'), `${page} must NOT have password input`);
    assert.ok(!html.includes('cdm-register-form'), `${page} must NOT have register form`);
    assert.ok(!html.includes('cdm-forgot-form'), `${page} must NOT have forgot form`);

    // Required 2 inputs + 1 button
    assert.ok(html.includes('Purchase Email Address'), `${page} must have Purchase Email Address label`);
    assert.ok(html.includes('id="cdm-email-input"'), `${page} must have #cdm-email-input`);
    assert.ok(html.includes('Razorpay Payment ID'), `${page} must have Razorpay Payment ID label`);
    assert.ok(html.includes('id="cdm-payment-id-input"'), `${page} must have #cdm-payment-id-input`);
    assert.ok(html.includes('FIND MY LICENSE'), `${page} must have FIND MY LICENSE button`);
  }

  const mainJs = fs.readFileSync(path.join(__dirname, 'js/main.js'), 'utf8');
  assert.ok(mainJs.includes('cdm-payment-id-input'), 'js/main.js must wire up cdm-payment-id-input');
  assert.ok(mainJs.includes('FIND MY LICENSE'), 'js/main.js must handle FIND MY LICENSE');
  console.log('✓ PASS: All 4 HTML pages and js/main.js enforce the clean two-field customer interface.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 2: SUCCESSFUL PAYMENT SCENARIO
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Testing Successful Payment Scenario (Email + Payment ID)...');
  const buyerEmail = `editor_success_${Date.now()}@postproduction.pro`;
  const purchase = await simulatePurchase(buyerEmail, 'sfx-composer-bundle', 'SFX Composer Complete Bundle', 19900);

  const successRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: purchase.email,
      payment_id: purchase.paymentId
    })
  });

  assert.strictEqual(successRes.status, 200, 'Successful purchase query must return HTTP 200');
  const successJson = await successRes.json();
  assert.strictEqual(successJson.ok, true, 'ok must be true');
  assert.strictEqual(successJson.is_paid, true, 'is_paid must be true');
  assert.strictEqual(successJson.verified, true, 'verified must be true');
  assert.strictEqual(successJson.email, buyerEmail);
  assert.strictEqual(successJson.payment_id, purchase.paymentId);

  // Verify license key and copy button readiness
  assert.ok(successJson.licenses && successJson.licenses.length > 0, 'Must return at least 1 license');
  assert.strictEqual(successJson.licenses[0].license_key, purchase.licenseKey, 'License key must match purchased key');

  // Verify authorized downloads
  assert.ok(successJson.downloads && successJson.downloads.has_access, 'Downloads must be unlocked');
  assert.ok(successJson.downloads.zxp_url, 'Plugin ZXP Installer must be present');
  assert.ok(successJson.downloads.zip_url, 'Plugin ZIP package must be present');
  assert.ok(successJson.downloads.sfx_library_url, '7GB SFX Library Google Drive download must be present');

  console.log('✓ PASS: Verified customer successfully unlocked license key and all downloads on one clean screen.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 3: UNPAID / NONEXISTENT PAYMENT SCENARIO
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Testing Unpaid / Nonexistent Payment Scenario...');
  const unpaidRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `unpaid_${Date.now()}@test.org`,
      payment_id: 'pay_nonexistent_999999'
    })
  });

  assert.strictEqual(unpaidRes.status, 403, 'Unpaid search must return HTTP 403');
  const unpaidJson = await unpaidRes.json();
  assert.strictEqual(unpaidJson.ok, false);
  assert.ok(!unpaidJson.licenses, 'Must NOT return licenses');
  assert.ok(!unpaidJson.downloads, 'Must NOT return downloads');
  console.log('✓ PASS: Unpaid/nonexistent details strictly rejected with HTTP 403.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 4: PENDING PAYMENT SCENARIO (ORDER CREATED BUT UNPAID)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] Testing Pending Payment Scenario (Order Created but Unpaid)...');
  const pendingEmail = `pending_${Date.now()}@audioflow.com`;
  const orderRes = await fetch(`${SERVER_URL}/api/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pendingEmail, name: 'Pending Buyer' })
  });
  const orderData = await orderRes.json();
  assert.ok(orderData.ok, 'Order creation succeeded');

  const pendingPortalRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: pendingEmail,
      payment_id: orderData.order_id
    })
  });

  assert.strictEqual(pendingPortalRes.status, 403, 'Pending/unpaid order must return HTTP 403');
  const pendingJson = await pendingPortalRes.json();
  assert.strictEqual(pendingJson.ok, false);
  assert.ok(!pendingJson.licenses, 'Must NOT return licenses for pending/unpaid order');
  assert.ok(!pendingJson.downloads, 'Must NOT return downloads for pending/unpaid order');
  console.log('✓ PASS: Pending/uncompleted payment strictly blocked with HTTP 403.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 5: FAILED / TAMPERED PAYMENT SCENARIO
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] Testing Failed / Tampered Payment Scenario...');
  const fakeEmail = `tampered_${Date.now()}@badactor.io`;
  const fakeOrderId = `order_fake_${Date.now()}`;
  const fakePayId = `pay_fake_${Date.now()}`;
  const fakeSig = 'bad_tampered_signature_12345';

  const tamperedVerifyRes = await fetch(`${SERVER_URL}/api/verify-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: fakeOrderId,
      razorpay_payment_id: fakePayId,
      razorpay_signature: fakeSig,
      email: fakeEmail
    })
  });
  assert.strictEqual(tamperedVerifyRes.status, 400, 'Tampered verify must return 400');

  const tamperedPortalRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: fakeEmail,
      payment_id: fakePayId
    })
  });
  assert.strictEqual(tamperedPortalRes.status, 403, 'Tampered attempt must return HTTP 403');
  const tamperedPortalJson = await tamperedPortalRes.json();
  assert.strictEqual(tamperedPortalJson.ok, false);
  assert.ok(!tamperedPortalJson.licenses, 'Zero licenses returned on failed payment');
  console.log('✓ PASS: Failed payment attempts strictly rejected with zero license generation.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 6: REFUNDED / REVOKED PAYMENT SCENARIO
  // -------------------------------------------------------------------------
  console.log('\n[TEST 6] Testing Refunded / Revoked Payment Scenario...');
  const refundBuyer = `buyer_refund_${Date.now()}@studiod.org`;
  const refundPurchase = await simulatePurchase(refundBuyer, 'sfx-composer-bundle');

  // Admin initiates refund
  const refundRes = await fetch(`${SERVER_URL}/api/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      email: refundPurchase.email,
      order_id: refundPurchase.orderId,
      payment_id: refundPurchase.paymentId,
      reason: 'Customer requested refund'
    })
  });
  assert.strictEqual(refundRes.status, 200, 'Refund API should succeed');

  // Customer attempts to retrieve refunded purchase
  const refundedPortalRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: refundPurchase.email,
      payment_id: refundPurchase.paymentId
    })
  });

  assert.strictEqual(refundedPortalRes.status, 403, 'Refunded payment must return HTTP 403');
  const refundedJson = await refundedPortalRes.json();
  assert.strictEqual(refundedJson.ok, false);
  assert.strictEqual(refundedJson.code, 'REFUNDED');
  assert.ok(!refundedJson.licenses, 'Must NOT return licenses for refunded payment');
  assert.ok(!refundedJson.downloads, 'Must NOT return downloads for refunded payment');
  console.log('✓ PASS: Refunded/revoked transactions strictly blocked with HTTP 403 REFUNDED.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 7: MISMATCHED PAYMENT SCENARIO (CROSS-CUSTOMER ATTACK)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 7] Testing Mismatched Payment Scenario (Customer A Email + Customer B Payment ID)...');
  const customerA = `customer_a_${Date.now()}@studio.com`;
  const customerB = `customer_b_${Date.now()}@agency.com`;
  const purchaseA = await simulatePurchase(customerA, 'sfx-composer-bundle');
  const purchaseB = await simulatePurchase(customerB, 'sfx-composer-bundle');

  // Attacker uses customer A email with customer B payment ID
  const mismatchRes1 = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customerA,
      payment_id: purchaseB.paymentId
    })
  });
  assert.strictEqual(mismatchRes1.status, 403, 'Mismatched payment query must return HTTP 403');
  const mismatchJson1 = await mismatchRes1.json();
  assert.strictEqual(mismatchJson1.ok, false);
  assert.ok(!mismatchJson1.licenses, 'Must NOT return licenses on mismatch');

  // Attacker uses customer B email with customer A payment ID
  const mismatchRes2 = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: customerB,
      payment_id: purchaseA.paymentId
    })
  });
  assert.strictEqual(mismatchRes2.status, 403, 'Mismatched payment query must return HTTP 403');
  const mismatchJson2 = await mismatchRes2.json();
  assert.strictEqual(mismatchJson2.ok, false);
  assert.ok(!mismatchJson2.licenses, 'Must NOT return licenses on mismatch');

  console.log('✓ PASS: Mismatched email and payment IDs strictly rejected with HTTP 403.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 8: EMAIL-ONLY & PAYMENT-ID-ONLY ATTEMPTS
  // -------------------------------------------------------------------------
  console.log('\n[TEST 8] Testing Email-Only & Payment-ID-Only Protection...');
  // Email only
  const emailOnlyRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: purchaseA.email })
  });
  assert.strictEqual(emailOnlyRes.status, 403, 'Email-only query must return HTTP 403');
  const emailOnlyJson = await emailOnlyRes.json();
  assert.strictEqual(emailOnlyJson.ok, false);
  assert.ok(!emailOnlyJson.licenses, 'Never allow access based only on email address');

  // Payment ID only
  const paymentOnlyRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_id: purchaseA.paymentId })
  });
  assert.strictEqual(paymentOnlyRes.status, 403, 'Payment-ID-only query must return HTTP 403');
  const paymentOnlyJson = await paymentOnlyRes.json();
  assert.strictEqual(paymentOnlyJson.ok, false);
  assert.ok(!paymentOnlyJson.licenses, 'Never allow access based only on payment ID');

  console.log('✓ PASS: Single-field attempts (email-only or payment-id-only) strictly blocked.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 9: STRICT EXISTING LICENSE RETRIEVAL ONLY (NEVER GENERATE ON LOOKUP)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 9] Verifying Existing License Retrieval Only (Zero License Generation on Lookup)...');
  const lookupRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: purchaseA.email,
      payment_id: purchaseA.paymentId
    })
  });
  const lookupData = await lookupRes.json();
  assert.strictEqual(lookupData.licenses[0].license_key, purchaseA.licenseKey, 'Must retrieve existing purchased license key');
  console.log('✓ PASS: Retrieval strictly looks up existing purchased licenses without generating new keys.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 10: PRODUCT ISOLATION (PLUGIN ONLY, LIBRARY ONLY, BUNDLE)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 10] Verifying Strict Product Isolation...');
  // 10A: Plugin-Only Purchase
  const pluginEmail = `plugin_${Date.now()}@mix.pro`;
  const pluginPurchase = await simulatePurchase(pluginEmail, 'sfx-composer-pro', 'SFX Composer Pro Plugin', 19900);
  const pluginRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: pluginPurchase.email, payment_id: pluginPurchase.paymentId })
  });
  const pluginJson = await pluginRes.json();
  assert.ok(pluginJson.licenses && pluginJson.licenses.length > 0, 'Plugin purchase must have license');
  assert.ok(pluginJson.downloads.zxp_url && pluginJson.downloads.zip_url, 'Plugin installers must be present');
  assert.strictEqual(pluginJson.downloads.sfx_library_url, null, '7GB Library download MUST BE NULL for plugin only');
  console.log('  ✓ Plugin only: Shows plugin license & installers; hides 7GB library.');

  // 10B: Library-Only Purchase
  const libEmail = `lib_${Date.now()}@soundpack.net`;
  const libPurchase = await simulatePurchase(libEmail, 'sfx-master-library', '7GB Master SFX Library', 14900);
  const libRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: libPurchase.email, payment_id: libPurchase.paymentId })
  });
  const libJson = await libRes.json();
  assert.strictEqual(libJson.licenses.length, 0, 'Plugin licenses array MUST BE EMPTY for library only');
  assert.ok(libJson.downloads.sfx_library_url, '7GB SFX Library download MUST be present');
  console.log('  ✓ Library only: Shows 7GB library download; hides plugin license.');

  // 10C: Bundle Purchase
  const bundleEmail = `bundle_${Date.now()}@hollywood.com`;
  const bundlePurchase = await simulatePurchase(bundleEmail, 'sfx-composer-bundle', 'SFX Composer Complete Bundle', 29900);
  const bundleRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: bundlePurchase.email, payment_id: bundlePurchase.paymentId })
  });
  const bundleJson = await bundleRes.json();
  assert.ok(bundleJson.licenses && bundleJson.licenses.length > 0, 'Bundle must have plugin license');
  assert.ok(bundleJson.downloads.zxp_url && bundleJson.downloads.zip_url, 'Bundle must have plugin installers');
  assert.ok(bundleJson.downloads.sfx_library_url, 'Bundle must have 7GB SFX Library download');
  console.log('  ✓ Bundle: Shows both plugin license and 7GB library download.');

  console.log('✓ PASS: Product isolation strictly enforced across all product tiers.');
  passedCount++;

  // -------------------------------------------------------------------------
  // TEST 11: RATE LIMITING AND ZERO CLIENT SECRET EXPOSURE
  // -------------------------------------------------------------------------
  console.log('\n[TEST 11] Testing Rate Limiting & Zero Client Secret Exposure...');
  const rateLimitEmail = `spam_${Date.now()}@flooder.com`;
  let hitRateLimit = false;
  for (let i = 0; i < 35; i++) {
    const res = await fetch(`${SERVER_URL}/api/customer-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: rateLimitEmail, payment_id: 'pay_spam_12345' })
    });
    if (res.status === 429) {
      hitRateLimit = true;
      break;
    }
  }
  assert.ok(hitRateLimit, 'Portal endpoint must rate-limit high-frequency requests');

  // Audit frontend files for secret exposure
  const clientFiles = ['index.html', 'demo.html', 'library.html', 'screenshots.html', 'js/main.js', 'js/payment-service.js'];
  for (const f of clientFiles) {
    const content = fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.ok(!content.includes(SERVICE_KEY), `${f} must not contain SERVICE_ROLE_KEY`);
    assert.ok(!content.includes(RZP_SECRET), `${f} must not contain RAZORPAY_KEY_SECRET`);
  }
  console.log('✓ PASS: In-memory rate limiting throttles abuse and zero backend secrets exist in client code.');
  passedCount++;

  console.log('\n========================================================================');
  console.log(` ALL ${passedCount}/11 SECURE PURCHASE ACCESS TESTS PASSED PERFECTLY!`);
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\nTest Suite Error:', err);
  process.exit(1);
});
