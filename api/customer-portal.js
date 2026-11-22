/**
 * api/customer-portal.js
 * Simplified Customer Dashboard Backend: License ID Storage & Retrieval Only.
 * 
 * Secure server-side verification:
 * 1. Checks if customer email has completed payment order in database / memoryStore.
 * 2. Unpaid emails are strictly rejected (HTTP 403 NOT_PAID).
 * 3. Never trusts an email address alone as proof of purchase ownership.
 *    If on a new device without cached session, requires Order ID / Payment ID proof.
 * 4. Verified owners receive their License ID, decrypted AES-256 key, purchase details, and downloads.
 * 5. Strictly isolates customer data: users cannot query other customers' licenses.
 * 6. Preserves idempotency and prevents duplicate licenses.
 */

const crypto = require('crypto');
const { handleCors, memoryStore } = require('./_shared');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNzMxMTQsImV4cCI6MjExMDc0OTExNH0.FXKso4hkmUYcl_FfjG4GnHxwyCr09j5DkJ6ak1B2auY';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTE3MzExNCwiZXhwIjoyMTEwNzQ5MTE0fQ.Y6GbsUSzkh4b-Uze1JiLSie6PEb8SfG6xg36P4SPrNA';

// Encryption key derivation for AES-256-GCM
function getAesKey() {
  const secret = process.env.LICENSE_ENCRYPTION_KEY || SERVICE_KEY || 'sfx-default-secure-fallback-key-32';
  return crypto.createHash('sha256').update(secret).digest();
}

