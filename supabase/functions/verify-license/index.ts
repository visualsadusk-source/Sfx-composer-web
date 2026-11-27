import { getSupabaseSecretKey } from '../_shared/supabase-admin.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function sha256Token(token: string): Promise<string> {
  const buffer = new TextEncoder().encode(token.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { activation_token, device_id } = body;

    if (!activation_token || !device_id) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'INVALID_INPUT',
        message: 'Missing activation_token or device_id.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tokenHash = await sha256Token(String(activation_token));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = getSupabaseSecretKey();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase.rpc('sfx_verify_token_v2', {
      p_token_hash: tokenHash,
      p_device_id: String(device_id).trim()
    });

    if (error) {
      return new Response(JSON.stringify({ ok: false, code: 'DATABASE_ERROR', message: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
      status: data.ok ? 200 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, code: 'SERVER_ERROR', message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
