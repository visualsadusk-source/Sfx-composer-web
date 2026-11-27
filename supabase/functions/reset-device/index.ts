import { getSupabaseSecretKey } from '../_shared/supabase-admin.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
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

  // Verify admin authorization
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return new Response(JSON.stringify({ ok: false, message: auth.error || 'Unauthorized' }), {
      status: auth.statusCode || 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { license_id, reason = 'Admin device reset' } = body;

    if (!license_id) {
      return new Response(JSON.stringify({ ok: false, message: 'license_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = getSupabaseSecretKey();
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false }
    });

    const { data, error } = await supabase.rpc('sfx_reset_device_v2', {
      p_license_id: license_id,
      p_reason: reason
    });

    if (error) {
      return new Response(JSON.stringify({ ok: false, message: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
