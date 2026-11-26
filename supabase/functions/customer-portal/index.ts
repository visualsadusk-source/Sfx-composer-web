/**
 * supabase/functions/customer-portal/index.ts
 *
 * Secure Purchase-Only Customer License & Download Retrieval.
 *
 * Authentication model:
 *   NO Supabase Auth, NO OTP, NO password login, NO magic links.
 *
 * Access rules:
 *   1. Customer must supply BOTH purchase email AND Razorpay Payment ID.
 *   2. Backend verifies both against trusted payment_orders rows in Supabase.
 *   3. Payment status must be "completed" (never pending, failed, refunded, revoked).
 *   4. Cross-customer mismatch is rejected immediately.
 *   5. License key is decrypted from encrypted_license_key stored in DB.
 *   6. Only the existing license is returned — never generated on lookup.
 *
 * Admin bypass:
 *   Supabase service-role key in Authorization header bypasses purchase check.
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { decryptLicenseKey, createSignedDownloadToken } from '../_shared/crypto.ts';
import { resolveLatestRelease } from '../_shared/release-resolver.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// In-memory rate limiting (per Deno isolate — resets on cold start, good enough for edge)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateLimitMap.get(key) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitMap.set(key, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') || '';

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { body = {}; }

  const cleanEmail = (body.email || '').trim().toLowerCase();
  const paymentId  = (body.payment_id || body.razorpay_payment_id || '').trim();
  const orderId    = (body.order_id   || body.razorpay_order_id   || '').trim();
  // Accept either payment_id or order_id as the proof token
  const paymentRef = paymentId || orderId;
  const action     = (body.action || 'get_portal').trim();

  // ── Rate limiting ────────────────────────────────────────────────────────────
  const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
  const rateLimitKey = `${clientIp}_${cleanEmail || 'anon'}`;
  if (isRateLimited(rateLimitKey)) {
    return json({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a minute before trying again.'
    }, 429);
  }

  // ── Admin bypass: service-role key in Authorization header ───────────────────
  const authHeader = req.headers.get('Authorization') || '';
  let isAdmin = false;
  let adminEmail: string | null = null;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    // Service-role JWT check
    if (token && token !== anonKey) {
      if (serviceKey && token === serviceKey) {
        isAdmin = true;
        adminEmail = cleanEmail || 'admin@sfxcomposer.internal';
      }
    }
  }

  // ── Purchase verification (required for non-admin) ───────────────────────────
  let verifiedEmail: string;

  if (isAdmin) {
    if (!cleanEmail) {
      return json({ ok: false, message: 'Admin requests must include the customer email.' }, 400);
    }
    verifiedEmail = cleanEmail;
  } else {
    // Require BOTH fields and sanitize paymentRef against PostgREST filter injection
    if (!cleanEmail || !paymentRef || !/^[A-Za-z0-9_-]{4,80}$/.test(paymentRef)) {
      return json({
        ok: false,
        code: 'NOT_PAID',
        is_paid: false,
        message: "We couldn't verify this purchase. Please check your purchase email and Razorpay Payment ID."
      }, 403);
    }

    // ── 1. Cross-customer mismatch check ──────────────────────────────────────
    // Does this paymentRef belong to a different email?
    const { data: ownerRows } = await supabase
      .from('payment_orders')
      .select('customer_email, payment_status')
      .or(`provider_payment_id.eq.${paymentRef},provider_order_id.eq.${paymentRef}`)
      .limit(5);

    if (ownerRows && ownerRows.length > 0) {
      const belongsToCustomer = ownerRows.some(
        (r: any) => r.customer_email.trim().toLowerCase() === cleanEmail
      );
      if (!belongsToCustomer) {
        // paymentRef exists but belongs to another email — silent generic error
        return json({
          ok: false,
          code: 'NOT_FOUND',
          is_paid: false,
          message: "We couldn't verify this purchase. Please check your purchase email and Razorpay Payment ID."
        }, 403);
      }
    }

    // ── 2. Look up the specific order matching email + paymentRef ─────────────
    const { data: orderRows, error: orderErr } = await supabase
      .from('payment_orders')
      .select('id, customer_email, provider_payment_id, provider_order_id, payment_status, license_id, amount, currency')
      .eq('customer_email', cleanEmail)
      .or(`provider_payment_id.eq.${paymentRef},provider_order_id.eq.${paymentRef}`)
      .limit(5);

    if (orderErr) {
      console.error('DB query error:', orderErr.message);
      return json({ ok: false, code: 'SERVER_ERROR', message: 'Error querying purchase records.' }, 500);
    }

    if (!orderRows || orderRows.length === 0) {
      return json({
        ok: false,
        code: 'NOT_FOUND',
        is_paid: false,
        message: "We couldn't verify this purchase. Please check your purchase email and Razorpay Payment ID."
      }, 403);
    }

    // ── 3. Payment status gating ──────────────────────────────────────────────
    const isRefunded = orderRows.some((r: any) => r.payment_status === 'refunded' || r.payment_status === 'revoked');
    if (isRefunded) {
      return json({
        ok: false,
        code: 'REFUNDED',
        is_paid: false,
        message: 'This purchase has been refunded or revoked. Access to licenses and downloads is disabled.'
      }, 403);
    }

    const isFailed = orderRows.some((r: any) => r.payment_status === 'failed' || r.payment_status === 'cancelled');
    if (isFailed && !orderRows.some((r: any) => r.payment_status === 'completed' || r.payment_status === 'captured')) {
      return json({
        ok: false,
        code: 'PAYMENT_FAILED',
        is_paid: false,
        message: 'Payment for this order was not completed. No active license found.'
      }, 403);
    }

    const isPending = orderRows.some((r: any) => r.payment_status === 'pending' || r.payment_status === 'created');
    if (isPending && !orderRows.some((r: any) => r.payment_status === 'completed' || r.payment_status === 'captured')) {
      return json({
        ok: false,
        code: 'PAYMENT_PENDING',
        is_paid: false,
        message: 'Payment for this order is pending confirmation. Please check back shortly.'
      }, 403);
    }

    const hasCompleted = orderRows.some((r: any) => r.payment_status === 'completed' || r.payment_status === 'captured');
    if (!hasCompleted) {
      return json({
        ok: false,
        code: 'NOT_PAID',
        is_paid: false,
        message: "We couldn't verify this purchase. Please check your purchase email and Razorpay Payment ID."
      }, 403);
    }

    verifiedEmail = cleanEmail;
  }

  // ── Reissue license key action ───────────────────────────────────────────────
  if (action === 'reissue_key' && body.license_id) {
    // Verify this license belongs to the verified customer
    const { data: licRow, error: licErr } = await supabase
      .from('licenses')
      .select('id, customer_id, customers!inner(email)')
      .eq('id', body.license_id)
      .single();

    if (licErr || !licRow) {
      return json({ ok: false, message: 'License not found.' }, 404);
    }

    const licEmail = (licRow.customers as any)?.email?.trim().toLowerCase();
    if (licEmail !== verifiedEmail) {
      return json({ ok: false, code: 'FORBIDDEN', message: 'Access denied.' }, 403);
    }

    // We won't generate new keys on this endpoint — just return existing
    return json({ ok: false, message: 'Key reissue must be performed by admin.' }, 403);
  }

  // ── Fetch full portal data via trusted RPC ───────────────────────────────────
  const { data: portalData, error: portalError } = await supabase
    .rpc('sfx_get_customer_portal_v2', { p_email: verifiedEmail });

  if (portalError) {
    console.error('RPC error:', portalError.message);
    return json({ ok: false, code: 'SERVER_ERROR', message: 'Error loading customer data.' }, 500);
  }

  if (!portalData || !portalData.found) {
    return json({
      ok: false,
      code: 'NOT_FOUND',
      is_paid: false,
      message: "We couldn't verify this purchase. Please check your purchase email and Razorpay Payment ID."
    }, 403);
  }

  // ── Determine product entitlements ───────────────────────────────────────────
  // The DB does not have a product_id column on payment_orders.
  // Default all verified purchases to full bundle (plugin + library).
  // If a future product_id column is added, extend this logic.
  const hasPlugin  = true;
  const hasLibrary = true;

  // ── Decrypt license keys ─────────────────────────────────────────────────────
  if (portalData && Array.isArray(portalData.licenses)) {
    for (const lic of portalData.licenses) {
      lic.has_encrypted_key = !!lic.encrypted_license_key;
      if (lic.encrypted_license_key) {
        try {
          lic.license_key = await decryptLicenseKey(lic.encrypted_license_key);
        } catch {
          lic.license_key = null;
        }
      } else {
        // Legacy license: encrypted_license_key is null but license_key_hash exists.
        // Cannot decrypt a one-way hash — flag for support retrieval.
        lic.license_key = null;
        lic.legacy_key = true; // Frontend should prompt to contact support
      }
      delete lic.encrypted_license_key;
    }
  }

  // ── Build download links ─────────────────────────────────────────────────────
  const driveUrl = (Deno.env.get('SFX_LIBRARY_DRIVE_URL') || 
    'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing').trim();

  const productName = 'SFX Composer Complete Bundle';

  // ── Build session token (HMAC-signed, 30-day, for quick re-access) ─────────
  const sessionToken = await createSignedDownloadToken({
    email: verifiedEmail,
    payment_id: paymentRef
  }, 30 * 24 * 3600 * 1000);
  const functionsBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
  const latestRelease = await resolveLatestRelease(supabase, { verifyStorageAsset: false });

  return json({
    ok: true,
    is_paid: true,
    verified: true,
    email: verifiedEmail,
    payment_id: paymentRef,
    token: sessionToken,
    customer_id: portalData.customer_id,
    entitlements: {
      has_plugin: hasPlugin,
      has_library: hasLibrary,
      product_name: productName
    },
    release: latestRelease.ok ? {
      latest_version: latestRelease.latest_version,
      release_date: latestRelease.release_date,
      changelog: latestRelease.changelog,
      release_notes_url: latestRelease.release_notes_url,
      platform_compatibility: latestRelease.platform_compatibility,
      sha256: latestRelease.sha256,
      approved: latestRelease.approved
    } : {
      available: false,
      code: latestRelease.code || 'RELEASE_UNAVAILABLE',
      message: latestRelease.message || 'Release information unavailable.'
    },
    license: portalData.licenses?.[0] || null,
    licenses: portalData.licenses || [],
    orders: portalData.orders || [],
    downloads: {
      has_access: true,
      has_plugin: hasPlugin,
      has_library: hasLibrary,
      product_name: productName,
      version: latestRelease.ok ? `v${latestRelease.latest_version}` : null,
      zxp_url: hasPlugin ? `${functionsBase}/download?type=zxp&token=${encodeURIComponent(sessionToken)}` : null,
      zip_url: hasPlugin ? `${functionsBase}/download?type=zip&token=${encodeURIComponent(sessionToken)}` : null,
      sfx_library_url: hasLibrary ? `${functionsBase}/download?type=sfx-library&token=${encodeURIComponent(sessionToken)}` : null
    }
  });
});
