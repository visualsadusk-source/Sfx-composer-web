const assert = require('assert');
const crypto = require('crypto');

const SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UaQZtILaSTJgDudLnAdQ_w_xIe0-xYh').trim();
if (!ANON_KEY.startsWith('sb_publishable_')) { console.error('Invalid SUPABASE_PUBLISHABLE_KEY: legacy JWTs are disabled'); process.exit(1); }
const SERVICE_KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();
if (!SERVICE_KEY || !SERVICE_KEY.startsWith('sb_secret_')) { console.error('Missing or invalid SUPABASE_SECRET_KEY (must start with sb_secret_)'); process.exit(1); }

const RAZORPAY_KEY_SECRET = 'wfUnt5UoJDivPBTWMoC55WFY';

async function purchaseLicense(customerEmail, customerName) {
  const timestamp = Date.now();
  // 1. Create Order
  const orderRes = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: customerEmail,
      amount: 19900,
      currency: 'INR'
    })
  });
  const orderData = await orderRes.json();
  assert.strictEqual(orderRes.status, 200, 'Order creation must succeed');
  assert.ok(orderData.order_id, 'Must return order_id');

  const rzpOrderId = orderData.order_id;
  const rzpPaymentId = `pay_test_${Math.random().toString(36).substring(2, 10)}`;

  // 2. Generate HMAC signature and verify payment
  const hmacPayload = `${rzpOrderId}|${rzpPaymentId}`;
  const validSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(hmacPayload).digest('hex');

  const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: customerEmail,
      name: customerName,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: validSignature
    })
  });

  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200, 'Payment verification must succeed');
  assert.strictEqual(verifyData.ok, true, 'Verify must return ok: true');
  assert.ok(verifyData.license_key, 'Must return generated license key');

  return {
    email: customerEmail,
    name: customerName,
    orderId: rzpOrderId,
    paymentId: rzpPaymentId,
    licenseKey: verifyData.license_key,
    licenseId: verifyData.license_id
  };
}

