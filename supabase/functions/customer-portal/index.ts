import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { decryptLicenseKey } from '../_shared/crypto.ts';
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
    const authHeader = req.headers.get('Authorization') || '';

    // 1. Check for Supabase Auth JWT Bearer Token
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (!userError && userData?.user?.email) {
          authEmail = userData.user.email.trim().toLowerCase();
        }
      }
    }

    // 2. Alternatively check for verified purchase proof in body
    const body = await req.json().catch(() => ({}));
    if (!authEmail && body.email && body.order_id && body.payment_id) {
      // Verify directly against payment_orders
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
        message: 'Email verification required. Please sign in with OTP verification to access your licenses.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Fetch portal data via RPC
    const { data: portalData, error: portalError } = await supabase.rpc('sfx_get_customer_portal_v2', {
      p_email: authEmail
    });

    if (portalError) {
      throw portalError;
    }

    // 4. Decrypt license keys for the verified customer
    if (portalData && Array.isArray(portalData.licenses)) {
      for (const lic of portalData.licenses) {
        if (lic.encrypted_license_key) {
          lic.license_key = await decryptLicenseKey(lic.encrypted_license_key);
        } else {
          lic.license_key = null;
        }
        delete lic.encrypted_license_key;
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
