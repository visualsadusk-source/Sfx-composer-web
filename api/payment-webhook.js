/**
 * api/payment-webhook.js
 * Vercel Serverless Function / Node.js endpoint: Razorpay Webhook Handler.
 * Verifies webhook signature and ensures license issuance even if user closes browser before callback.
 */

const crypto = require('crypto');
const { handleCors, generateLicenseKey, memoryStore } = require('./_shared');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
  }

  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

  // Read raw body
  let rawBody = '';
  if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf8');
  } else if (req.body && typeof req.body === 'object') {
    rawBody = JSON.stringify(req.body);
  }

  // Enforce HMAC signature verification — never accept unsigned webhooks
  if (!webhookSecret) {
    console.error('RAZORPAY_WEBHOOK_SECRET is not configured.');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Webhook verification secret is not configured.' }));
  }

  if (!signature) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Missing x-razorpay-signature header' }));
  }

  try {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature.trim().toLowerCase(), 'hex');
    const expBuf = Buffer.from(expected.toLowerCase(), 'hex');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, message: 'Invalid webhook signature' }));
    }
  } catch (err) {
    console.error('Webhook signature verification error:', err);
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Signature verification error' }));
  }

  let eventPayload = {};
  try {
    eventPayload = JSON.parse(rawBody);
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Invalid JSON payload' }));
  }

  const event = eventPayload.event;
  console.log('Received Razorpay Webhook Event:', event);

  if (event === 'payment.captured' || event === 'order.paid') {
    const paymentEntity = eventPayload.payload?.payment?.entity || {};
    const orderId = paymentEntity.order_id || eventPayload.payload?.order?.entity?.id;
    const paymentId = paymentEntity.id;
    const email = paymentEntity.email || paymentEntity.notes?.customer_email;

    // Check amount: ₹199 (19900 paise)
    if (paymentEntity.amount && (paymentEntity.amount !== 19900 || paymentEntity.currency !== 'INR')) {
      console.warn(`Webhook amount mismatch: ${paymentEntity.amount} ${paymentEntity.currency}`);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ status: 'ignored', reason: 'Amount mismatch' }));
    }

    if (orderId && !memoryStore.processedPayments.has(paymentId)) {
      const licenseKey = generateLicenseKey();
      memoryStore.processedPayments.add(paymentId);
      memoryStore.licenses.set(orderId, {
        license_key: licenseKey,
        order_id: orderId,
        payment_id: paymentId,
        email: (email || '').toLowerCase(),
        amount: 199,
        currency: 'INR',
        status: 'active',
        created_at: new Date().toISOString()
      });
      console.log(`Webhook successfully fulfilled order ${orderId} -> License generated`);
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ status: 'ok', received: true }));
};
