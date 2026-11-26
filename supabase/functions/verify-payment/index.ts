import { corsHeaders, handleCors } from '../_shared/cors.ts';
import {
  generateLicenseKey,
  sha256,
  encryptLicenseKey,
  constantTimeEqual,
  createSignedDownloadToken
} from '../_shared/crypto.ts';
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
      .join('')
      .toLowerCase();
    return constantTimeEqual(hexSignature, signature.trim().toLowerCase());
  } catch (err) {
    console.error('HMAC verification error:', err);
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
    const body = await req.json().catch(() => ({}));
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      email,
      name
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
    const rzpSecret = (Deno.env.get('RAZORPAY_KEY_SECRET') || '').trim();

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

    // 1. Cryptographic HMAC-SHA256 signature verification
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

    // 2. Amount and Currency Verification against database payment_orders
    const { data: existingOrder } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('provider_order_id', razorpay_order_id)
      .maybeSingle();

    if (existingOrder) {
      // Must equal 199 (INR) or 19900 paise
      const expectedAmount = 199;
      if (Number(existingOrder.amount) !== expectedAmount || existingOrder.currency !== 'INR') {
        return new Response(JSON.stringify({
          ok: false,
          code: 'INVALID_AMOUNT_OR_CURRENCY',
          message: `Order amount/currency mismatch: expected ₹199 INR, got ${existingOrder.currency} ${existingOrder.amount}`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 3. Optional Razorpay API payment capture check if credentials present
    const rzpKeyId = (Deno.env.get('RAZORPAY_KEY_ID') || '').trim();
    if (rzpKeyId && rzpSecret) {
      try {
        const basicAuth = btoa(`${rzpKeyId}:${rzpSecret}`);
        const rzpPayRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
          headers: { 'Authorization': `Basic ${basicAuth}` }
        });
        if (rzpPayRes.ok) {
          const rzpPayData = await rzpPayRes.json();
          if (rzpPayData.order_id && rzpPayData.order_id !== razorpay_order_id) {
            return new Response(JSON.stringify({
              ok: false,
              code: 'ORDER_MISMATCH',
              message: 'Razorpay payment does not belong to the specified order.'
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          if (rzpPayData.status !== 'captured' && rzpPayData.status !== 'authorized') {
            return new Response(JSON.stringify({
              ok: false,
              code: 'PAYMENT_NOT_CAPTURED',
              message: `Payment status is '${rzpPayData.status}'. Only captured or authorized payments can be fulfilled.`
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
          if (rzpPayData.amount !== 19900 || rzpPayData.currency !== 'INR') {
            return new Response(JSON.stringify({
              ok: false,
              code: 'AMOUNT_MISMATCH',
              message: `Razorpay payment amount mismatch: expected 19900 paise INR, received ${rzpPayData.amount} ${rzpPayData.currency}`
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        }
      } catch (e) {
        console.warn('Razorpay API verification network note:', e);
      }
    }

    // 4. Generate unique license key & cryptographic SHA-256 hash & AES-256-GCM ciphertext
    const rawLicenseKey = generateLicenseKey();
    const keyHash = await sha256(rawLicenseKey);
    const encryptedKey = await encryptLicenseKey(rawLicenseKey);

    // 5. Complete order idempotently in Supabase
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

    // If customer name provided, store on payment_orders
    if (name) {
      await supabase
        .from('payment_orders')
        .update({ customer_name: name.trim() })
        .eq('provider_order_id', razorpay_order_id);
    }

    const sessionToken = await createSignedDownloadToken({
      email: cleanEmail,
      payment_id: razorpay_payment_id
    }, 30 * 24 * 3600 * 1000);
    const functionsBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;

    return new Response(JSON.stringify({
      ok: true,
      verified: true,
      license_key: rawLicenseKey,
      email: cleanEmail,
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      token: sessionToken,
      license_id: orderData.license_id,
      delivery: {
        mode: 'web_dashboard',
        status: 'ready',
        info: 'License generated and ready for instant activation in My License & Downloads.'
      },
      downloads: {
        version: 'v2.2.0',
        zxp_url: `${functionsBase}/download?type=zxp&token=${encodeURIComponent(sessionToken)}`,
        zip_url: `${functionsBase}/download?type=zip&token=${encodeURIComponent(sessionToken)}`,
        sfx_library_url: `${functionsBase}/download?type=sfx-library&token=${encodeURIComponent(sessionToken)}`
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
