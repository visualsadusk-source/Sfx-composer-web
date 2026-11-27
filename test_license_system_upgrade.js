const assert = require('assert');
const crypto = require('crypto');

const SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh').trim();
if (!ANON_KEY.startsWith('sb_publishable_')) { console.error('Invalid SUPABASE_PUBLISHABLE_KEY: legacy JWTs are disabled'); process.exit(1); }
const SERVICE_KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();
if (!SERVICE_KEY || !SERVICE_KEY.startsWith('sb_secret_')) { console.error('Missing or invalid SUPABASE_SECRET_KEY (must start with sb_secret_)'); process.exit(1); }

// Razorpay test credentials
const RAZORPAY_KEY_ID = 'rzp_test_U2XFM0xDGkQQv5';
const RAZORPAY_KEY_SECRET = 'wfUnt5UoJDivPBTWMoC55WFY';

async function runTestSuite() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — FULL UPGRADE & LICENSING VERIFICATION SUITE');
  console.log('================================================================\n');

  const timestamp = Date.now();
  const testAdminEmail = `licensed_admin_${timestamp}@studio.io`;
  const testBuyerEmail = `buyer_${timestamp}@premierepro.tv`;

  // ─────────────────────────────────────────────────────────────
  // TEST 1: Fix createLicense error & issue manual license
  // ─────────────────────────────────────────────────────────────
  console.log('[TEST 1] Testing Edge Function create-license (Issue License)...');
  const createLicRes = await fetch(`${SUPABASE_URL}/functions/v1/create-license`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      email: testAdminEmail,
      license_type: 'lifetime',
      send_email: false,
      max_devices: 1
    })
  });

  const createLicData = await createLicRes.json();
  assert.strictEqual(createLicRes.status, 200, `Expected 200 from create-license, got ${createLicRes.status}: ${JSON.stringify(createLicData)}`);
  assert.strictEqual(createLicData.ok, true, 'create-license ok must be true');
  assert.ok(createLicData.license_key, 'Must return generated license_key');
  assert.ok(/^SFX-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(createLicData.license_key), 'Key format valid');
  assert.strictEqual(createLicData.email, testAdminEmail.toLowerCase(), 'Email matches');
  console.log(`✓ PASS: Manual license generated successfully: ${createLicData.license_key}`);
  console.log(`  License ID: ${createLicData.license_id}\n`);

  const createdLicenseId = createLicData.license_id;
  const originalPlaintextKey = createLicData.license_key;

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Admin License Manager & Encrypted Key Decryption
  // ─────────────────────────────────────────────────────────────
  console.log('[TEST 2] Testing admin-licenses (Decryption & Search)...');
  const adminRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'list',
      query: testAdminEmail
    })
  });

  const adminData = await adminRes.json();
  assert.strictEqual(adminRes.status, 200, 'admin-licenses status 200');
  assert.strictEqual(adminData.ok, true, 'admin-licenses ok');
  assert.ok(Array.isArray(adminData.licenses), 'Must return licenses array');
  
  const foundLic = adminData.licenses.find(l => l.id === createdLicenseId || l.email === testAdminEmail);
  assert.ok(foundLic, `License for ${testAdminEmail} must be in admin list`);
  assert.strictEqual(foundLic.recovered_key, originalPlaintextKey, 'Decrypted recovered_key must match original plaintext key!');
  console.log(`✓ PASS: Server-side AES-256-GCM recovery confirmed:`);
  console.log(`  Recovered key: ${foundLic.recovered_key}`);
  console.log(`  Original key:  ${originalPlaintextKey}\n`);

  // ─────────────────────────────────────────────────────────────
  // TEST 3: Admin Actions (Revoke, Reactivate, Reset Device, Extend Expiry)
  // ─────────────────────────────────────────────────────────────
  console.log('[TEST 3] Testing Admin Actions (Revoke, Reactivate, Reset, Extend)...');
  
  // A. Revoke
  const revokeRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'revoke',
      license_id: createdLicenseId,
      reason: 'E2E Testing Revocation'
    })
  });
  const revokeData = await revokeRes.json();
  assert.strictEqual(revokeData.ok, true, 'Revoke action ok');
  console.log(`✓ PASS: License revoked.`);

  // B. Reactivate
  const reactivateRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'reactivate',
      license_id: createdLicenseId
    })
  });
  const reactivateData = await reactivateRes.json();
  assert.strictEqual(reactivateData.ok, true, 'Reactivate action ok');
  console.log(`✓ PASS: License reactivated.`);

  // C. Reset Device
  const resetRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'reset_device',
      license_id: createdLicenseId
    })
  });
  const resetData = await resetRes.json();
  assert.strictEqual(resetData.ok, true, 'Reset device action ok');
  console.log(`✓ PASS: Device activations reset.`);

  // D. Extend Expiry
  const newExpiry = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const extendRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'extend_expiry',
      license_id: createdLicenseId,
      expires_at: newExpiry
    })
  });
  const extendData = await extendRes.json();
  assert.strictEqual(extendData.ok, true, 'Extend expiry ok');
  console.log(`✓ PASS: Expiry extended to ${newExpiry}.\n`);

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Automatic Razorpay Purchase Delivery Flow (₹199)
  // ─────────────────────────────────────────────────────────────
  console.log(`[TEST 4] Testing Razorpay Purchase Delivery Flow for: ${testBuyerEmail}...`);
  // Step 1: Create Order
  const orderRes = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({ email: testBuyerEmail, amount: 19900, currency: 'INR' })
  });
  const orderData = await orderRes.json();
  assert.strictEqual(orderData.ok, true, 'Order created');
  const rzpOrderId = orderData.order_id;
  const rzpPaymentId = `pay_test_${timestamp.toString(36)}`;

  // Step 2: Generate valid HMAC signature
  const hmacPayload = `${rzpOrderId}|${rzpPaymentId}`;
  const validSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(hmacPayload).digest('hex');

  // Step 3: Verify Payment
  const payVerifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: testBuyerEmail,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: validSignature
    })
  });
  const payVerifyData = await payVerifyRes.json();
  assert.strictEqual(payVerifyRes.status, 200, 'Verify payment status 200');
  assert.strictEqual(payVerifyData.ok, true, 'Verify payment ok');
  assert.ok(payVerifyData.license_key, 'Must deliver license_key in immediate response');
  console.log(`✓ PASS: Payment verified with HMAC-SHA256 signature.`);
  console.log(`  Purchased key delivered: ${payVerifyData.license_key}`);
  console.log(`  Order ID: ${rzpOrderId}, Payment ID: ${rzpPaymentId}\n`);

  const buyerLicenseKey = payVerifyData.license_key;

  // ─────────────────────────────────────────────────────────────
  // TEST 5: Customer Dashboard Authentication & Decryption
  // ─────────────────────────────────────────────────────────────
  console.log(`[TEST 5] Testing Customer Dashboard Access & Security...`);

  // A. Unauthenticated / spoofed request MUST be rejected (401)
  const unauthRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({ email: testBuyerEmail })
  });
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated email querying must return 401');
  console.log(`✓ PASS: Unverified email access correctly blocked with 401 Unauthorized.`);

  // B. Verified purchase session proof access
  const verifiedPortalRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: testBuyerEmail,
      order_id: rzpOrderId,
      payment_id: rzpPaymentId
    })
  });
  const verifiedPortalData = await verifiedPortalRes.json();
  assert.strictEqual(verifiedPortalRes.status, 200, 'Verified portal request returns 200');
  assert.strictEqual(verifiedPortalData.ok, true, 'Portal data ok');
  assert.ok(Array.isArray(verifiedPortalData.licenses) && verifiedPortalData.licenses.length > 0, 'Licenses present');
  assert.strictEqual(verifiedPortalData.licenses[0].license_key, buyerLicenseKey, 'Decrypted key in customer portal matches purchase key!');
  if (verifiedPortalData.downloads) {
    assert.ok(verifiedPortalData.downloads.zxp_url, 'Download links provided');
    console.log(`  ZXP Download: ${verifiedPortalData.downloads.zxp_url}`);
    console.log(`  CEP ZIP Download: ${verifiedPortalData.downloads.zip_url}`);
  }
  console.log(`✓ PASS: Customer dashboard successfully unlocked for verified buyer:`);
  console.log(`  Decrypted customer key: ${verifiedPortalData.licenses[0].license_key}\n`);

  console.log('================================================================');
  console.log(' ALL 5 COMPREHENSIVE TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
