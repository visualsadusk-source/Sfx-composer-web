import { getSupabaseSecretKey } from '../_shared/supabase-admin.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || record.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (record.count >= 15) return false;
  record.count += 1;
  return true;
}

// Token SHA-256 (preserves standard case for hex tokens)
async function sha256Token(token: string): Promise<string> {
  const buffer = new TextEncoder().encode(token.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// License Key SHA-256 (uppercase normalized)
async function sha256Key(key: string): Promise<string> {
  const buffer = new TextEncoder().encode(key.trim().toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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

  const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many activation attempts. Please wait 60 seconds.'
    }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { email, license_key, device_id, device_name } = body;

    if (!email || !license_key || !device_id) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'INVALID_INPUT',
        message: 'Missing required credentials: email, license_key, and device_id are required.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanKey = String(license_key).trim().toUpperCase();

    if (!cleanEmail.includes('@')) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'INVALID_EMAIL',
        message: 'Please enter a valid registered email address.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = getSupabaseSecretKey();

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'CONFIG_ERROR',
        message: 'Server configuration error: missing database credentials.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // ── Direct Server-Side License Verification & Activation ──
    const keyHash = await sha256Key(cleanKey);
    const rawActivationToken = generateSecureToken();
    const tokenHash = await sha256Token(rawActivationToken);

    // Call PostgreSQL stored procedure sfx_activate_license_v2
    const { data, error } = await supabase.rpc('sfx_activate_license_v2', {
      p_email: cleanEmail,
      p_license_key_hash: keyHash,
      p_device_id: String(device_id).trim(),
      p_device_name: String(device_name || 'Workstation').trim(),
      p_token_hash: tokenHash
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

    if (!data.ok) {
      return new Response(JSON.stringify({
        ok: false,
        code: data.code || 'ACTIVATION_REJECTED',
        message: data.message || 'License verification failed.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      status: 'active',
      activation_token: rawActivationToken,
      email: data.email,
      max_devices: data.max_devices,
      message: 'Activation Successful! Welcome to SFX Composer.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      code: 'SERVER_ERROR',
      message: err.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
