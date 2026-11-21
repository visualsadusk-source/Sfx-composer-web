import { corsHeaders, handleCors } from '../_shared/cors.ts';
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

  try {
    const body = await req.json().catch(() => ({}));
    const { email, amount = 19900, currency = 'INR' } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(JSON.stringify({ ok: false, message: 'Valid customer email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const rzpKeyId = (Deno.env.get('RAZORPAY_KEY_ID') || '').trim();
    const rzpKeySecret = (Deno.env.get('RAZORPAY_KEY_SECRET') || '').trim();

    if (!rzpKeyId || !rzpKeySecret) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'MISSING_RAZORPAY_CONFIG',
        message: 'Razorpay credentials (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET) are not configured in Supabase secrets.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create authentic order via official Razorpay Orders API
    const authHeader = 'Basic ' + btoa(`${rzpKeyId}:${rzpKeySecret}`);
    const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: 19900, // strictly ₹199 (19900 paise)
        currency: 'INR',
        receipt: `rcpt_${Date.now().toString(36)}`,
        notes: {
          customer_email: cleanEmail,
          product: 'SFX Composer Ultimate Bundle (Plugin + 7GB SFX Library)',
          price_inr: '199'
        }
      })
    });

    if (!rzpResponse.ok) {
      const errText = await rzpResponse.text();
      console.error('Razorpay Orders API error:', errText);
      return new Response(JSON.stringify({
        ok: false,
        message: 'Failed to create order on Razorpay API',
        details: errText
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const rzpData = await rzpResponse.json();
    const razorpayOrderId = rzpData.id;

    // Record pending order in Supabase
    try {
      const { data: recordData, error: recordError } = await supabase.rpc('sfx_record_payment_order', {
        p_customer_email: cleanEmail,
        p_payment_provider: 'razorpay',
        p_provider_order_id: razorpayOrderId,
        p_amount: 199.00,
        p_currency: 'INR'
      });

      if (recordError) {
        console.warn('Database note recording order (proceeding with checkout):', recordError.message);
      }
    } catch (dbErr) {
      console.warn('Database execution note (proceeding):', dbErr);
    }

    return new Response(JSON.stringify({
      ok: true,
      order_id: razorpayOrderId,
      amount: rzpData.amount || 19900,
      currency: rzpData.currency || 'INR',
      key_id: rzpKeyId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Unhandled error in create-razorpay-order:', err);
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
