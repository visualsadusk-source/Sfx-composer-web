/**
 * test_razorpay_live_integration.js
 * Comprehensive automated verification for Razorpay LIVE payment integration into SFX Composer.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');

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

console.log('================================================================');
console.log(' SFX COMPOSER — RAZORPAY LIVE PAYMENT INTEGRATION VERIFICATION');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function check(desc, fn) {
  total++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`  ✅ PASS [${total}]: ${desc}`);
        passed++;
      }).catch(err => {
        console.error(`  ❌ FAIL [${total}]: ${desc}`);
        console.error(`     Error: ${err.message}`);
      });
    } else {
      console.log(`  ✅ PASS [${total}]: ${desc}`);
      passed++;
      return Promise.resolve();
    }
  } catch (err) {
    console.error(`  ❌ FAIL [${total}]: ${desc}`);
    console.error(`     Error: ${err.message}`);
    return Promise.resolve();
  }
}

const LIVE_KEY_ID = 'rzp_live_U2wwoc5khZUxlm';
const LIVE_KEY_SECRET = 'uV8H0QGodwWPAQKpj9ofqxv1';
const EXPECTED_DRIVE_URL = 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing';

function makeRequest(urlPath, method, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataStr = payload ? JSON.stringify(payload) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {}),
        ...headers
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body), raw: body });
        } catch (e) {
          resolve({ status: res.statusCode, body: null, raw: body });
        }
      });
    });

    req.on('error', err => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error(`Request to ${urlPath} timed out`));
    });

    if (dataStr) req.write(dataStr);
    req.end();
  });
}

async function runVerification() {
  console.log('--- TEST GROUP 1: CREDENTIALS & SECURITY HYGIENE ---');

  await check('Razorpay LIVE Key ID is properly configured in environment', () => {
    assert.strictEqual(process.env.RAZORPAY_KEY_ID, LIVE_KEY_ID, 'Live key ID must match exactly');
  });

  await check('Razorpay LIVE Key Secret is properly configured in environment', () => {
    assert.strictEqual(process.env.RAZORPAY_KEY_SECRET, LIVE_KEY_SECRET, 'Live key secret must match exactly');
  });

  await check('.env file is strictly ignored by git (.gitignore)', () => {
    const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.env'), '.gitignore must ignore .env');
  });

  await check('.env.example exists with placeholders and no exposed secrets', () => {
    const example = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
    assert.ok(example.includes('RAZORPAY_KEY_ID=rzp_live_'), '.env.example should include key placeholder');
    assert.ok(!example.includes(LIVE_KEY_SECRET), '.env.example must NEVER contain the real secret');
  });

  await check('Key Secret is NOT exposed in any public HTML or frontend JS files', () => {
    const publicFiles = [
      'index.html',
      'demo.html',
      'screenshots.html',
      'library.html',
      'admin.html',
      'js/main.js',
      'js/payment-service.js',
      'js/demo-app.js',
      'js/plugin-controller.js'
    ];
    publicFiles.forEach(f => {
      const content = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert.ok(!content.includes(LIVE_KEY_SECRET), `Secret must NOT appear in ${f}`);
    });
  });

  console.log('\n--- TEST GROUP 2: BACKEND HEALTH & CONFIGURATION ---');

  await check('/api/health endpoint reports LIVE Razorpay configuration and ₹199 pricing', async () => {
    const res = await makeRequest('/api/health', 'GET');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.ok);
    assert.strictEqual(res.body.razorpay.is_live, true, 'Backend should be running in LIVE mode');
    assert.strictEqual(res.body.razorpay.key_id, LIVE_KEY_ID);
    assert.strictEqual(res.body.pricing.amount_inr, 199);
    assert.strictEqual(res.body.pricing.amount_paise, 19900);
    assert.strictEqual(res.body.pricing.currency, 'INR');
  });

  console.log('\n--- TEST GROUP 3: ORDER CREATION (RAZORPAY API) ---');

  await check('/api/create-order rejects missing or invalid customer email with 400', async () => {
    const res = await makeRequest('/api/create-order', 'POST', { email: 'invalid-email' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.ok, false);
  });

  let liveOrderId = '';
  await check('/api/create-order creates authentic Razorpay order for ₹199 via live API', async () => {
    const res = await makeRequest('/api/create-order', 'POST', { email: 'studio.editor@example.com' });
    assert.strictEqual(res.status, 200, 'Order creation should succeed with 200');
    assert.ok(res.body.ok);
    assert.ok(res.body.order_id && res.body.order_id.startsWith('order_'), 'Must return valid Razorpay order ID');
    assert.strictEqual(res.body.amount, 19900, 'Amount must be 19900 paise (₹199)');
    assert.strictEqual(res.body.currency, 'INR', 'Currency must be INR');
    assert.strictEqual(res.body.key_id, LIVE_KEY_ID, 'Must return client Key ID');
    liveOrderId = res.body.order_id;
  });

  console.log('\n--- TEST GROUP 4: PAYMENT VERIFICATION & CRYPTOGRAPHIC SECURITY ---');

  const testPaymentId = 'pay_live_test_' + Date.now().toString(36);
  const validSignature = crypto
    .createHmac('sha256', LIVE_KEY_SECRET)
    .update(`${liveOrderId}|${testPaymentId}`)
    .digest('hex');

  await check('/api/verify-payment rejects invalid or forged signature with 400', async () => {
    const res = await makeRequest('/api/verify-payment', 'POST', {
      razorpay_order_id: liveOrderId,
      razorpay_payment_id: testPaymentId,
      razorpay_signature: 'fake_forged_signature_00000000000000000000000000000000',
      email: 'studio.editor@example.com'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.code, 'INVALID_SIGNATURE');
  });

  await check('/api/verify-payment rejects missing order or payment parameters with 400', async () => {
    const res = await makeRequest('/api/verify-payment', 'POST', {
      razorpay_order_id: liveOrderId,
      email: 'studio.editor@example.com'
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.ok, false);
  });

  let verifiedLicenseKey = '';
  await check('/api/verify-payment verifies valid cryptographic signature and unlocks product', async () => {
    const res = await makeRequest('/api/verify-payment', 'POST', {
      razorpay_order_id: liveOrderId,
      razorpay_payment_id: testPaymentId,
      razorpay_signature: validSignature,
      email: 'studio.editor@example.com',
      name: 'Studio Editor'
    });
    assert.strictEqual(res.status, 200, 'Verification must succeed with 200');
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.verified, true);
    assert.ok(res.body.license_key && /^SFX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(res.body.license_key), 'Must return standard format license key');
    assert.strictEqual(res.body.email, 'studio.editor@example.com');
    assert.strictEqual(res.body.order_id, liveOrderId);
    assert.strictEqual(res.body.payment_id, testPaymentId);
    assert.ok(res.body.downloads?.sfx_library_url.includes('/api/download?type=sfx-library'), 'Must deliver secure gated SFX Library link');
    verifiedLicenseKey = res.body.license_key;
  });

  await check('/api/verify-payment prevents duplicate processing and maintains idempotency', async () => {
    const res = await makeRequest('/api/verify-payment', 'POST', {
      razorpay_order_id: liveOrderId,
      razorpay_payment_id: testPaymentId,
      razorpay_signature: validSignature,
      email: 'studio.editor@example.com'
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.already_processed, true, 'Subsequent call must flag already_processed');
    assert.strictEqual(res.body.license_key, verifiedLicenseKey, 'Must return the exact same license key');
  });

  console.log('\n--- TEST GROUP 5: WEBHOOK VERIFICATION & ASYNC CAPTURE ---');

  const webhookPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_wh_' + Date.now().toString(36),
          order_id: 'order_wh_' + Date.now().toString(36),
          amount: 19900,
          currency: 'INR',
          email: 'webhook.customer@example.com'
        }
      }
    }
  });

  await check('/api/payment-webhook accepts and acknowledges valid payment.captured event', async () => {
    const res = await makeRequest('/api/payment-webhook', 'POST', JSON.parse(webhookPayload));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
  });

  console.log('\n--- TEST GROUP 6: FRONTEND UI & CHECKOUT INTEGRATION ---');

  await check('All 4 primary pages contain Razorpay Checkout SDK and checkout modal', () => {
    const pages = ['index.html', 'demo.html', 'screenshots.html', 'library.html'];
    pages.forEach(p => {
      const html = fs.readFileSync(path.join(__dirname, p), 'utf8');
      assert.ok(html.includes('checkout.razorpay.com/v1/checkout.js'), `${p} must load Razorpay SDK`);
      assert.ok(html.includes('id="checkout-modal"'), `${p} must include checkout modal`);
      assert.ok(html.includes('id="checkout-form"'), `${p} must include checkout form`);
      assert.ok(html.includes('id="checkout-email"'), `${p} must include email input`);
      assert.ok(html.includes('id="checkout-submit-btn"'), `${p} must include submit button`);
      assert.ok(html.includes('id="checkout-success"'), `${p} must include success screen`);
      assert.ok(html.includes('id="issued-license-key-val"'), `${p} must include license key display`);
      assert.ok(html.includes('id="success-sfx-library-btn"'), `${p} must include 7GB library button`);
      assert.ok(!html.includes(EXPECTED_DRIVE_URL), `${p} must NOT leak raw Drive link in markup`);
    });
  });

  await check('PaymentService in js/payment-service.js supports both Vercel /api and fallback endpoints', () => {
    const js = fs.readFileSync(path.join(__dirname, 'js', 'payment-service.js'), 'utf8');
    assert.ok(js.includes('getEndpoints'), 'Must define getEndpoints routing helper');
    assert.ok(js.includes('/api/create-order'), 'Must support /api/create-order');
    assert.ok(js.includes('/api/verify-payment'), 'Must support /api/verify-payment');
    assert.ok(js.includes('PRICE_PAISE: 19900'), 'Must enforce 19900 paise');
    assert.ok(js.includes("CURRENCY: 'INR'"), 'Must enforce INR currency');
  });

  console.log('\n--- TEST GROUP 7: ADMIN DASHBOARD METRICS ---');

  await check('admin.html contains stats for Successful Payments, Gross Revenue, and Failed Payments', () => {
    const html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    assert.ok(html.includes('id="stat-revenue"'), 'Must display Gross Sales Revenue');
    assert.ok(html.includes('id="stat-successful-payments"'), 'Must display Successful Payments');
    assert.ok(html.includes('id="stat-failed-payments"'), 'Must display Failed Payments');
    assert.ok(html.includes('id="orders-table-tbody"'), 'Must display Orders Table');
    assert.ok(html.includes('Customer Email'), 'Must display Customer Email header');
    assert.ok(html.includes('Payment ID &amp; Order ID') || html.includes('Payment ID & Order ID'), 'Must display Payment/Order ID header');
    assert.ok(html.includes('Associated License Key'), 'Must display Associated License Key header');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Test suite execution error:', err);
  process.exit(1);
});
