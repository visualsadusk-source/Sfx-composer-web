import { getSupabaseSecretKey } from '../_shared/supabase-admin.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
import { decryptLicenseKey, encryptLicenseKey, generateLicenseKey, sha256 } from '../_shared/crypto.ts';
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

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const adminEmail = auth.user?.email || 'admin';

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = getSupabaseSecretKey();
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

      await supabase.rpc('sfx_log_license_audit', {
        p_admin_email: adminEmail,
        p_action: 'revoke_license',
        p_license_id: license_id,
        p_ip_address: clientIp,
        p_user_agent: userAgent,
        p_metadata: { reason: reason || 'Revoked by admin' }
      });

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

      await supabase.rpc('sfx_log_license_audit', {
        p_admin_email: adminEmail,
        p_action: 'reactivate_license',
        p_license_id: license_id,
        p_ip_address: clientIp,
        p_user_agent: userAgent
      });

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

      await supabase.rpc('sfx_log_license_audit', {
        p_admin_email: adminEmail,
        p_action: 'reset_device',
        p_license_id: license_id,
        p_ip_address: clientIp,
        p_user_agent: userAgent
      });

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

      await supabase.rpc('sfx_log_license_audit', {
        p_admin_email: adminEmail,
        p_action: 'extend_expiry',
        p_license_id: license_id,
        p_ip_address: clientIp,
        p_user_agent: userAgent,
        p_metadata: { new_expires_at: expires_at }
      });

      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: Reveal Single Key (Audited) ──
    if (action === 'reveal_key') {
      const { license_id } = body;
      if (!license_id) {
        return new Response(JSON.stringify({ ok: false, message: 'license_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: licRow, error } = await supabase
        .from('licenses')
        .select('id, encrypted_license_key, license_key_hash, customers(email)')
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

      // Record audit log for key reveal
      const targetCustomerEmail = (licRow.customers as any)?.email || null;
      await supabase.rpc('sfx_log_license_audit', {
        p_admin_email: adminEmail,
        p_action: 'reveal_key',
        p_license_id: licRow.id,
        p_customer_email: targetCustomerEmail,
        p_ip_address: clientIp,
        p_user_agent: userAgent,
        p_metadata: { has_encrypted_key: !!licRow.encrypted_license_key }
      });

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

    // ── ACTION: Reissue License Key (Audited Recovery & Re-keying) ──
    if (action === 'reissue_key') {
      const { license_id, reason, send_email } = body;
      if (!license_id) {
        return new Response(JSON.stringify({ ok: false, message: 'license_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: licRow, error: licErr } = await supabase
        .from('licenses')
        .select('id, license_type, customer_id, customers(email)')
        .eq('id', license_id)
        .single();

      if (licErr || !licRow) {
        return new Response(JSON.stringify({ ok: false, message: 'License not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const custEmail = (licRow.customers as any)?.email;

      // Generate fresh high-entropy key
      const newKey = generateLicenseKey();
      const newHash = await sha256(newKey);
      const newEncryptedKey = await encryptLicenseKey(newKey);

      const { error: reissueErr } = await supabase.rpc('sfx_reissue_license_key', {
        p_license_id: license_id,
        p_new_license_key_hash: newHash,
        p_new_encrypted_license_key: newEncryptedKey,
        p_reason: reason || 'Admin reissued key'
      });

      if (reissueErr) throw reissueErr;

      // Record audit log
      await supabase.rpc('sfx_log_license_audit', {
        p_admin_email: adminEmail,
        p_action: 'reissue_key',
        p_license_id: license_id,
        p_customer_email: custEmail,
        p_ip_address: clientIp,
        p_user_agent: userAgent,
        p_metadata: { reason: reason || 'Admin reissued key' }
      });

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

    // ── ACTION: Fetch License Audit Logs ──
    if (action === 'get_audit_logs') {
      const { license_id, limit } = body;
      const { data: logs, error: logsErr } = await supabase.rpc('sfx_get_license_audit_logs', {
        p_license_id: license_id || null,
        p_limit: limit || 50
      });
      if (logsErr) throw logsErr;
      return new Response(JSON.stringify({ ok: true, logs }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── ACTION: Resend License Email (Disabled - 100% Web Portal Delivery) ──
    if (action === 'resend_email') {
      return new Response(JSON.stringify({
        ok: false,
        status: 'disabled',
        message: 'Email delivery has been decommissioned. Customer fulfillment and license access are handled entirely through the website My License & Downloads portal.'
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

    // 2. Fetch search results (licenses)
    let licenses: any[] = [];
    const listRes = await supabase.rpc('sfx_admin_search_v2', { p_query: query });
    if (!listRes.error && Array.isArray(listRes.data)) {
      licenses = listRes.data;
      for (const lic of licenses) {
        lic.has_encrypted_key = !!lic.encrypted_license_key;
        if (lic.encrypted_license_key) {
          lic.recovered_key = await decryptLicenseKey(lic.encrypted_license_key);
        } else {
          lic.recovered_key = null;
        }
        delete lic.encrypted_license_key;
      }
    }

    // 3. Fetch recent orders with associated license keys and email tracking
    let orders: any[] = [];
    const ordRes = await supabase.rpc('sfx_admin_get_orders_v2', { p_limit: 50 });
    if (!ordRes.error && Array.isArray(ordRes.data)) {
      orders = ordRes.data;
      for (const ord of orders) {
        ord.has_encrypted_key = !!ord.encrypted_license_key;
        if (ord.encrypted_license_key) {
          ord.recovered_key = await decryptLicenseKey(ord.encrypted_license_key);
        } else {
          ord.recovered_key = null;
        }
        delete ord.encrypted_license_key;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      stats: stats,
      licenses: licenses,
      orders: orders,
      admin_user: adminEmail
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
