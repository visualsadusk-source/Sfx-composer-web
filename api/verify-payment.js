/**
 * api/verify-payment.js
 * Vercel Serverless Function / Node.js endpoint: Cryptographic signature & amount verification.
 * Automatically generates license and unlocks Google Drive product delivery upon payment.
 */

const { handleCors, verifyHmacSha256, makeRazorpayRequest, generateLicenseKey, memoryStore } = require('./_shared');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  } else if (!body) {
    body = {};
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    email,
    name
  } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !email) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      message: 'Missing required parameters (razorpay_order_id, razorpay_payment_id, email).'
    }));
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const rzpKeyId = process.env.RAZORPAY_KEY_ID;
  const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!rzpKeySecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'MISSING_SECRET',
      message: 'RAZORPAY_KEY_SECRET is not configured on the backend.'
    }));
  }

  // 1. Cryptographic HMAC-SHA256 Signature Verification
  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const isSignatureValid = verifyHmacSha256(payload, razorpay_signature || '', rzpKeySecret);

  if (!isSignatureValid) {
    console.error('Invalid signature attempt for order:', razorpay_order_id, 'payment:', razorpay_payment_id);
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'INVALID_SIGNATURE',
      message: 'Razorpay payment signature verification failed. Untrusted payment.'
    }));
  }

  // 2. Query Razorpay API for live capture & amount check
  if (rzpKeyId && rzpKeySecret) {
    try {
      const rzpPayRes = await makeRazorpayRequest(`/v1/payments/${razorpay_payment_id}`, 'GET', null, rzpKeyId, rzpKeySecret);
      if (rzpPayRes.ok && rzpPayRes.data) {
        const payData = rzpPayRes.data;
        if (payData.amount !== 19900 || payData.currency !== 'INR') {
          console.error(`Amount mismatch: expected 19900 INR, got ${payData.amount} ${payData.currency}`);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            ok: false,
            code: 'AMOUNT_MISMATCH',
            message: `Payment amount mismatch: expected ₹199 INR, got ${payData.currency} ${payData.amount / 100}`
          }));
        }

        if (payData.status !== 'captured' && payData.status !== 'authorized') {
          console.warn(`Payment ${razorpay_payment_id} status is ${payData.status}`);
        }
      }
    } catch (apiErr) {
      console.warn('Note: Razorpay API payment lookup check failed (proceeding with verified signature):', apiErr.message);
    }
  }

  // 3. Idempotency Check: check if already processed
  if (memoryStore.processedPayments.has(razorpay_payment_id)) {
    const existing = memoryStore.licenses.get(razorpay_order_id);
    if (existing) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        ok: true,
        verified: true,
        license_key: existing.license_key,
        email: cleanEmail,
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
        already_processed: true,
        downloads: {
          version: 'v2.2.0',
          zxp_url: '/downloads/sfx-composer-pro-v2.2.0.zxp',
          zip_url: '/downloads/sfx-composer-pro-v2.2.0.zip',
          sfx_library_url: process.env.SFX_LIBRARY_DRIVE_URL || 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing'
        }
      }));
    }
  }

  // 4. Product & Entitlement Isolation
  const cachedOrder = memoryStore.orders.get(razorpay_order_id);
  const productId = body.product_id || (cachedOrder && cachedOrder.product_id) || 'sfx-composer-bundle';
  const pIdLower = String(productId).toLowerCase();
  const defaultName = (pIdLower.includes('library') && !pIdLower.includes('bundle') && !pIdLower.includes('plugin'))
    ? '7GB Master SFX Library'
    : ((pIdLower.includes('plugin') || pIdLower.includes('pro')) && !pIdLower.includes('bundle') && !pIdLower.includes('library'))
      ? 'SFX Composer Pro Software'
      : 'SFX Composer Complete Bundle';
  const productName = body.product_name || (cachedOrder && cachedOrder.product_name) || defaultName;
  const pNameLower = String(productName).toLowerCase();

  const isLibOnly = (pIdLower.includes('library') || pNameLower.includes('library')) && !pIdLower.includes('bundle') && !pNameLower.includes('bundle') && !pIdLower.includes('plugin') && !pNameLower.includes('plugin');
  const isPluginOnly = (pIdLower.includes('plugin') || pNameLower.includes('plugin') || pIdLower.includes('pro')) && !pIdLower.includes('bundle') && !pNameLower.includes('bundle') && !pIdLower.includes('library') && !pNameLower.includes('library');

  const hasPlugin = !isLibOnly;
  const hasLibrary = !isPluginOnly;

  // Generate unique license key (only if customer purchased plugin or bundle)
  let licenseKey = hasPlugin ? generateLicenseKey() : null;

  // 4.5. Synchronize with Supabase Database
  let dbLicenseId = null;
  let dbLicenseKey = null;

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTE3MzExNCwiZXhwIjoyMTEwNzQ5MTE0fQ.Y6GbsUSzkh4b-Uze1JiLSie6PEb8SfG6xg36P4SPrNA';

    // 1. Record pending order if not already in payment_orders
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/sfx_record_payment_order`, {
      method: 'POST',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_customer_email: cleanEmail,
        p_payment_provider: 'razorpay',
        p_provider_order_id: razorpay_order_id,
        p_amount: (body.amount ? body.amount / 100 : 199.00),
        p_currency: 'INR'
      })
    });

    // 2. Issue encrypted license if plugin included
    if (hasPlugin) {
      const edgeLicRes = await fetch(`${SUPABASE_URL}/functions/v1/create-license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          email: cleanEmail,
          name: name || '',
          license_type: 'lifetime'
        })
      });
      if (edgeLicRes.ok) {
        const edgeData = await edgeLicRes.json();
        dbLicenseId = edgeData.license_id;
        dbLicenseKey = edgeData.license_key;
      }
    }

    // 3. Mark payment completed in payment_orders
    await fetch(`${SUPABASE_URL}/rest/v1/payment_orders?provider_order_id=eq.${encodeURIComponent(razorpay_order_id)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        provider_payment_id: razorpay_payment_id,
        payment_status: 'completed',
        license_id: dbLicenseId || null,
        amount: (body.amount ? body.amount / 100 : 199),
        currency: 'INR',
        signature: razorpay_signature || null,
        customer_name: name || null
      })
    });
  } catch (syncErr) {
    console.warn('Database synchronization note:', syncErr.message);
  }

  const finalLicenseKey = dbLicenseKey || licenseKey;
  const licenseId = dbLicenseId || ('lic_' + razorpay_order_id.replace(/^order_/, ''));

  // 5. Save order & license state
  memoryStore.processedPayments.add(razorpay_payment_id);
  
  // Record verified purchase
  memoryStore.purchases.set(razorpay_payment_id, {
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    email: cleanEmail,
    name: name || '',
    amount: (body.amount ? body.amount / 100 : 199),
    currency: 'INR',
    product_id: productId,
    product_name: productName,
    payment_status: 'completed',
    license_id: licenseId,
    created_at: new Date().toISOString()
  });

  // Record active product entitlement
  memoryStore.entitlements.set(cleanEmail, {
    email: cleanEmail,
    product_id: productId,
    product_name: productName,
    status: 'active',
    granted_by: 'payment',
    created_at: new Date().toISOString()
  });

  // Record active license if plugin is owned
  if (hasPlugin) {
    memoryStore.licenses.set(razorpay_order_id, {
      id: licenseId,
      license_id: licenseId,
      license_key: finalLicenseKey,
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      email: cleanEmail,
      name: name || '',
      product_id: productId,
      product_name: productName,
      amount: (body.amount ? body.amount / 100 : 199),
      currency: 'INR',
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  const driveUrl = process.env.SFX_LIBRARY_DRIVE_URL || 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    ok: true,
    verified: true,
    license_key: finalLicenseKey,
    email: cleanEmail,
    order_id: razorpay_order_id,
    payment_id: razorpay_payment_id,
    amount: (body.amount ? body.amount / 100 : 199),
    currency: 'INR',
    delivery: {
      mode: 'web_dashboard',
      status: 'ready',
      info: hasPlugin ? 'License generated and ready for instant activation in My License & Downloads.' : 'Master SFX Library unlocked.'
    },
    downloads: {
      version: 'v2.2.0',
      zxp_url: hasPlugin ? '/downloads/sfx-composer-pro-v2.2.0.zxp' : null,
      zip_url: hasPlugin ? '/downloads/sfx-composer-pro-v2.2.0.zip' : null,
      sfx_library_url: hasLibrary ? driveUrl : null
    }
  }));
};
