import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { generateLicenseKey, sha256, encryptLicenseKey } from '../_shared/crypto.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyHmacSha256(data: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const hexSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return hexSignature.toLowerCase() === signature.trim().toLowerCase();
  } catch (err) {
    console.error('HMAC verification error:', err);
    return false;
  }
}

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
        <title>Your SFX Composer Pro License</title>
        <style>
          body { background: #080a09; color: #e8e8ec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px 20px; margin: 0; }
          .container { max-width: 560px; margin: 0 auto; background: #121214; border: 1px solid #232326; border-radius: 12px; padding: 36px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
          .logo { color: #0a84ff; font-size: 20px; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 24px; }
          .headline { font-size: 24px; font-weight: 700; color: #ffffff; margin: 0 0 12px; letter-spacing: -0.02em; }
          .subtext { font-size: 14px; line-height: 1.6; color: #a0a0ab; margin: 0 0 24px; }
          .key-card { background: #000000; border: 1px solid #0a84ff; border-radius: 8px; padding: 20px; text-align: center; margin: 28px 0; }
          .key-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #0a84ff; font-weight: 700; margin-bottom: 8px; }
          .key-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.12em; user-select: all; }
          .badge { display: inline-block; background: rgba(10,132,255,0.15); border: 1px solid rgba(10,132,255,0.3); color: #70b4ff; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-left: 8px; }
          .btn { display: inline-block; background: #0a84ff; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin: 16px 0; }
          .steps-box { background: #1a1a1d; border: 1px solid #2a2a2e; border-radius: 8px; padding: 16px 20px; margin: 24px 0; }
          .steps-title { font-size: 13px; font-weight: 600; color: #ffffff; margin-bottom: 10px; }
          .steps-list { margin: 0; padding-left: 20px; font-size: 13px; color: #b0b0bb; line-height: 1.7; }
          .footer { margin-top: 36px; padding-top: 20px; border-top: 1px solid #222226; font-size: 12px; color: #62626e; text-align: center; }
          .footer a { color: #0a84ff; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">SFX COMPOSER</div>
          <div class="headline">Thank you for your purchase!</div>
          <p class="subtext">
            Your purchase of <strong>SFX Composer Pro + SFX Starter Pack (₹199 Lifetime License)</strong> has been successfully processed and verified.
          </p>
          
          <div class="key-card">
            <div class="key-label">Your Official Lifetime License Key</div>
            <div class="key-code">${licenseKey}</div>
          </div>

          <div class="steps-box">
            <div class="steps-title">Installation &amp; Activation Steps:</div>
            <ol class="steps-list">
              <li>Download the plugin package from your account portal or link below.</li>
              <li>Install via ZXP / Anastasiy's Extension Manager (or copy to your CEP extensions directory).</li>
              <li>Launch Adobe Premiere Pro or After Effects.</li>
              <li>Open <strong>Window &gt; Extensions &gt; SFX Composer</strong>.</li>
              <li>Enter your registered email: <code>${email}</code> and license key above.</li>
              <li>Click <strong>Activate License</strong> to unlock full lifetime access.</li>
            </ol>
          </div>

          <div class="footer">
            Need assistance? Reach our engineering team directly at <a href="mailto:support@sfxcomposer.com">support@sfxcomposer.com</a>.<br/>
            &copy; 2026 SFX Composer. All rights reserved.
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
        subject: 'Your SFX Composer Pro License Key (₹199 Lifetime)',
        html: htmlBody
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return { sent: false, error: errText };
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

  try {
    const body = await req.json().catch(() => ({}));
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      email
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !email) {
      return new Response(JSON.stringify({
        ok: false,
        message: 'Missing required parameters (razorpay_order_id, razorpay_payment_id, email).'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const rzpSecret = Deno.env.get('RAZORPAY_KEY_SECRET') || '';

    if (!rzpSecret) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'MISSING_SECRET',
        message: 'RAZORPAY_KEY_SECRET is not configured in Supabase secrets.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Cryptographic signature verification using HMAC-SHA256
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const isValid = await verifyHmacSha256(payload, razorpay_signature || '', rzpSecret);
    if (!isValid) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'INVALID_SIGNATURE',
        message: 'Razorpay payment signature verification failed. Untrusted payment.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique license key & cryptographic SHA-256 hash & AES-256-GCM ciphertext
    const rawLicenseKey = generateLicenseKey();
    const keyHash = await sha256(rawLicenseKey);
    const encryptedKey = await encryptLicenseKey(rawLicenseKey);

    // Complete order idempotently in Supabase
    const { data: orderData, error: orderError } = await supabase.rpc('sfx_complete_payment_order', {
      p_provider_order_id: razorpay_order_id,
      p_provider_payment_id: razorpay_payment_id,
      p_signature: razorpay_signature,
      p_license_key_hash: keyHash,
      p_expires_at: null, // Lifetime license
      p_max_devices: 1,
      p_encrypted_license_key: encryptedKey
    });

    if (orderError) {
      console.error('Database completion error:', orderError);
      return new Response(JSON.stringify({ ok: false, message: orderError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Deliver email via Resend if configured
    let emailStatus = { sent: false, info: 'Resend API key not configured in Supabase secrets' };
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const emailRes = await sendLicenseEmail(cleanEmail, rawLicenseKey, resendApiKey);
      emailStatus = {
        sent: emailRes.sent,
        info: emailRes.sent ? `Delivered successfully (ID: ${emailRes.id})` : `Failed: ${emailRes.error}`
      };
    }

    return new Response(JSON.stringify({
      ok: true,
      verified: true,
      license_key: rawLicenseKey,
      email: cleanEmail,
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      license_id: orderData.license_id,
      email_delivery: emailStatus,
      downloads: {
        version: 'v2.4.0',
        zxp_url: '/downloads/sfx-composer-pro-v2.4.0.zxp',
        zip_url: '/downloads/sfx-composer-pro-v2.4.0.zip'
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Unhandled error in verify-payment:', err);
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
