const crypto = require('crypto');
const RAZORPAY_KEY_SECRET = 'wfUnt5UoJDivPBTWMoC55WFY';
const assert = require('assert');

const SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh').trim();
if (!ANON_KEY.startsWith('sb_publishable_')) { console.error('Invalid SUPABASE_PUBLISHABLE_KEY: legacy JWTs are disabled'); process.exit(1); }
const SERVICE_KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();
if (!SERVICE_KEY || !SERVICE_KEY.startsWith('sb_secret_')) { console.error('Missing or invalid SUPABASE_SECRET_KEY (must start with sb_secret_)'); process.exit(1); }

async function runTests() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — END-TO-END AUTOMATED PURCHASING & LICENSING TEST');
  console.log('================================================================\n');

  const testEmail = `editor_${Date.now()}@audioflow.studio`;
  let orderId = '';
  let issuedLicenseKey = '';
  let licenseId = '';

  // ── TEST STAGE 1: ORDER CREATION ──
  console.log(`[STAGE 1] Creating Order for email: ${testEmail}...`);
  const createRes = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({ email: testEmail, amount: 19900, currency: 'INR' })
  });
  const createData = await createRes.json();
  assert.strictEqual(createRes.status, 200, 'Order creation HTTP status should be 200');
  assert.strictEqual(createData.ok, true, 'Order creation ok should be true');
  assert.ok(createData.order_id, 'Order ID must be generated');
  assert.strictEqual(createData.amount, 19900, 'Amount must be 19900 paise');
  assert.strictEqual(createData.currency, 'INR', 'Currency must be INR');
  orderId = createData.order_id;
  console.log(`✓ PASS: Order created: ${orderId} (₹199 INR)\n`);

  // ── TEST STAGE 2: PAYMENT VERIFICATION & LICENSE GENERATION ──
  console.log(`[STAGE 2] Verifying payment for order: ${orderId}...`);
  const payId = 'pay_test_' + Date.now().toString(36).toUpperCase();
  const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: testEmail,
      razorpay_order_id: orderId,
      razorpay_payment_id: payId,
      razorpay_signature: crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${orderId}|${payId}`).digest('hex')
    })
  });
  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200, 'Verify payment status should be 200');
  assert.strictEqual(verifyData.ok, true, 'Verify payment ok should be true');
  assert.strictEqual(verifyData.verified, true, 'Payment must be marked verified');
  assert.ok(/^SFX-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(verifyData.license_key), 'License key must match SFX-XXXX-XXXX-XXXX-XXXX format');
  issuedLicenseKey = verifyData.license_key;
  licenseId = verifyData.license_id;
  console.log(`✓ PASS: Payment verified, unique license generated: ${issuedLicenseKey}`);
  console.log(`  License ID: ${licenseId}`);
  console.log(`  Email Delivery info: ${verifyData.email_delivery?.info}\n`);

  // ── TEST STAGE 3: IDEMPOTENCY VERIFICATION ──
  console.log(`[STAGE 3] Testing Idempotency (duplicate verify call)...`);
  const dupRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: testEmail,
      razorpay_order_id: orderId,
      razorpay_payment_id: 'pay_test_dup',
      razorpay_signature: crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(`${orderId}|pay_test_dup`).digest('hex')
    })
  });
  const dupData = await dupRes.json();
  assert.strictEqual(dupRes.status, 200, 'Duplicate call should return 200');
  assert.strictEqual(dupData.license_id, licenseId, 'Duplicate call must return existing license ID (no duplicate license created)');
  console.log(`✓ PASS: Webhook/Verify idempotency verified (reused license ${licenseId})\n`);

  // ── TEST STAGE 4: CUSTOMER PORTAL DATA ──
  console.log(`[STAGE 4] Querying Customer Portal for: ${testEmail}...`);
  const portalRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sfx_get_customer_portal_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({ p_email: testEmail })
  });
  const portalData = await portalRes.json();
  assert.strictEqual(portalData.ok, true, 'Portal data ok must be true');
  assert.strictEqual(portalData.found, true, 'Customer must be found in database');
  assert.ok(portalData.licenses.length >= 1, 'Customer must have at least 1 license');
  assert.strictEqual(portalData.licenses[0].status, 'active', 'License status must be active');
  assert.strictEqual(portalData.licenses[0].max_devices, 1, 'Max devices must be 1');
  assert.ok(portalData.orders.length >= 1, 'Customer must have order record');
  assert.strictEqual(portalData.orders[0].payment_status, 'completed', 'Order status must be completed');
  assert.strictEqual(portalData.orders[0].amount, 199, 'Order amount must be 199');
  console.log(`✓ PASS: Customer portal successfully retrieved:`);
  console.log(`  Customer ID: ${portalData.customer_id}`);
  console.log(`  License status: ${portalData.licenses[0].status} (${portalData.licenses[0].max_devices} device limit)`);
  if (portalData.downloads) console.log(`  Downloads: ${portalData.downloads.zxp_url} and ${portalData.downloads.zip_url}\n`);

  // ── TEST STAGE 5: ADMIN METRICS & ORDERS ──
  console.log(`[STAGE 5] Checking Admin Operations RPCs...`);
  const statsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sfx_admin_get_stats_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: '{}'
  });
  const statsData = await statsRes.json();
  assert.ok(statsData.total_sales >= 1, 'Total sales should be >= 1');
  assert.ok(statsData.total_revenue >= 199, 'Total revenue should be >= 199');
  console.log(`✓ PASS: Admin Stats: Sales=${statsData.total_sales}, Revenue=₹${statsData.total_revenue}, Total Licenses=${statsData.total_licenses}\n`);

  console.log('================================================================');
  console.log(' ALL 5 STAGES PASSED FULLY!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
