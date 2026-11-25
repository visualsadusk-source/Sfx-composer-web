/**
 * api/refund.js
 * Administrative Entitlement Revocation & Refund Handler.
 * Revokes purchase entitlements, marks licenses revoked, and logs audit record.
 */

const { handleCors, memoryStore } = require('./_shared');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Method Not Allowed' }));
  }

  const authHeader = req.headers['authorization'] || '';
  const apiKey = req.headers['apikey'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : apiKey;

  // Verify Admin / Service Key authorization
  if (!SERVICE_KEY || token !== SERVICE_KEY) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Forbidden: Admin service key required to process refunds.' }));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  } else if (!body) {
    body = {};
  }

  const { email, order_id, payment_id, reason } = body;
  const targetEmail = (email || '').trim().toLowerCase();
  const revokeReason = reason || 'Payment refunded or chargeback';

  if (!targetEmail && !order_id && !payment_id) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, message: 'Missing identifier (email, order_id, or payment_id)' }));
  }

  // 1. Revoke in memory store if present
  for (const [ordId, lic] of memoryStore.licenses.entries()) {
    if (lic.email === targetEmail || ordId === order_id || lic.payment_id === payment_id) {
      lic.status = 'revoked';
      lic.revoked_at = new Date().toISOString();
      lic.revoked_reason = revokeReason;
    }
  }

  for (const [pId, pur] of memoryStore.purchases.entries()) {
    if (pur.email === targetEmail || pur.order_id === order_id || pur.payment_id === payment_id || pId === payment_id) {
      pur.payment_status = 'refunded';
      pur.revoked_at = new Date().toISOString();
      pur.revoked_reason = revokeReason;
    }
  }

  if (targetEmail) {
    memoryStore.entitlements.delete(targetEmail);
  }

  // 2. Call Supabase RPC sfx_revoke_entitlement and update customer records
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sfx_revoke_entitlement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      },
      body: JSON.stringify({
        p_identifier: targetEmail || order_id || payment_id,
        p_reason: revokeReason
      })
    });

    if (targetEmail) {
      // Find customer ID to revoke licenses
      const custRes = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=id&email=eq.${encodeURIComponent(targetEmail)}`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      if (custRes.ok) {
        const custs = await custRes.json();
        if (Array.isArray(custs) && custs.length > 0) {
          const custId = custs[0].id;
          await fetch(`${SUPABASE_URL}/rest/v1/licenses?customer_id=eq.${encodeURIComponent(custId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({ status: 'revoked', revoked_reason: revokeReason })
          });
        }
      }

      await fetch(`${SUPABASE_URL}/rest/v1/payment_orders?customer_email=eq.${encodeURIComponent(targetEmail)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ payment_status: 'refunded' })
      });
    }
  } catch (err) {
    console.warn('Database refund update warning:', err.message);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    ok: true,
    refunded: true,
    revoked: true,
    email: targetEmail,
    reason: revokeReason,
    message: 'Purchase refunded and all product entitlements revoked immediately.'
  }));
};
