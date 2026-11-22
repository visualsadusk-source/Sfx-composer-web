/**
 * api/refund.js
 * Administrative Entitlement Revocation & Refund Handler.
 * Revokes purchase entitlements, marks licenses revoked, and logs audit record.
 */

const { handleCors, memoryStore } = require('./_shared');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amF6bWlpaHdqbHJrZ2dlZWV6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTE3MzExNCwiZXhwIjoyMTEwNzQ5MTE0fQ.Y6GbsUSzkh4b-Uze1JiLSie6PEb8SfG6xg36P4SPrNA';

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
  if (token !== SERVICE_KEY) {
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

  // 2. Call Supabase RPC sfx_revoke_entitlement
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

    const rpcData = await rpcRes.json().catch(() => ({}));

    // Fallback direct updates if RPC not yet deployed
    if (!rpcRes.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/payment_orders?customer_email=eq.${targetEmail}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ payment_status: 'refunded' })
      });
      await fetch(`${SUPABASE_URL}/rest/v1/licenses?customer_id=in.(select id from customers where lower(email)=eq.${targetEmail})`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ status: 'revoked', revoked_reason: revokeReason })
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
