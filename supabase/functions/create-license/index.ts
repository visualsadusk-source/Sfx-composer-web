import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/auth.ts';
import { generateLicenseKey, sha256, encryptLicenseKey } from '../_shared/crypto.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function sendLicenseEmail(
  email: string,
  licenseKey: string,
  resendApiKey: string
): Promise<{ sent: boolean; id?: string; error?: string }> {
  try {
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Your SFX Composer License</title>
        <style>
          body { background: #0c0c0e; color: #e8e8ec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; margin: 0; }
          .container { max-width: 520px; margin: 0 auto; background: #141418; border: 1px solid #27272f; border-radius: 12px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }
          .logo { color: #0a84ff; font-size: 20px; font-weight: 700; margin-bottom: 24px; letter-spacing: -0.02em; }
          h1 { font-size: 22px; font-weight: 600; color: #ffffff; margin: 0 0 12px; }
          p { font-size: 14px; line-height: 1.6; color: #a0a0ab; margin: 0 0 20px; }
          .key-box { background: #08080a; border: 1px solid #0a84ff; border-radius: 8px; padding: 18px; text-align: center; margin: 28px 0; }
          .key-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #0a84ff; font-weight: 600; margin-bottom: 8px; }
          .key-value { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 0.1em; user-select: all; }
          .footer { margin-top: 36px; padding-top: 20px; border-top: 1px solid #22222a; font-size: 12px; color: #62626e; text-align: center; }
          .footer a { color: #0a84ff; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">SFX COMPOSER</div>
          <h1>Your SFX Composer License Key</h1>
          <p>Thank you for using SFX Composer! Here is your official license key for <strong>SFX Composer Pro</strong>.</p>
          <p>This license can be activated on <strong>1 Adobe Premiere Pro / After Effects workstation</strong>.</p>
          
          <div class="key-box">
            <div class="key-title">Your License Key</div>
            <div class="key-value">${licenseKey}</div>
          </div>

          <p><strong>Activation Instructions:</strong></p>
          <ol style="font-size: 13px; color: #c0c0cb; line-height: 1.7; padding-left: 20px;">
            <li>Launch Premiere Pro and open the SFX Composer panel.</li>
            <li>On the activation screen, enter your registered email: <code>${email}</code>.</li>
            <li>Enter your license key above and click <strong>Activate License</strong>.</li>
          </ol>

          <div class="footer">
            Need support? Email us at <a href="mailto:support@sfxcomposer.com">support@sfxcomposer.com</a>.
          </div>
        </div>
      </body>
      </html>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SFX Composer <licenses@sfxcomposer.com>',
        to: [email],
        subject: 'Your SFX Composer License Key',
        html: htmlBody
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { sent: false, error: err };
    }
    const data = await res.json();
    return { sent: true, id: data.id };
  } catch (e: any) {
    return { sent: false, error: e.message };
  }
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
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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

    // Optional email dispatch via Resend
    let emailStatus = { sent: false, info: 'Email dispatch disabled or RESEND_API_KEY secret not configured.' };
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (send_email && resendApiKey) {
      const delivery = await sendLicenseEmail(cleanEmail, rawKey, resendApiKey);
      if (delivery.sent) {
        emailStatus = { sent: true, info: `Email successfully delivered via Resend (ID: ${delivery.id})` };
      } else {
        emailStatus = { sent: false, info: `Email delivery failed: ${delivery.error}` };
      }
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
