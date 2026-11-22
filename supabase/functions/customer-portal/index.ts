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
    const authHeader = req.headers.get('Authorization') || '';
    const body = await req.json().catch(() => ({}));

    // 1. Check for Supabase Auth JWT Bearer Token (Issued on Email + Password Login)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (!userError && userData?.user?.email) {
          authEmail = userData.user.email.trim().toLowerCase();
          authUserId = userData.user.id;
        }
      }
    }

    // 2. Alternatively check for verified purchase proof in body (from instant post-checkout session)
    if (!authEmail && body.email && body.order_id && body.payment_id) {
      const { data: orderRow } = await supabase
        .from('payment_orders')
        .select('customer_email, payment_status')
        .eq('provider_order_id', body.order_id)
        .eq('provider_payment_id', body.payment_id)
        .eq('payment_status', 'completed')
        .maybeSingle();

      if (orderRow && orderRow.customer_email.trim().toLowerCase() === body.email.trim().toLowerCase()) {
        authEmail = orderRow.customer_email.trim().toLowerCase();
      }
    }

    if (!authEmail) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required. Please sign in with your email and password to access your licenses.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Link authenticated auth.users ID with customer and license records for seamless ownership
    if (authUserId && authEmail) {
      try {
        await supabase.rpc('sfx_link_auth_user', {
          p_email: authEmail,
          p_user_id: authUserId
        });
      } catch (_e) {
        try {
          await supabase
            .from('customers')
            .update({ auth_user_id: authUserId })
            .ilike('email', authEmail)
            .is('auth_user_id', null);
        } catch (_err) {}
      }
    }

    // 3. Strict Customer Ownership Check
    // If a specific email is requested in the body, it MUST match the authenticated email
    if (body.email && body.email.trim().toLowerCase() !== authEmail) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'FORBIDDEN',
        message: 'Access denied: You cannot view or modify licenses belonging to another customer.'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const action = body.action || 'get_portal';

    // ── ACTION: Reissue License Key (For Recovery of Legacy Hashed Licenses or Customer Re-keying) ──
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

    // ── DEFAULT ACTION: Get Customer Portal Data ──
    const { data: portalData, error: portalError } = await supabase.rpc('sfx_get_customer_portal_v2', {
      p_email: authEmail
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
      }
    }

    if (portalData) {
      portalData.downloads = {
        zxp_url: '/downloads/sfx-composer-pro-v2.4.0.zxp',
        zip_url: '/downloads/sfx-composer-pro-v2.4.0.zip',
        sfx_library_url: (Deno.env.get('SFX_LIBRARY_DRIVE_URL') || 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing').trim()
      };
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
