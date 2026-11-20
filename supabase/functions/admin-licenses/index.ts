import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
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

    let query = '';
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        query = (body.query || '').trim();
      } catch (e) {}
    } else {
      const url = new URL(req.url);
      query = (url.searchParams.get('query') || '').trim();
    }

    // 2. Fetch stats
    let stats = {
      total_licenses: 0,
      active_licenses: 0,
      unused_licenses: 0,
      revoked_licenses: 0
    };

    const statsRes = await supabase.rpc('sfx_admin_get_stats_v2');
    if (!statsRes.error && statsRes.data) {
      stats = statsRes.data;
    }

    // 3. Fetch search results / licenses list
    let licenses: any[] = [];
    const listRes = await supabase.rpc('sfx_admin_search_v2', { p_query: query });
    if (!listRes.error && Array.isArray(listRes.data)) {
      licenses = listRes.data;
    }

    return new Response(JSON.stringify({
      ok: true,
      stats: stats,
      licenses: licenses,
      admin_user: auth.user?.email || 'admin'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      message: err.message || 'Error loading admin data'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
