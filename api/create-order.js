/**
 * api/create-order.js
 * Vercel Serverless Function / Node.js endpoint: Creates secure Razorpay order.
 * Enforces price = ₹199 INR (19900 paise).
 */

const { handleCors, makeRazorpayRequest, memoryStore } = require('./_shared');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
  }

  // Parse JSON body
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  } else if (!body) {
    body = {};
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'A valid customer email is required.' }));
  }

  const rzpKeyId = process.env.RAZORPAY_KEY_ID;
  const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!rzpKeyId || !rzpKeySecret) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'MISSING_CREDENTIALS',
      message: 'Razorpay API credentials (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET) are not configured on the backend.'
    }));
  }

  // Strict Product Constraints: ₹199 INR (19900 paise default)
  const amountPaise = body.amount || 19900;
  const currency = 'INR';
  const receipt = `sfx_rcpt_${Date.now().toString(36)}`;
  const productId = body.product_id || 'sfx-composer-bundle';
  const productName = body.product_name || (productId.includes('library') ? '7GB Master SFX Library' : (productId.includes('plugin') ? 'SFX Composer Plugin' : 'SFX Composer Ultimate Bundle (Plugin + 7GB SFX Library)'));

  try {
    const rzpRes = await makeRazorpayRequest('/v1/orders', 'POST', {
      amount: amountPaise,
      currency: currency,
      receipt: receipt,
      notes: {
        customer_email: email,
        product: productName,
        product_id: productId,
        price_inr: String(amountPaise / 100)
      }
    }, rzpKeyId, rzpKeySecret);

    if (!rzpRes.ok) {
      console.error('Razorpay Orders API error:', rzpRes.data || rzpRes.text);
      res.statusCode = rzpRes.status || 502;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        ok: false,
        message: 'Failed to create order on Razorpay API',
        details: rzpRes.data || rzpRes.text
      }));
    }

    const orderData = rzpRes.data;

    // Cache order in memory
    memoryStore.orders.set(orderData.id, {
      id: orderData.id,
      email: email,
      amount: amountPaise,
      currency: currency,
      product_id: productId,
      product_name: productName,
      status: 'created',
      created_at: new Date().toISOString()
    });

    // Synchronize pending order to Supabase payment_orders
    try {
      const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/sfx_record_payment_order`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_customer_email: email,
          p_payment_provider: 'razorpay',
          p_provider_order_id: orderData.id,
          p_amount: (amountPaise / 100),
          p_currency: currency
        })
      });
    } catch (dbErr) {
      console.warn('Database note recording pending order:', dbErr.message);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      order_id: orderData.id,
      amount: orderData.amount || amountPaise,
      currency: orderData.currency || currency,
      key_id: rzpKeyId
    }));
  } catch (err) {
    console.error('Order creation error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      message: 'Internal server error while creating Razorpay order',
      error: err.message
    }));
  }
};
