import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { decryptLicenseKey, encryptLicenseKey, generateLicenseKey, sha256 } from '../_shared/crypto.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });

  try {
    let authEmail: string | null = null;
    let authUserId: string | null = null;
    let isVerifiedOwner = false;
    const authHeader = req.headers.get('Authorization') || '';
    const body = await req.json().catch(() => ({}));

    // 1. Check for Bearer Token (Supabase Auth JWT or custom session token)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
        if (token.startsWith('sfx_token_')) {
          try {
            const raw = atob(token.replace('sfx_token_', ''));
            const decoded = JSON.parse(raw);
            if (decoded && decoded.email && decoded.exp > Date.now()) {
              authEmail = decoded.email.trim().toLowerCase();
              isVerifiedOwner = true;
            }
          } catch (_e) {}
        } else {
          const { data: userData, error: userError } = await supabase.auth.getUser(token);
          if (!userError && userData?.user?.email) {
            authEmail = userData.user.email.trim().toLowerCase();
            authUserId = userData.user.id;
            isVerifiedOwner = true;
          }
        }
      }
    }

    const cleanReqEmail = (body.email || '').trim().toLowerCase();
    const orderId = (body.order_id || body.razorpay_order_id || '').trim();
    const paymentId = (body.payment_id || body.razorpay_payment_id || '').trim();
    const proof = (body.proof || body.verification_proof || '').trim();

    // 2. Check for verified purchase proof in body
    if (!isVerifiedOwner && cleanReqEmail) {
      if (orderId && paymentId) {
        const { data: orderRow } = await supabase
          .from('payment_orders')
          .select('customer_email, payment_status, license_id')
          .eq('provider_order_id', orderId)
          .eq('provider_payment_id', paymentId)
          .eq('payment_status', 'completed')
          .maybeSingle();

        if (orderRow && orderRow.customer_email.trim().toLowerCase() === cleanReqEmail) {
          authEmail = cleanReqEmail;
          isVerifiedOwner = true;
        }
      } else if (proof) {
        const { data: orderRow } = await supabase
          .from('payment_orders')
          .select('customer_email, payment_status, license_id')
          .or(`provider_order_id.eq.${proof},provider_payment_id.eq.${proof}`)
          .eq('payment_status', 'completed')
          .maybeSingle();

        if (orderRow && orderRow.customer_email.trim().toLowerCase() === cleanReqEmail) {
          authEmail = cleanReqEmail;
          isVerifiedOwner = true;
        }
      }
    }

    // 3. Unauthenticated request with neither email nor auth
    if (!cleanReqEmail && !authEmail) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'UNAUTHENTICATED',
        message: 'Registered purchase email address is required.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Strict Customer Isolation: User cannot view or modify licenses belonging to another customer
    if (isVerifiedOwner && cleanReqEmail && authEmail && cleanReqEmail !== authEmail) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Access denied: You cannot view or modify licenses belonging to another customer.'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const targetEmail = authEmail || cleanReqEmail;

    // 5. Query Completed Purchases in Database
    const { data: dbOrders } = await supabase
      .from('payment_orders')
      .select('id, provider_order_id, provider_payment_id, amount, currency, payment_status, created_at, license_id')
      .eq('customer_email', targetEmail)
      .eq('payment_status', 'completed');

    const hasCompletedOrder = Array.isArray(dbOrders) && dbOrders.length > 0;

    // 6. Test 1 Check: An unpaid email cannot retrieve a license
    if (!hasCompletedOrder) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'NOT_PAID',
        is_paid: false,
        email: targetEmail,
        message: 'No verified purchase found for this email address. Please make sure to enter the exact email used during checkout.'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 7. Security: If paid customer, but ownership proof not yet provided (e.g. typing email on fresh device)
    // NEVER trust an email address alone as proof of purchase ownership!
    if (!isVerifiedOwner) {
      return new Response(JSON.stringify({
        ok: true,
        requires_verification: true,
        is_paid: true,
        email: targetEmail,
        message: 'Verified purchase found! To protect your license key, please enter your Razorpay Order ID or Payment ID (from your receipt).'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const action = body.action || 'get_portal';

    // ── ACTION: Reissue License Key (Customer initiated recovery & reissue) ──
    if (action === 'reissue_key') {
      const { license_id } = body;
      if (!license_id) {
        return new Response(JSON.stringify({ ok: false, message: 'license_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Verify that this license strictly belongs to the authenticated customer
      const { data: licRow, error: licErr } = await supabase
        .from('licenses')
        .select('id, customer_id, customers!inner(email)')
        .eq('id', license_id)
        .single();

      if (licErr || !licRow) {
        return new Response(JSON.stringify({ ok: false, message: 'License not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const licCustEmail = (licRow.customers as any)?.email?.trim().toLowerCase();
      if (licCustEmail !== authEmail) {
        return new Response(JSON.stringify({
          ok: false,
          code: 'FORBIDDEN',
          message: 'Access denied: You can only reissue licenses that belong to your account.'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Generate a fresh, high-entropy license key
      const newKey = generateLicenseKey();
      const newHash = await sha256(newKey);
      const newEncryptedKey = await encryptLicenseKey(newKey);

      const { data: reissueRes, error: reissueErr } = await supabase.rpc('sfx_reissue_license_key', {
        p_license_id: license_id,
        p_new_license_key_hash: newHash,
        p_new_encrypted_license_key: newEncryptedKey,
        p_reason: 'Customer initiated recovery & reissue'
      });

      if (reissueErr) throw reissueErr;

      return new Response(JSON.stringify({
        ok: true,
        license_id: license_id,
        license_key: newKey,
        message: 'License key successfully reissued and secured with encryption-at-rest.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── DEFAULT ACTION: Get Verified Customer Portal Data ──
    const { data: portalData, error: portalError } = await supabase.rpc('sfx_get_customer_portal_v2', {
      p_email: targetEmail
    });

    if (portalError) {
      throw portalError;
    }

    // Decrypt license keys for the verified customer
    if (portalData && Array.isArray(portalData.licenses)) {
      for (const lic of portalData.licenses) {
        lic.has_encrypted_key = !!lic.encrypted_license_key;
        if (lic.encrypted_license_key) {
          lic.license_key = await decryptLicenseKey(lic.encrypted_license_key);
        } else {
          lic.license_key = null;
        }
        delete lic.encrypted_license_key;
        lic.license_id = lic.id;
        lic.product_id = 'sfx-composer-bundle';
        lic.product_name = 'SFX Composer Complete Bundle';
      }
    }

    const sessionToken = 'sfx_token_' + btoa(JSON.stringify({
      email: targetEmail,
      exp: Date.now() + 30 * 24 * 3600 * 1000
    }));

    if (portalData) {
      portalData.token = sessionToken;
      portalData.verified = true;
      if (portalData.is_paid && Array.isArray(portalData.licenses) && portalData.licenses.length > 0) {
        portalData.downloads = {
          has_access: true,
          product_id: 'sfx-composer-bundle',
          product_name: 'SFX Composer Complete Bundle',
          zxp_url: `/downloads/sfx-composer-pro-v2.4.0.zxp?token=${encodeURIComponent(sessionToken)}`,
          zip_url: `/downloads/sfx-composer-pro-v2.4.0.zip?token=${encodeURIComponent(sessionToken)}`,
          sfx_library_url: (Deno.env.get('SFX_LIBRARY_DRIVE_URL') || 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing').trim()
        };
      } else {
        portalData.downloads = null;
      }
    }

    return new Response(JSON.stringify(portalData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'SERVER_ERROR',
      message: err.message || 'Error loading customer dashboard'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