async function runSecuritySuite() {
  console.log('========================================================================');
  console.log(' SFX COMPOSER — LICENSE KEY VISIBILITY & CROSS-ACCOUNT SECURITY TEST');
  console.log('========================================================================\n');

  const ts = Date.now();
  const customerAEmail = `director_a_${ts}@studio-a.com`;
  const customerBEmail = `producer_b_${ts}@studio-b.com`;

  // ── TEST 1: CREATE TWO INDEPENDENT PURCHASES ──
  console.log(`[TEST 1] Creating separate purchases for Customer A and Customer B...`);
  const accountA = await purchaseLicense(customerAEmail, 'Director Alice');
  console.log(`✓ Customer A purchased:`);
  console.log(`  Email: ${accountA.email}`);
  console.log(`  Order: ${accountA.orderId} | Payment: ${accountA.paymentId}`);
  console.log(`  License Key A: ${accountA.licenseKey}\n`);

  const accountB = await purchaseLicense(customerBEmail, 'Producer Bob');
  console.log(`✓ Customer B purchased:`);
  console.log(`  Email: ${accountB.email}`);
  console.log(`  Order: ${accountB.orderId} | Payment: ${accountB.paymentId}`);
  console.log(`  License Key B: ${accountB.licenseKey}\n`);

  assert.notStrictEqual(accountA.licenseKey, accountB.licenseKey, 'Each customer must receive unique license keys');

  // ── TEST 2: CUSTOMER A ACCESSES OWN LICENSE ──
  console.log(`[TEST 2] Customer A accesses Customer Portal...`);
  const portalARes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: accountA.email,
      order_id: accountA.orderId,
      payment_id: accountA.paymentId
    })
  });
  const portalAData = await portalARes.json();
  assert.strictEqual(portalARes.status, 200, 'Customer A portal access returns 200');
  assert.strictEqual(portalAData.ok, true, 'Portal A data ok');
  assert.strictEqual(portalAData.email, accountA.email, 'Portal email matches Customer A');
  assert.ok(portalAData.licenses && portalAData.licenses.length >= 1, 'Customer A has licenses');
  
  const licA = portalAData.licenses[0];
  assert.strictEqual(licA.license_key, accountA.licenseKey, 'Customer A can view their own decrypted license key');
  assert.strictEqual(licA.status, 'active', 'License status must be active');
  console.log(`✓ PASS: Customer A successfully retrieved their license key: ${licA.license_key}`);
  console.log(`  License Status: ${licA.status}`);
  console.log(`  Payment Status: ${licA.payment_status}`);
  console.log(`  Order ID: ${licA.provider_order_id}\n`);

  // ── TEST 3: CUSTOMER B ACCESSES OWN LICENSE ──
  console.log(`[TEST 3] Customer B accesses Customer Portal...`);
  const portalBRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: accountB.email,
      order_id: accountB.orderId,
      payment_id: accountB.paymentId
    })
  });
  const portalBData = await portalBRes.json();
  assert.strictEqual(portalBRes.status, 200, 'Customer B portal access returns 200');
  assert.strictEqual(portalBData.ok, true, 'Portal B data ok');
  assert.strictEqual(portalBData.email, accountB.email, 'Portal email matches Customer B');
  assert.ok(portalBData.licenses && portalBData.licenses.length >= 1, 'Customer B has licenses');
  
  const licB = portalBData.licenses[0];
  assert.strictEqual(licB.license_key, accountB.licenseKey, 'Customer B can view their own decrypted license key');
  console.log(`✓ PASS: Customer B successfully retrieved their license key: ${licB.license_key}\n`);

  // ── TEST 4: CROSS-ACCOUNT ISOLATION (CUSTOMER A CANNOT ACCESS CUSTOMER B'S KEY) ──
  console.log(`[TEST 4] Testing Cross-Account Security: Customer A attempting to access Customer B's licenses...`);
  
  // Attempt 1: Customer A passes Customer A's payment receipt proof but requests Customer B's email
  const crossAttackRes1 = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: accountB.email, // Customer B email
      order_id: accountA.orderId, // Customer A order ID
      payment_id: accountA.paymentId // Customer A payment ID
    })
  });
  assert.strictEqual(crossAttackRes1.status, 401, 'Must reject mismatched order proof with 401 UNAUTHENTICATED');
  console.log(`✓ PASS: Mismatched order proof properly rejected with HTTP 401 Unauthorized`);

  // Attempt 2: Customer A attempts to reissue Customer B's license
  const crossReissueRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      action: 'reissue_key',
      email: accountA.email,
      order_id: accountA.orderId,
      payment_id: accountA.paymentId,
      license_id: accountB.licenseId // Target Customer B's license!
    })
  });
  const crossReissueData = await crossReissueRes.json();
  assert.strictEqual(crossReissueRes.status, 403, 'Must reject unauthorized license reissue with 403 FORBIDDEN');
  assert.strictEqual(crossReissueData.code, 'FORBIDDEN', 'Error code must be FORBIDDEN');
  console.log(`✓ PASS: Cross-account license modification rejected with HTTP 403 Forbidden: ${crossReissueData.message}\n`);

  // ── TEST 5: ADMIN INSPECTION OF PURCHASES & LICENSES ──
  console.log(`[TEST 5] Admin dashboard retrieving unified orders & license keys...`);
  const adminRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ action: 'list' })
  });
  const adminData = await adminRes.json();
  assert.strictEqual(adminRes.status, 200, 'Admin list returns 200');
  assert.strictEqual(adminData.ok, true, 'Admin list ok');
  assert.ok(Array.isArray(adminData.orders), 'Admin receives orders list');
  assert.ok(Array.isArray(adminData.licenses), 'Admin receives licenses list');

  const orderA = adminData.orders.find(o => o.provider_order_id === accountA.orderId);
  assert.ok(orderA, 'Customer A order found in admin orders');
  assert.strictEqual(orderA.customer_email, accountA.email, 'Order A customer email matches');
  assert.strictEqual(orderA.recovered_key, accountA.licenseKey, 'Admin can inspect Customer A license key from purchase order');
  assert.strictEqual(orderA.license_status, 'active', 'Admin sees active license status');

  const orderB = adminData.orders.find(o => o.provider_order_id === accountB.orderId);
  assert.ok(orderB, 'Customer B order found in admin orders');
  assert.strictEqual(orderB.recovered_key, accountB.licenseKey, 'Admin can inspect Customer B license key from purchase order');

  console.log(`✓ PASS: Admin successfully inspected all customer purchases & associated license keys:`);
  console.log(`  Customer A Order (${orderA.provider_order_id}) -> License Key: ${orderA.recovered_key}`);
  console.log(`  Customer B Order (${orderB.provider_order_id}) -> License Key: ${orderB.recovered_key}\n`);

  // ── TEST 6: ADMIN KEY REVEAL & AUDIT LOGGING ──
  console.log(`[TEST 6] Testing Admin Key Reveal and Audit Trail in public.license_audit_logs...`);
  const revealRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'reveal_key',
      license_id: accountA.licenseId
    })
  });
  const revealData = await revealRes.json();
  assert.strictEqual(revealRes.status, 200, 'Admin reveal returns 200');
  assert.strictEqual(revealData.ok, true, 'Reveal ok');
  assert.strictEqual(revealData.license_key, accountA.licenseKey, 'Revealed key matches Customer A key');

  // Verify that an audit log row was recorded
  const auditRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'get_audit_logs',
      license_id: accountA.licenseId
    })
  });
  const auditData = await auditRes.json();
  assert.strictEqual(auditRes.status, 200, 'Get audit logs returns 200');
  assert.ok(auditData.logs && auditData.logs.length >= 1, 'Must find at least 1 audit log entry');
  
  const revealLog = auditData.logs.find(l => l.action === 'reveal_key' && l.license_id === accountA.licenseId);
  assert.ok(revealLog, 'Audit log for reveal_key must exist');
  assert.strictEqual(revealLog.customer_email, accountA.email, 'Audit log records target customer email');
  console.log(`✓ PASS: Key reveal successfully executed and logged in audit trail:`);
  console.log(`  Log ID: ${revealLog.id}`);
  console.log(`  Admin Email: ${revealLog.admin_email}`);
  console.log(`  Action: ${revealLog.action}`);
  console.log(`  Target Customer: ${revealLog.customer_email}`);
  console.log(`  Timestamp: ${revealLog.created_at}\n`);

  // ── TEST 7: LEGACY HASH REISSUE PROCESS ──
  console.log(`[TEST 7] Testing Legacy Hash Recovery & Reissue Process...`);
  // Find a legacy license (one without encrypted_license_key)
  const legacyCheck = await fetch(`${SUPABASE_URL}/rest/v1/licenses?encrypted_license_key=is.null&select=id,customer_id,customers(email)&limit=1`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const legacyRows = await legacyCheck.json();
  assert.ok(legacyRows && legacyRows.length > 0, 'Found pre-existing legacy hashed license');
  const legacyLic = legacyRows[0];
  console.log(`  Found legacy license ID: ${legacyLic.id} (${legacyLic.customers?.email})`);

  // Admin initiates reissue
  const reissueRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'reissue_key',
      license_id: legacyLic.id,
      reason: 'Automated Test Reissue',
      send_email: false
    })
  });
  const reissueData = await reissueRes.json();
  assert.strictEqual(reissueRes.status, 200, 'Reissue returns 200');
  assert.strictEqual(reissueData.ok, true, 'Reissue ok');
  assert.ok(reissueData.license_key, 'Returns new decrypted license key');
  assert.ok(reissueData.license_key.startsWith('SFX-'), 'Key has standard SFX format');

  // Verify database state: license now has encrypted_license_key!
  const licDbCheck = await fetch(`${SUPABASE_URL}/rest/v1/licenses?id=eq.${legacyLic.id}&select=*`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const updatedLicRows = await licDbCheck.json();
  const updatedLic = updatedLicRows[0];
  assert.ok(updatedLic.encrypted_license_key, 'License now has encrypted_license_key saved in database');
  assert.strictEqual(updatedLic.status, 'active', 'License status is active');

  console.log(`✓ PASS: Legacy hashed license successfully reissued & encrypted:`);
  console.log(`  Reissued License Key: ${reissueData.license_key}`);
  console.log(`  Database encrypted payload present: ${updatedLic.encrypted_license_key.slice(0, 24)}...`);

  // Verify reissue audit log was created
  const reissueAuditCheck = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'get_audit_logs',
      license_id: legacyLic.id
    })
  });
  const reissueAuditData = await reissueAuditCheck.json();
  const reissueLog = reissueAuditData.logs.find(l => l.action === 'reissue_key');
  assert.ok(reissueLog, 'Audit log for reissue_key must exist');
  console.log(`  Reissue Audit Log recorded: ${reissueLog.id} (${reissueLog.action})\n`);

  console.log('========================================================================');
  console.log(' ALL 7 LICENSE VISIBILITY & CROSS-ACCOUNT SECURITY TESTS PASSED FULLY!');
  console.log('========================================================================');
}

runSecuritySuite().catch(err => {
  console.error('\n❌ SECURITY TEST FAILED:', err);
  process.exit(1);
});
