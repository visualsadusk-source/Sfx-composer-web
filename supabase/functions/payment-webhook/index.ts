import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function generateLicenseKey(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  
  const chunks: string[] = ['SFX'];
  for (let c = 0; c < 4; c++) {
    let chunk = '';
    for (let i = 0; i < 4; i++) {
      const idx = randomBytes[c * 4 + i] % chars.length;
      chunk += chars[idx];
    }
    chunks.push(chunk);
  }
  return chunks.join('-');
}

async function sha256(text: string): Promise<string> {
  const buffer = new TextEncoder().encode(text.trim().toUpperCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const hexSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hexSignature.toLowerCase() === signature.trim().toLowerCase();
}

async function sendLicenseEmail(email: string, licenseKey: string, resendApiKey: string): Promise<any> {
  try {
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <body style="background:#080a09; color:#e8e8ec; font-family:sans-serif; padding:40px;">
        <div style="max-width:540px; margin:0 auto; background:#121214; border:1px solid #232326; border-radius:10px; padding:30px;">
          <h2 style="color:#0a84ff; margin-top:0;">SFX COMPOSER PRO</h2>
          <h3>Payment Captured &amp; Verified</h3>
          <p>Thank you for purchasing SFX Composer Pro (₹199 Lifetime License).</p>
          <div style="background:#000; border:1px solid #0a84ff; padding:15px; border-radius:8px; text-align:center; margin:20px 0;">
            <div style="font-size:12px; color:#0a84ff; margin-bottom:5px;">LIFETIME LICENSE KEY</div>
            <div style="font-size:20px; font-weight:bold; color:#fff; letter-spacing:2px;">${licenseKey}</div>
          </div>
          <p>To activate, open Premiere Pro or After Effects &gt; Window &gt; Extensions &gt; SFX Composer, enter your email and license key.</p>
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
        subject: 'Your SFX Composer Pro License Key (Captured Payment)',
        html: htmlBody
      })
    });
    return res.ok;
  } catch (e) {
    return false;
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
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '';

    if (webhookSecret) {
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ ok: false, message: 'Invalid webhook signature' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else {
      console.warn('RAZORPAY_WEBHOOK_SECRET not set in Supabase secrets.');
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    console.log('Received Razorpay webhook event:', event);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity || {};
      const orderId = paymentEntity.order_id || payload.payload?.order?.entity?.id;
      const paymentId = paymentEntity.id;
      const email = paymentEntity.email || paymentEntity.notes?.customer_email;

      if (orderId && email) {
        const cleanEmail = email.trim().toLowerCase();
        const rawKey = generateLicenseKey();
        const keyHash = await sha256(rawKey);

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: compData, error: compError } = await supabase.rpc('sfx_complete_payment_order', {
          p_provider_order_id: orderId,
          p_provider_payment_id: paymentId,
          p_signature: signature || 'webhook_verified',
          p_license_key_hash: keyHash,
          p_expires_at: null,
          p_max_devices: 1
        });

        if (compError) {
          console.error('Error in webhook complete order:', compError);
        } else if (!compData.already_processed) {
          const resendApiKey = Deno.env.get('RESEND_API_KEY');
          if (resendApiKey) {
            await sendLicenseEmail(cleanEmail, rawKey, resendApiKey);
          }
        }
      }
    }

    return new Response(JSON.stringify({ status: 'ok', processed: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
