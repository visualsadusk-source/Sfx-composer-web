const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';
const DOWNLOADS_DIR = fs.existsSync(path.join(__dirname, 'private_storage', 'downloads'))
  ? path.join(__dirname, 'private_storage', 'downloads')
  : path.join(__dirname, 'downloads');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
}
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'uV8H0QGodwWPAQKpj9ofqxv1';

function computeHmacSha256(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function run() {
  console.log('================================================================');
  console.log('SFX COMPOSER — PLUGIN v2.2.0 & DIRECT LICENSE SYSTEM AUDIT');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ [FAIL] ${name}: ${err.message}`);
    }
  }

  // ── TEST SUITE 1: PHYSICAL PACKAGES & CEP INTEGRITY ──
  console.log('--- TEST SUITE 1: Physical Packages & CEP Extension Structure ---');

  const zxpPath = path.join(DOWNLOADS_DIR, 'sfx-composer-pro-v2.2.0.zxp');
  const zipPath = path.join(DOWNLOADS_DIR, 'sfx-composer-pro-v2.2.0.zip');

  test('v2.2.0 ZXP installer exists and has valid size (> 300KB)', () => {
    assert.ok(fs.existsSync(zxpPath), 'ZXP file must exist');
    const stat = fs.statSync(zxpPath);
    assert.ok(stat.size > 300000, `ZXP file size (${stat.size}) should be > 300KB`);
  });

  test('v2.2.0 CEP ZIP archive exists and has valid size (> 300KB)', () => {
    assert.ok(fs.existsSync(zipPath), 'ZIP file must exist');
    const stat = fs.statSync(zipPath);
    assert.ok(stat.size > 300000, `ZIP file size (${stat.size}) should be > 300KB`);
  });

  // ── TEST SUITE 2: ACCESS CONTROL & DOWNLOAD STREAMING ──
  console.log('\n--- TEST SUITE 2: Security, Authentication & Download Gate ---');

  await testAsync('Unauthenticated GET to /downloads/sfx-composer-pro-v2.2.0.zxp blocked (401)', async () => {
    const res = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.2.0.zxp`);
    assert.strictEqual(res.status, 401, 'Should return 401 Unauthenticated');
    const body = await res.json();
    assert.strictEqual(body.code, 'UNAUTHENTICATED');
  });

  await testAsync('Unauthenticated GET to /downloads/sfx-composer-pro-v2.2.0.zip blocked (401)', async () => {
    const res = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.2.0.zip`);
    assert.strictEqual(res.status, 401, 'Should return 401 Unauthenticated');
  });

  await testAsync('Unauthenticated GET to /api/download?type=zxp blocked (401)', async () => {
    const res = await fetch(`${SERVER_URL}/api/download?type=zxp`);
    assert.strictEqual(res.status, 401, 'Should return 401 Unauthenticated');
  });

  await testAsync('Invalid/tampered token blocked with 401', async () => {
    const res = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.2.0.zxp?token=forged_token_XYZ`);
    assert.strictEqual(res.status, 401, 'Should return 401');
  });

  // Create a verified test purchase order
  const testEmail = `test_customer_${Date.now()}@gmail.com`;
  const orderId = `order_${Date.now()}`;
  const paymentId = `pay_${Date.now()}`;
  const signature = computeHmacSha256(`${orderId}|${paymentId}`, RAZORPAY_KEY_SECRET);

  let verifiedToken = '';
  await testAsync('Verify payment and obtain verified customer session token', async () => {
    const verifyRes = await fetch(`${SERVER_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        email: testEmail,
        name: 'Audit Customer',
        product_id: 'sfx-composer-bundle'
      })
    });
    assert.strictEqual(verifyRes.status, 200, 'Verify payment should return 200');
    const data = await verifyRes.json();
    assert.ok(data.verified, 'Payment must be verified');
    assert.ok(data.downloads.zxp_url.includes('v2.2.0.zxp'), `zxp_url should have v2.2.0: ${data.downloads.zxp_url}`);
    assert.ok(data.downloads.zip_url.includes('v2.2.0.zip'), `zip_url should have v2.2.0: ${data.downloads.zip_url}`);

    // Now query /api/customer-portal with this verified email and payment ID
    const portalRes = await fetch(`${SERVER_URL}/api/customer-portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        payment_id: paymentId
      })
    });
    assert.strictEqual(portalRes.status, 200, 'Customer portal must return 200 for verified customer');
    const portalData = await portalRes.json();
    assert.ok(portalData.ok, 'Portal lookup must be ok');
    assert.ok(portalData.token, 'Portal must return customer session token');
    assert.ok(portalData.downloads.zxp_url.includes('v2.2.0.zxp'), `Portal zxp_url: ${portalData.downloads.zxp_url}`);
    assert.ok(portalData.downloads.zip_url.includes('v2.2.0.zip'), `Portal zip_url: ${portalData.downloads.zip_url}`);
    verifiedToken = portalData.token;
  });

  await testAsync('Authenticated customer downloads full binary ZXP package (200 + exact Content-Length)', async () => {
    assert.ok(verifiedToken, 'Must have verified token');
    const res = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.2.0.zxp?token=${encodeURIComponent(verifiedToken)}`);
    assert.strictEqual(res.status, 200, 'Authenticated download must return 200');
    const buf = await res.arrayBuffer();
    assert.strictEqual(buf.byteLength, fs.statSync(zxpPath).size, 'Downloaded bytes must match exact file size');
  });

  await testAsync('Authenticated customer downloads full binary ZIP package via /api/download?type=zip', async () => {
    assert.ok(verifiedToken, 'Must have verified token');
    const res = await fetch(`${SERVER_URL}/api/download?type=zip&token=${encodeURIComponent(verifiedToken)}`);
    assert.strictEqual(res.status, 200, 'Authenticated download must return 200');
    const buf = await res.arrayBuffer();
    assert.strictEqual(buf.byteLength, fs.statSync(zipPath).size, 'Downloaded bytes must match exact file size');
  });

  await testAsync('Legacy alias request to v2.4.0.zxp with valid token gracefully serves installer without 404', async () => {
    const res = await fetch(`${SERVER_URL}/downloads/sfx-composer-pro-v2.4.0.zxp?token=${encodeURIComponent(verifiedToken)}`);
    assert.strictEqual(res.status, 200, 'Legacy alias must return 200');
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 300000, 'Must deliver valid package');
  });

  // ── TEST SUITE 3: WEBSITE & LIVE DEMO VERIFICATION ──
  console.log('\n--- TEST SUITE 3: Website, Live Demo & Customer Dashboard Markup ---');

  test('demo.html contains secure gated download buttons and authentic license-ui.css', () => {
    const html = fs.readFileSync(path.join(__dirname, 'demo.html'), 'utf8');
    assert.ok(html.includes('id="success-download-zxp-btn"'), 'demo.html must have success-download-zxp-btn');
    assert.ok(html.includes('id="success-download-zip-btn"'), 'demo.html must have success-download-zip-btn');
    assert.ok(html.includes('plugin-dist/license-ui.css'), 'demo.html must include license-ui.css');
    assert.ok(html.includes('id="sfx-license-overlay"'), 'demo.html must contain authentic license modal');
    assert.ok(html.includes('id="sfx-settings-drawer"'), 'demo.html must contain settings drawer');
    assert.ok(html.includes('License &amp; Activation'), 'demo.html must showcase License & Activation section');
  });

  test('index.html contains secure gated download buttons without exposing raw URLs', () => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.ok(html.includes('id="success-download-zxp-btn"'), 'index.html must have success-download-zxp-btn');
    assert.ok(html.includes('id="success-download-zip-btn"'), 'index.html must have success-download-zip-btn');
    assert.ok(!html.includes('drive.google.com'), 'index.html must never expose raw Google Drive URL');
  });

  test('library.html and screenshots.html contain secure gated download buttons', () => {
    const libHtml = fs.readFileSync(path.join(__dirname, 'library.html'), 'utf8');
    const scrHtml = fs.readFileSync(path.join(__dirname, 'screenshots.html'), 'utf8');
    assert.ok(libHtml.includes('id="success-download-zxp-btn"'), 'library.html must have success-download-zxp-btn');
    assert.ok(scrHtml.includes('id="success-download-zxp-btn"'), 'screenshots.html must have success-download-zxp-btn');
    assert.ok(!libHtml.includes('drive.google.com'), 'library.html must never expose raw Google Drive URL');
    assert.ok(!scrHtml.includes('drive.google.com'), 'screenshots.html must never expose raw Google Drive URL');
  });

  test('No raw static download links active in customer dashboard or source HTML', () => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    assert.ok(!html.includes('href="/downloads/sfx-composer-pro-v2.4.0.zxp"'), 'No raw v2.4.0 static download links');
    assert.ok(!html.includes('href="/downloads/sfx-composer-pro-v2.2.0.zxp"'), 'No raw v2.2.0 static download links');
  });

  console.log(`\n================================================================`);
  console.log(`SUMMARY: ${passed}/${total} Tests Passed (${passed === total ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'})`);
  console.log(`================================================================\n`);

  if (passed !== total) process.exit(1);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