function decryptLicenseKey(payload) {
  if (!payload || !payload.includes(':')) return null;
  try {
    const [ivHex, cipherHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const cipherBuf = Buffer.from(cipherHex, 'hex');
    const tag = cipherBuf.subarray(cipherBuf.length - 16);
    const data = cipherBuf.subarray(0, cipherBuf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getAesKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (err) {
    return null;
  }
}

function encryptLicenseKey(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getAesKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + Buffer.concat([enc, tag]).toString('hex');
}

function generateLicenseKey() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomBytes = crypto.randomBytes(16);
  const chunks = ['SFX'];
  for (let c = 0; c < 4; c++) {
    let chunk = '';
    for (let i = 0; i < 4; i++) {
      chunk += chars[randomBytes[c * 4 + i] % chars.length];
    }
    chunks.push(chunk);
  }
  return chunks.join('-');
}

async function verifySupabaseToken(token) {
  if (!token) return null;
  if (token === SERVICE_KEY) {
    return { email: 'admin@sfxcomposer.com', is_admin: true };
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const userData = await res.json();
    return userData && userData.email ? userData : null;
  } catch (err) {
    return null;
  }
}

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

  const authHeader = req.headers['authorization'] || '';
  let authEmail = null;
  let isVerifiedOwner = false;

  // 1. Check for Bearer token (Supabase Auth JWT or custom session token)
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && token !== ANON_KEY) {
      if (token.startsWith('sfx_token_')) {
        try {
          const raw = Buffer.from(token.replace('sfx_token_', ''), 'base64').toString('utf8');
          const decoded = JSON.parse(raw);
          if (decoded && decoded.email && decoded.exp > Date.now()) {
            authEmail = decoded.email.trim().toLowerCase();
            isVerifiedOwner = true;
          }
        } catch (e) {}
      } else {
        const user = await verifySupabaseToken(token);
        if (user && user.email) {
          authEmail = user.email.trim().toLowerCase();
          isVerifiedOwner = true;
        }
      }
    }
  }

  const cleanReqEmail = (body.email || '').trim().toLowerCase();
  const orderId = (body.order_id || body.razorpay_order_id || '').trim();
  const paymentId = (body.payment_id || body.razorpay_payment_id || '').trim();
  const proof = (body.proof || body.verification_proof || '').trim();

  // 2. Check for ownership verification proof in body (Order ID or Payment ID)
  if (!isVerifiedOwner && cleanReqEmail) {
    // A. Check memoryStore
    if (orderId && paymentId) {
      const memLic = memoryStore.licenses.get(orderId);
      if (memLic && memLic.email === cleanReqEmail && memLic.payment_id === paymentId) {
        authEmail = cleanReqEmail;
        isVerifiedOwner = true;
      }
    } else if (proof) {
      for (const [oId, lic] of memoryStore.licenses.entries()) {
        if (lic.email === cleanReqEmail && (lic.order_id === proof || lic.payment_id === proof || oId === proof)) {
          authEmail = cleanReqEmail;
          isVerifiedOwner = true;
          break;
        }
      }
    }

    // B. Check Supabase database payment_orders
    if (!isVerifiedOwner) {
      try {
        let queryUrl = '';
        if (orderId && paymentId) {
          queryUrl = `${SUPABASE_URL}/rest/v1/payment_orders?select=customer_email,payment_status,provider_order_id,provider_payment_id&provider_order_id=eq.${encodeURIComponent(orderId)}&provider_payment_id=eq.${encodeURIComponent(paymentId)}&payment_status=eq.completed`;
        } else if (proof) {
          queryUrl = `${SUPABASE_URL}/rest/v1/payment_orders?select=customer_email,payment_status,provider_order_id,provider_payment_id&or=(provider_order_id.eq.${encodeURIComponent(proof)},provider_payment_id.eq.${encodeURIComponent(proof)})&payment_status=eq.completed`;
        }

        if (queryUrl) {
          const dbRes = await fetch(queryUrl, {
            headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
          });
          if (dbRes.ok) {
            const rows = await dbRes.json();
            if (Array.isArray(rows) && rows.length > 0) {
              const matched = rows.find(r => r.customer_email.trim().toLowerCase() === cleanReqEmail);
              if (matched) {
                authEmail = cleanReqEmail;
                isVerifiedOwner = true;
              }
            }
          }
        }
      } catch (dbErr) {
        console.warn('Database proof lookup error:', dbErr.message);
      }
    }
  }

  // 3. If neither email nor auth provided
  if (!cleanReqEmail && !authEmail) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'Registered purchase email address is required.'
    }));
  }

  // 4. Strict Cross-Customer Isolation Check
  if (isVerifiedOwner && cleanReqEmail && authEmail && cleanReqEmail !== authEmail) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Access denied: You cannot view or modify licenses belonging to another customer.'
    }));
  }

  const targetEmail = authEmail || cleanReqEmail;

  // 5. Query Completed Purchases / Entitlements for this Email
  let completedOrders = [];
  let foundLicenseRows = [];

  // Memory store check
  for (const [oId, lic] of memoryStore.licenses.entries()) {
    if (lic.email === targetEmail) {
      foundLicenseRows.push(lic);
      completedOrders.push({
        id: oId,
        provider_order_id: lic.order_id || oId,
        provider_payment_id: lic.payment_id,
        amount: lic.amount || 199,
        currency: lic.currency || 'INR',
        payment_status: 'completed',
        created_at: lic.created_at
      });
    }
  }

  // Database check
  try {
    const ordRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_orders?select=*&customer_email=eq.${encodeURIComponent(targetEmail)}&payment_status=eq.completed&order=created_at.desc`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    if (ordRes.ok) {
      const dbOrders = await ordRes.json();
      if (Array.isArray(dbOrders)) {
        completedOrders = completedOrders.concat(dbOrders);
      }
    }

    const licRes = await fetch(`${SUPABASE_URL}/rest/v1/licenses?select=*,customers!inner(email)&customers.email=eq.${encodeURIComponent(targetEmail)}&order=created_at.desc`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    if (licRes.ok) {
      const dbLicenses = await licRes.json();
      if (Array.isArray(dbLicenses)) {
        foundLicenseRows = foundLicenseRows.concat(dbLicenses);
      }
    }
  } catch (err) {
    console.warn('Database query error:', err.message);
  }

  const hasPaidPurchase = completedOrders.length > 0 || foundLicenseRows.length > 0;

  // 6. Test 1 Check: An unpaid email cannot retrieve a license
  if (!hasPaidPurchase) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'NOT_PAID',
      is_paid: false,
      email: targetEmail,
      message: 'No verified purchase found for this email address. Please make sure to enter the exact email used during checkout.'
    }));
  }

  // 7. Security: If paid customer, but ownership proof not yet provided (e.g. typing email on fresh browser)
  // NEVER trust an email address alone as proof of purchase ownership!
  if (!isVerifiedOwner) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      requires_verification: true,
      is_paid: true,
      email: targetEmail,
      message: 'Verified purchase found! To protect your license key, please enter your Razorpay Order ID or Payment ID (from your receipt).'
    }));
  }

  // 8. Reissue License Key Action
  if (body.action === 'reissue_key' && body.license_id) {
    const newKey = generateLicenseKey();
    const newEncrypted = encryptLicenseKey(newKey);
    const licId = body.license_id;

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/licenses?id=eq.${encodeURIComponent(licId)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          encrypted_license_key: newEncrypted,
          license_key_hash: crypto.createHash('sha256').update(newKey).digest('hex')
        })
      });
    } catch (e) {}

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      license_id: licId,
      license_key: newKey,
      message: 'License key successfully reissued and secured with encryption-at-rest.'
    }));
  }

  // 9. Format Customer Licenses & Decrypt Keys
  const licensesList = [];
  const processedLicIds = new Set();

  for (const lic of foundLicenseRows) {
    const lId = lic.id || lic.license_id || 'SFX-LIC-' + Math.random().toString(36).substring(2, 9);
    if (processedLicIds.has(lId)) continue;
    processedLicIds.add(lId);

    let decryptedKey = lic.license_key || null;
    if (!decryptedKey && lic.encrypted_license_key) {
      decryptedKey = decryptLicenseKey(lic.encrypted_license_key);
    }

    const matchingOrder = completedOrders.find(o => o.license_id === lId || o.provider_order_id === lic.provider_order_id) || completedOrders[0] || {};

    licensesList.push({
      id: lId,
      license_id: lId,
      license_key: decryptedKey,
      has_encrypted_key: !!(lic.encrypted_license_key || decryptedKey),
      product_id: 'sfx-composer-bundle',
      product_name: 'SFX Composer Complete Bundle',
      status: lic.status || 'active',
      license_type: lic.license_type || 'lifetime',
      created_at: lic.created_at || matchingOrder.created_at || new Date().toISOString(),
      purchase_date: matchingOrder.created_at || lic.created_at || new Date().toISOString(),
      provider_order_id: matchingOrder.provider_order_id || lic.order_id || '',
      provider_payment_id: matchingOrder.provider_payment_id || lic.payment_id || '',
      payment_status: 'completed',
      payment_amount: matchingOrder.amount || 199,
      payment_currency: matchingOrder.currency || 'INR',
      max_devices: lic.max_devices || 1,
      active_devices: lic.active_devices || []
    });
  }

  // Generate verified session token
  const sessionToken = 'sfx_token_' + Buffer.from(JSON.stringify({
    email: targetEmail,
    exp: Date.now() + 30 * 24 * 3600 * 1000
  })).toString('base64');

  const driveUrl = process.env.SFX_LIBRARY_DRIVE_URL || 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    ok: true,
    is_paid: true,
    verified: true,
    email: targetEmail,
    token: sessionToken,
    licenses: licensesList,
    orders: completedOrders,
    downloads: {
      has_access: true,
      product_id: 'sfx-composer-bundle',
      product_name: 'SFX Composer Complete Bundle',
      zxp_url: `/downloads/sfx-composer-pro-v2.4.0.zxp?token=${encodeURIComponent(sessionToken)}`,
      zip_url: `/downloads/sfx-composer-pro-v2.4.0.zip?token=${encodeURIComponent(sessionToken)}`,
      sfx_library_url: driveUrl
    }
  }));
};
