const assert = require('assert');
const crypto = require('crypto');

const SUPABASE_URL = 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzMxMTQsImV4cCI6MjExMDc0OTExNH0.FXKso4hkmUYcl_FfjG4GnHxwyCr09j5DkJ6ak1B2auY';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTE3MzExNCwiZXhwIjoyMTEwNzQ5MTE0fQ.Y6GbsUSzkh4b-Uze1JiLSie6PEb8SfG6xg36P4SPrNA';

const RAZORPAY_KEY_ID = 'rzp_test_U2XFM0xDGkQQv5';
const RAZORPAY_KEY_SECRET = 'wfUnt5UoJDivPBTWMoC55WFY';

async function runBrevoIntegrationTests() {
  console.log('================================================================');
  console.log(' SFX COMPOSER — BREVO LICENSE EMAIL INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  const timestamp = Date.now();
  const testCustomerEmail = `creator_${timestamp}@premiere-studio.com`;
  const testCustomerName = 'Alex Video Editor';

  // ── TEST 1: CREATE RAZORPAY ORDER (₹199 / 19900 PAISE) ──
  console.log(`[TEST 1] Creating Razorpay order for ₹199 INR (${testCustomerEmail})...`);
  const orderRes = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({
      email: testCustomerEmail,
      amount: 19900,
      currency: 'INR'
    })
  });

  const orderData = await orderRes.json();
  assert.strictEqual(orderRes.status, 200, 'Order creation must succeed with 200');
  assert.strictEqual(orderData.ok, true, 'Order ok must be true');
  assert.strictEqual(orderData.amount, 19900, 'Amount must be 19900 paise');
  assert.strictEqual(orderData.currency, 'INR', 'Currency must be INR');
  const rzpOrderId = orderData.order_id;
  const rzpPaymentId = `pay_test_${timestamp.toString(36)}`;
  console.log(`✓ PASS: Razorpay order created: ${rzpOrderId} (₹199 INR)\n`);

  // ── TEST 2: VERIFY PAYMENT & TRIGGER AUTOMATIC LICENSE GENERATION ──
  console.log(`[TEST 2] Verifying payment with HMAC-SHA256 signature and triggering Brevo flow...`);
  const hmacPayload = `${rzpOrderId}|${rzpPaymentId}`;
  const validSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(hmacPayload).digest('hex');

  const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({
      email: testCustomerEmail,
      name: testCustomerName,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: validSignature
    })
  });

  const verifyData = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200, `Verify response status: ${verifyRes.status}`);
  assert.strictEqual(verifyData.ok, true, 'Verify data ok must be true');
  assert.strictEqual(verifyData.verified, true, 'Payment must be marked verified');
  assert.ok(verifyData.license_key, 'Must return generated license key');
  assert.ok(verifyData.license_id, 'Must return database license ID');
  assert.ok(verifyData.email_delivery, 'Must include email_delivery tracking object');

  console.log(`✓ PASS: Payment successfully verified!`);
  console.log(`  License Key Generated: ${verifyData.license_key}`);
  console.log(`  License ID: ${verifyData.license_id}`);
  console.log(`  Brevo Email Delivery Info: ${verifyData.email_delivery.info}\n`);

  const originalLicenseKey = verifyData.license_key;
  const originalLicenseId = verifyData.license_id;

  // ── TEST 3: DATABASE VERIFICATION OF PAYMENT_ORDERS & LICENSES ──
  console.log(`[TEST 3] Inspecting database tracking in payment_orders & licenses...`);
  const dbCheckRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_orders?provider_order_id=eq.${rzpOrderId}&select=*`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const dbRows = await dbCheckRes.json();
  assert.ok(dbRows && dbRows.length === 1, 'Must find exactly 1 payment_orders row');
  const orderRow = dbRows[0];
  assert.strictEqual(orderRow.payment_status, 'completed', 'Payment status must be completed');
  assert.strictEqual(orderRow.license_id, originalLicenseId, 'Order must link to generated license ID');
  assert.ok(orderRow.email_delivery_status, 'Order must track email_delivery_status');
  console.log(`✓ PASS: Database records verified:`);
  console.log(`  Email Delivery Status: ${orderRow.email_delivery_status}`);
  console.log(`  Email Attempts: ${orderRow.email_attempts}`);
  console.log(`  Customer Name: ${orderRow.customer_name}\n`);

  // ── TEST 4: ADMIN RESEND ACTION WITHOUT DUPLICATE LICENSE GENERATION ──
  console.log(`[TEST 4] Testing Admin 'resend_email' action (Safe Retry via Brevo)...`);
  const resendRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-licenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({
      action: 'resend_email',
      order_id: rzpOrderId
    })
  });

  const resendData = await resendRes.json();
  assert.strictEqual(resendRes.status, 200, 'Admin resend_email must return 200');
  console.log(`✓ PASS: Admin resend action executed:`);
  console.log(`  Status: ${resendData.status}`);
  console.log(`  Message: ${resendData.message}`);

  // Re-verify that no duplicate license was created for this customer
  const custRes = await fetch(`${SUPABASE_URL}/rest/v1/customers?email=eq.${encodeURIComponent(testCustomerEmail)}&select=id`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const custRows = await custRes.json();
  assert.ok(custRows && custRows.length === 1, 'Customer row exists');
  const custId = custRows[0].id;

  const licCountRes = await fetch(`${SUPABASE_URL}/rest/v1/licenses?customer_id=eq.${custId}&select=id`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  });
  const licRows = await licCountRes.json();
  assert.strictEqual(licRows.length, 1, 'Customer must still have exactly 1 license (no duplicate licenses created on email retry)');
  console.log(`✓ PASS: Verified idempotency — customer retains exactly 1 license.\n`);

  // ── TEST 5: CUSTOMER DASHBOARD RETRIEVAL WITH EMAIL DELIVERY STATUS ──
  console.log(`[TEST 5] Testing Customer Dashboard access for verified buyer...`);
  const portalRes = await fetch(`${SUPABASE_URL}/functions/v1/customer-portal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY
    },
    body: JSON.stringify({
      email: testCustomerEmail,
      order_id: rzpOrderId,
      payment_id: rzpPaymentId
    })
  });

  const portalData = await portalRes.json();
  assert.strictEqual(portalRes.status, 200, 'Customer portal returns 200');
  assert.strictEqual(portalData.ok, true, 'Customer portal ok is true');
  assert.strictEqual(portalData.licenses[0].license_key, originalLicenseKey, 'Customer dashboard displays decrypted key');
  assert.ok(portalData.orders[0].email_delivery_status, 'Customer dashboard displays email delivery status');
  console.log(`✓ PASS: Customer dashboard verified!`);
  console.log(`  Decrypted Key Displayed: ${portalData.licenses[0].license_key}`);
  console.log(`  Order Status: ${portalData.orders[0].payment_status}`);
  console.log(`  Email Delivery Status: ${portalData.orders[0].email_delivery_status}\n`);

  console.log('================================================================');
  console.log(' ALL 5 BREVO LICENSE INTEGRATION TESTS PASSED FULLY!');
  console.log('================================================================');
}

runBrevoIntegrationTests().catch(err => {
  console.error('\n❌ BREVO INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
