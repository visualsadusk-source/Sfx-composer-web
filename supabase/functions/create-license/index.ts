import { getSupabaseSecretKey } from '../_shared/supabase-admin.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
import { generateLicenseKey, sha256, encryptLicenseKey } from '../_shared/crypto.ts';
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

  // 1. Server-side Admin Authorization Verification
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'UNAUTHORIZED',
      message: auth.error || 'Admin authorization required.'
    }), {
      status: auth.statusCode || 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 2. Read server-side environment secrets
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = getSupabaseSecretKey();

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'CONFIG_ERROR',
      message: 'Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment secrets.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const {
      email,
      name = '',
      expires_at = null,
      max_devices = 1,
      send_email = true,
      license_type = 'lifetime'
    } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'INVALID_INPUT',
        message: 'A valid customer email address is required.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const rawKey = generateLicenseKey();
    const keyHash = await sha256(rawKey);
    const encryptedKey = await encryptLicenseKey(rawKey);

    // Initialize Supabase admin client with server-side service key
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false }
    });

    // Execute atomic stored procedure sfx_create_license_v2 with encrypted key
    const { data, error } = await supabase.rpc('sfx_create_license_v2', {
      p_email: cleanEmail,
      p_license_key_hash: keyHash,
      p_expires_at: expires_at,
      p_max_devices: max_devices || 1,
      p_encrypted_license_key: encryptedKey,
      p_license_type: license_type || 'lifetime'
    });

    if (error) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'DATABASE_ERROR',
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Return the plaintext key
    return new Response(JSON.stringify({
      ok: true,
      license_key: rawKey,
      email: cleanEmail,
      expires_at: expires_at,
      license_type: license_type || 'lifetime',
      max_devices: max_devices || 1,
      license_id: data.license_id,
      customer_id: data.customer_id,
      email_delivery: emailStatus,
      issued_by: auth.user?.email || 'admin',
      message: 'License created successfully.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'SERVER_ERROR',
      message: err.message || 'Internal server error while creating license.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
