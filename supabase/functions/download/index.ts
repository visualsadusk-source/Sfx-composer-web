/**
 * supabase/functions/download/index.ts
 *
 * Authenticated, Entitlement-Verified Download Gateway for Production.
 * Replaces local-only /api/download and /downloads/* paths on GitHub Pages.
 *
 * Accepts:
 *   GET  /functions/v1/download?type=zxp|zip|sfx-library&token=sfx_token_...
 *   POST /functions/v1/download  { type, token? | license_key? | email & payment_id? }
 *
 * Security:
 *   - Verifies HMAC-signed session token OR active license_key OR email+payment_id
 *   - Re-checks payment_orders in Supabase so refunded/revoked users are blocked immediately
 *   - Generates short-lived (60s) signed URLs from private Storage for plugin binaries
 *   - Never exposes private download URLs to unauthenticated or unpaid callers
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { sha256, verifySignedDownloadToken } from '../_shared/crypto.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_TYPES = new Set(['zxp', 'zip', 'sfx-library']);

const ASSET_PATHS: Record<string, { objectPath: string; downloadName: string }> = {
  zxp: { objectPath: 'sfx-composer-pro-v2.2.0.zxp', downloadName: 'sfx-composer-pro-v2.2.0.zxp' },
  zip: { objectPath: 'sfx-composer-pro-v2.2.0.zxp', downloadName: 'sfx-composer-pro-v2.2.0.zip' }
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, message: 'Server configuration missing' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  const url = new URL(req.url);
  let body: Record<string, string> = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const downloadType = (url.searchParams.get('type') || body.type || 'zxp').trim().toLowerCase();
  if (!ALLOWED_TYPES.has(downloadType)) {
    return json({ ok: false, code: 'INVALID_TYPE', message: 'Invalid download type requested.' }, 400);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  const token = (url.searchParams.get('token') || body.token || bearerToken || '').trim();
  const licenseKey = (url.searchParams.get('license_key') || body.license_key || '').trim();
  const bodyEmail = (body.email || '').trim().toLowerCase();
  const bodyPaymentRef = (body.payment_id || body.order_id || '').trim();

  let verifiedEmail = '';
  let verifiedPaymentRef = '';
  let authorizedByLicense = false;

  // 1. Authenticate caller via signed sfx_token_...
  if (token && token.startsWith('sfx_token_')) {
    const payload = await verifySignedDownloadToken(token);
    if (!payload || typeof payload.email !== 'string') {
      return json({ ok: false, code: 'UNAUTHORIZED', message: 'Invalid or expired download token.' }, 401);
    }
    verifiedEmail = payload.email.trim().toLowerCase();
    verifiedPaymentRef = typeof payload.payment_id === 'string' ? payload.payment_id.trim() : '';
  } else if (licenseKey) {
    // 2. Or authenticate via active license key
    const cleanKey = licenseKey.toUpperCase();
    if (!/^SFX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey)) {
      return json({ ok: false, code: 'INVALID_LICENSE', message: 'Invalid license key format.' }, 403);
    }
    const keyHash = await sha256(cleanKey);
    const { data: licRow } = await supabase
      .from('licenses')
      .select('id, status, expires_at, customers!inner(email)')
      .eq('license_key_hash', keyHash)
      .maybeSingle();

    if (!licRow || licRow.status !== 'active') {
      return json({ ok: false, code: 'FORBIDDEN', message: 'License is invalid, revoked, or inactive.' }, 403);
    }
    if (licRow.expires_at && new Date(licRow.expires_at).getTime() < Date.now()) {
      return json({ ok: false, code: 'EXPIRED', message: 'License has expired.' }, 403);
    }
    verifiedEmail = ((licRow.customers as { email?: string })?.email || '').trim().toLowerCase();
    authorizedByLicense = true;
  } else if (bodyEmail && bodyPaymentRef && /^[A-Za-z0-9_-]{4,80}$/.test(bodyPaymentRef)) {
    // 3. Or authenticate via email + Razorpay payment/order ID
    verifiedEmail = bodyEmail;
    verifiedPaymentRef = bodyPaymentRef;
  } else {
    return json({ ok: false, code: 'UNAUTHORIZED', message: 'Authentication required to download.' }, 401);
  }

  // 4. Verify active, unrefunded purchase entitlement in payment_orders
  if (!authorizedByLicense) {
    if (!verifiedEmail) {
      return json({ ok: false, code: 'FORBIDDEN', message: 'Purchase verification failed.' }, 403);
    }
    let query = supabase
      .from('payment_orders')
      .select('id, payment_status, provider_payment_id, provider_order_id')
      .eq('customer_email', verifiedEmail);

    if (verifiedPaymentRef && /^[A-Za-z0-9_-]{4,80}$/.test(verifiedPaymentRef)) {
      query = query.or(`provider_payment_id.eq.${verifiedPaymentRef},provider_order_id.eq.${verifiedPaymentRef}`);
    }

    const { data: orderRows, error: ordErr } = await query.limit(10);
    if (ordErr) {
      console.error('Download entitlement DB error:', ordErr.message);
      return json({ ok: false, code: 'SERVER_ERROR', message: 'Failed to verify entitlement.' }, 500);
    }

    if (!orderRows || orderRows.length === 0) {
      return json({ ok: false, code: 'NOT_PAID', message: 'No verified purchase found.' }, 403);
    }

    const hasRefunded = orderRows.some((r: any) => r.payment_status === 'refunded' || r.payment_status === 'revoked');
    const hasCompleted = orderRows.some((r: any) => r.payment_status === 'completed' || r.payment_status === 'captured');

    if (hasRefunded && !hasCompleted) {
      return json({ ok: false, code: 'REFUNDED', message: 'This purchase has been refunded or revoked.' }, 403);
    }
    if (!hasCompleted) {
      return json({ ok: false, code: 'NOT_PAID', message: 'Payment is not completed.' }, 403);
    }
  }

  // 5. Deliver authorized asset
  if (downloadType === 'sfx-library') {
    const driveUrl = (Deno.env.get('SFX_LIBRARY_DRIVE_URL') || '').trim();
    if (!driveUrl) {
      return json({
        ok: false,
        code: 'LIBRARY_URL_NOT_CONFIGURED',
        message: 'SFX Library download URL is not configured on the server.'
      }, 503);
    }
    if (req.method === 'GET') {
      return Response.redirect(driveUrl, 302);
    }
    return json({ ok: true, type: 'sfx-library', download_url: driveUrl });
  }

  // Plugin ZXP / ZIP from private Supabase Storage bucket
  const bucket = (Deno.env.get('SFX_DOWNLOAD_BUCKET') || 'private-downloads').trim();
  const asset = ASSET_PATHS[downloadType];
  const { data: signedData, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(asset.objectPath, 60, { download: asset.downloadName });

  if (signErr || !signedData?.signedUrl) {
    console.error('Signed URL generation error:', signErr?.message || 'missing asset');
    return json({
      ok: false,
      code: 'ASSET_UNAVAILABLE',
      message: 'Plugin installer package is not yet uploaded to private storage.'
    }, 503);
  }

  if (req.method === 'GET') {
    return Response.redirect(signedData.signedUrl, 302);
  }
  return json({ ok: true, type: downloadType, download_url: signedData.signedUrl });
});
