import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
import { decryptLicenseKey } from '../_shared/crypto.ts';
import { sendLicenseEmailBrevo } from '../_shared/brevo.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 1. Verify admin authorization
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ ok: false, message: auth.error || 'Unauthorized' }), {
      status: auth.statusCode || 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false }
    });

    let body: any = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch (e) {}
    } else {
      const url = new URL(req.url);
      body.action = url.searchParams.get('action');
      body.query = url.searchParams.get('query');
    }

    const action = body.action || 'list';

    // ── ACTION: Revoke License ──
    if (action === 'revoke') {
      const { license_id, reason } = body;
      if (!license_id) {
        return new Response(JSON.stringify({ ok: false, message: 'license_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data, error } = await supabase.rpc('sfx_revoke_license_v2', {
        p_license_id: license_id,
        p_reason: reason || 'Revoked by admin'
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: Reactivate License ──
    if (action === 'reactivate') {
      const { license_id } = body;
      if (!license_id) {
        return new Response(JSON.stringify({ ok: false, message: 'license_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data, error } = await supabase.rpc('sfx_reactivate_license_v2', {
        p_license_id: license_id
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: Reset Device Activations ──
    if (action === 'reset_device') {
      const { license_id } = body;
      if (!license_id) {
        return new Response(JSON.stringify({ ok: false, message: 'license_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data, error } = await supabase.rpc('sfx_reset_device_v2', {
        p_license_id: license_id
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: Extend Expiry ──
    if (action === 'extend_expiry') {
      const { license_id, expires_at } = body;
      if (!license_id) {
        return new Response(JSON.stringify({ ok: false, message: 'license_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const { data, error } = await supabase.rpc('sfx_extend_license_expiry_v2', {
        p_license_id: license_id,
        p_new_expires_at: expires_at || null
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: Reveal Single Key ──
    if (action === 'reveal_key') {
      const { license_id } = body;
      const { data: licRow, error } = await supabase
        .from('licenses')
        .select('id, encrypted_license_key, license_key_hash')
        .eq('id', license_id)
        .single();

      if (error || !licRow) {
        return new Response(JSON.stringify({ ok: false, message: 'License not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let plaintextKey = null;
      if (licRow.encrypted_license_key) {
        plaintextKey = await decryptLicenseKey(licRow.encrypted_license_key);
      }

      return new Response(JSON.stringify({
        ok: true,
        license_id: licRow.id,
        license_key: plaintextKey,
        has_encrypted_key: !!licRow.encrypted_license_key
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: Resend License Email via Brevo (Without Duplicate License Generation) ──
    if (action === 'resend_email') {
      const { order_id, license_id } = body;
      let targetOrder: any = null;
      let targetLic: any = null;
      let targetEmail: string = '';
      let plaintextKey: string | null = null;

      // 1. Find Order if order_id or license_id provided
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (order_id) {
        if (isUuid.test(order_id)) {
          const { data: ord } = await supabase
            .from('payment_orders')
            .select('*')
            .or(`id.eq.${order_id},provider_order_id.eq.${order_id}`)
            .maybeSingle();
          targetOrder = ord;
        } else {
          const { data: ord } = await supabase
            .from('payment_orders')
            .select('*')
            .eq('provider_order_id', order_id)
            .maybeSingle();
          targetOrder = ord;
        }
      } else if (license_id) {
        const { data: ord } = await supabase
          .from('payment_orders')
          .select('*')
          .eq('license_id', license_id)
          .maybeSingle();
        targetOrder = ord;
      }

      // 2. Find License
      const licId = targetOrder?.license_id || license_id;
      if (licId) {
        const { data: lic } = await supabase
          .from('licenses')
          .select('*, customers(email)')
          .eq('id', licId)
          .single();
        targetLic = lic;
      }

      if (targetOrder?.customer_email) {
        targetEmail = targetOrder.customer_email.trim().toLowerCase();
      } else if (targetLic?.customers?.email) {
        targetEmail = targetLic.customers.email.trim().toLowerCase();
      }

      if (targetLic?.encrypted_license_key) {
        plaintextKey = await decryptLicenseKey(targetLic.encrypted_license_key);
      }

      if (!targetEmail || !plaintextKey) {
        return new Response(JSON.stringify({
          ok: false,
          message: 'Unable to recover customer email or decrypted license key for this record'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 3. Dispatch Email via Brevo
      const emailRes = await sendLicenseEmailBrevo({
        toEmail: targetEmail,
        toName: targetOrder?.customer_name || '',
        licenseKey: plaintextKey,
        licenseType: targetLic?.license_type || 'lifetime',
        orderId: targetOrder?.provider_order_id || '',
        paymentId: targetOrder?.provider_payment_id || '',
        amount: targetOrder?.amount || 199,
        currency: targetOrder?.currency || 'INR',
        isResend: true
      });

      // 4. Update tracking status on payment_orders if order exists
      if (targetOrder?.provider_order_id) {
        await supabase.rpc('sfx_update_order_email_delivery', {
          p_provider_order_id: targetOrder.provider_order_id,
          p_status: emailRes.success ? 'sent' : 'failed',
          p_message_id: emailRes.messageId || null,
          p_error: emailRes.error || null
        });
      }

      return new Response(JSON.stringify({
        ok: emailRes.success,
        status: emailRes.success ? 'sent' : 'failed',
        message_id: emailRes.messageId || null,
        error: emailRes.error || null,
        message: emailRes.success
          ? `License email successfully re-sent via Brevo (Message ID: ${emailRes.messageId})`
          : `Brevo dispatch failed: ${emailRes.error}`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── DEFAULT: List Licenses, Orders & Stats ──
    const query = (body.query || '').trim();

    // 1. Fetch stats
    let stats = {
      total_licenses: 0,
      active_licenses: 0,
      unused_licenses: 0,
      revoked_licenses: 0,
      total_sales: 0,
      total_revenue: 0
    };
    const statsRes = await supabase.rpc('sfx_admin_get_stats_v2');
    if (!statsRes.error && statsRes.data) {
      stats = statsRes.data;
    }

    // 2. Fetch search results
    let licenses: any[] = [];
    const listRes = await supabase.rpc('sfx_admin_search_v2', { p_query: query });
    if (!listRes.error && Array.isArray(listRes.data)) {
      licenses = listRes.data;
      // Decrypt recoverable keys server-side for authorized admins
      for (const lic of licenses) {
        if (lic.encrypted_license_key) {
          lic.recovered_key = await decryptLicenseKey(lic.encrypted_license_key);
        } else {
          lic.recovered_key = null;
        }
        delete lic.encrypted_license_key;
      }
    }

    // 3. Fetch recent orders with email delivery tracking
    let orders: any[] = [];
    const ordRes = await supabase.rpc('sfx_admin_get_orders_v2', { p_limit: 50 });
    if (!ordRes.error && Array.isArray(ordRes.data)) {
      orders = ordRes.data;
    }

    return new Response(JSON.stringify({
      ok: true,
      stats: stats,
      licenses: licenses,
      orders: orders,
      admin_user: auth.user?.email || 'admin'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      message: err.message || 'Error executing admin license operation'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
