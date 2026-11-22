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
    const cleanReqEmail = (body.email || '').trim().toLowerCase();

    // 1. Check for Supabase Auth JWT or custom session token in Bearer header
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
        if (token.startsWith('sfx_token_')) {
          try {
            const raw = atob(token.replace('sfx_token_', ''));
            const decoded = JSON.parse(raw);
            if (decoded && decoded.email && decoded.exp > Date.now()) {
              authEmail = decoded.email.trim().toLowerCase();
            }
          } catch (_e) {}
        } else {
          const { data: userData, error: userError } = await supabase.auth.getUser(token);
          if (!userError && userData?.user?.email) {
            authEmail = userData.user.email.trim().toLowerCase();
            authUserId = userData.user.id;
          }
        }
      }
    }

    // 2. Alternatively check for verified purchase proof in body
    const orderId = (body.order_id || body.razorpay_order_id || '').trim();
    const paymentId = (body.payment_id || body.razorpay_payment_id || '').trim();
    const proof = (body.proof || body.verification_proof || '').trim();

    if (!authEmail && cleanReqEmail) {
      if (orderId && paymentId) {
        const { data: orderRow } = await supabase
          .from('payment_orders')
          .select('customer_email, payment_status')
          .eq('provider_order_id', orderId)
          .eq('provider_payment_id', paymentId)
          .eq('payment_status', 'completed')
          .maybeSingle();

        if (orderRow && orderRow.customer_email.trim().toLowerCase() === cleanReqEmail) {
          authEmail = cleanReqEmail;
        }
      } else if (proof) {
        const { data: orderRow } = await supabase
          .from('payment_orders')
          .select('customer_email, payment_status')
          .or(`provider_order_id.eq.${encodeURIComponent(proof)},provider_payment_id.eq.${encodeURIComponent(proof)}`)
          .eq('payment_status', 'completed')
          .maybeSingle();

        if (orderRow && orderRow.customer_email.trim().toLowerCase() === cleanReqEmail) {
          authEmail = cleanReqEmail;
        }
      }
    }

    // 3. If no verified session/proof, verify purchase status in database
    if (!authEmail) {
      if (!cleanReqEmail) {
        return new Response(JSON.stringify({
          ok: false,
          code: 'UNAUTHENTICATED',
          message: 'Registered purchase email address is required.'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if email has completed purchase
      const { data: completedOrders } = await supabase
        .from('payment_orders')
        .select('id, provider_order_id, provider_payment_id, payment_status')
        .eq('customer_email', cleanReqEmail)
        .eq('payment_status', 'completed')
        .limit(1);

      if (!completedOrders || completedOrders.length === 0) {
        return new Response(JSON.stringify({
          ok: false,
          code: 'NOT_PAID',
          is_paid: false,
          email: cleanReqEmail,
          message: 'No verified purchase was found for this email.'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Paid purchase exists, but proof not yet provided on fresh session
      return new Response(JSON.stringify({
        ok: true,
        requires_verification: true,
        is_paid: true,
        email: cleanReqEmail,
        message: 'Verified purchase found! To protect your license details, please enter your Razorpay Order ID or Payment ID (from your receipt).'
      }), {
        status: 200,
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

    // 4. Strict Customer Ownership Check
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

      const { error: reissueErr } = await supabase.rpc('sfx_reissue_license_key', {
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

    // 5. Determine Specific Product Entitlements
    let hasPlugin = false;
    let hasLibrary = false;

    if (portalData && Array.isArray(portalData.orders)) {
      for (const ord of portalData.orders) {
        const pId = String(ord.product_id || '').toLowerCase();
        const pName = String(ord.product_name || '').toLowerCase();
        const isLibOnly = (pId.includes('library') || pName.includes('library')) && !pId.includes('bundle') && !pName.includes('bundle') && !pId.includes('plugin') && !pName.includes('plugin');
        const isPluginOnly = (pId.includes('plugin') || pName.includes('plugin') || pId.includes('pro')) && !pId.includes('bundle') && !pName.includes('bundle') && !pId.includes('library') && !pName.includes('library');

        if (isLibOnly) {
          hasLibrary = true;
        } else if (isPluginOnly) {
          hasPlugin = true;
        } else {
          hasPlugin = true;
          hasLibrary = true;
        }
      }
    }

    if (portalData && Array.isArray(portalData.licenses) && portalData.licenses.length > 0 && !hasPlugin && !hasLibrary) {
      hasPlugin = true;
      hasLibrary = true;
    }
    if (!hasPlugin && !hasLibrary) {
      hasPlugin = true;
      hasLibrary = true;
    }

    // Decrypt license keys for the verified customer (if plugin owned)
    if (portalData && Array.isArray(portalData.licenses)) {
      if (hasPlugin) {
        for (const lic of portalData.licenses) {
          lic.has_encrypted_key = !!lic.encrypted_license_key;
          if (lic.encrypted_license_key) {
            lic.license_key = await decryptLicenseKey(lic.encrypted_license_key);
          } else {
            lic.license_key = null;
          }
          delete lic.encrypted_license_key;
        }
      } else {
        // If customer purchased only library, do not show plugin license
        portalData.licenses = [];
      }
    }

    const driveUrl = (Deno.env.get('SFX_LIBRARY_DRIVE_URL') || 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing').trim();

    if (portalData) {
      const productName = (hasPlugin && hasLibrary)
        ? 'SFX Composer Complete Bundle'
        : (hasPlugin ? 'SFX Composer Plugin' : '7GB Master SFX Library');

      portalData.entitlements = {
        has_plugin: hasPlugin,
        has_library: hasLibrary,
        product_name: productName
      };

      portalData.downloads = {
        has_access: true,
        has_plugin: hasPlugin,
        has_library: hasLibrary,
        product_name: productName,
        zxp_url: hasPlugin ? '/downloads/sfx-composer-pro-v2.4.0.zxp' : null,
        zip_url: hasPlugin ? '/downloads/sfx-composer-pro-v2.4.0.zip' : null,
        sfx_library_url: hasLibrary ? driveUrl : null
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
