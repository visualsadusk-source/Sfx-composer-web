import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { generateLicenseKey, sha256, encryptLicenseKey } from '../_shared/crypto.ts';
import { sendLicenseEmailBrevo } from '../_shared/brevo.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  try {
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
  } catch (err) {
    console.error('Webhook signature error:', err);
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
    const webhookSecret = (Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '').trim();

    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET is not configured in Supabase secrets');
      return new Response(JSON.stringify({ ok: false, message: 'Webhook secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error('Invalid Razorpay webhook signature');
      return new Response(JSON.stringify({ ok: false, message: 'Invalid webhook signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    console.log('Verified Razorpay webhook event:', event);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity || {};
      const orderId = paymentEntity.order_id || payload.payload?.order?.entity?.id;
      const paymentId = paymentEntity.id;
      const email = paymentEntity.email || paymentEntity.notes?.customer_email;
      const customerName = paymentEntity.notes?.customer_name || '';

      // Verify payment amount = 19900 paise and currency = INR
      const paymentAmount = paymentEntity.amount;
      const paymentCurrency = paymentEntity.currency;
      if (paymentAmount !== undefined && (paymentAmount !== 19900 || paymentCurrency !== 'INR')) {
        console.warn(`Webhook amount/currency mismatch: ${paymentAmount} ${paymentCurrency}`);
        return new Response(JSON.stringify({ status: 'ignored', reason: 'Amount/currency mismatch' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (orderId && email) {
        const cleanEmail = email.trim().toLowerCase();
        const rawKey = generateLicenseKey();
        const keyHash = await sha256(rawKey);
        const encryptedKey = await encryptLicenseKey(rawKey);

        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: compData, error: compError } = await supabase.rpc('sfx_complete_payment_order', {
          p_provider_order_id: orderId,
          p_provider_payment_id: paymentId,
          p_signature: signature,
          p_license_key_hash: keyHash,
          p_expires_at: null,
          p_max_devices: 1,
          p_encrypted_license_key: encryptedKey
        });

        if (compError) {
          console.error('Error in webhook complete order:', compError);
        } else if (!compData.already_processed) {
          // Send automatic license email via Brevo
          const emailRes = await sendLicenseEmailBrevo({
            toEmail: cleanEmail,
            toName: customerName,
            licenseKey: rawKey,
            licenseType: 'lifetime',
            orderId: orderId,
            paymentId: paymentId,
            amount: 199,
            currency: 'INR',
            isResend: false
          });

          // Update order status with Brevo message ID
          await supabase.rpc('sfx_update_order_email_delivery', {
            p_provider_order_id: orderId,
            p_status: emailRes.success ? 'sent' : 'failed',
            p_message_id: emailRes.messageId || null,
            p_error: emailRes.error || null
          });
        }
      }
    }

    return new Response(JSON.stringify({ status: 'ok', processed: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Unhandled webhook error:', err);
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
