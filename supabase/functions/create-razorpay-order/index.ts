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
    const rzpKeyId = Deno.env.get('RAZORPAY_KEY_ID') || '';
    const rzpKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET') || '';

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let razorpayOrderId = '';
    let isTestMock = false;

    if (rzpKeyId && rzpKeySecret) {
      // Create order via Razorpay API
      const authHeader = 'Basic ' + btoa(`${rzpKeyId}:${rzpKeySecret}`);
      const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amount,
          currency: currency,
          receipt: `rcpt_${Date.now().toString(36)}`,
          notes: {
            customer_email: cleanEmail,
            product: 'SFX Composer Pro + SFX Pack',
            price_inr: '199'
          }
        })
      });

      if (!rzpResponse.ok) {
        const errText = await rzpResponse.text();
        console.error('Razorpay API error:', errText);
        return new Response(JSON.stringify({ ok: false, message: 'Failed to create Razorpay order', details: errText }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const rzpData = await rzpResponse.json();
      razorpayOrderId = rzpData.id;
    } else {
      // Test mode fallback when Razorpay keys are not yet configured in Supabase secrets
      isTestMock = true;
      const randSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
      razorpayOrderId = `order_test_${Date.now()}_${randSuffix}`;
      console.warn('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set. Created test-mode order ID:', razorpayOrderId);
    }

    // Record pending order in Supabase
    const { data: recordData, error: recordError } = await supabase.rpc('sfx_record_payment_order', {
      p_customer_email: cleanEmail,
      p_payment_provider: isTestMock ? 'razorpay_test' : 'razorpay',
      p_provider_order_id: razorpayOrderId,
      p_amount: amount / 100, // stored as 199.00
      p_currency: currency
    });

    if (recordError) {
      console.error('Database error recording order:', recordError);
      return new Response(JSON.stringify({ ok: false, message: recordError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      order_id: razorpayOrderId,
      amount: amount,
      currency: currency,
      key_id: rzpKeyId || 'rzp_test_placeholder',
      test_mode: isTestMock,
      warning: isTestMock ? 'RAZORPAY_KEY_ID not configured in Supabase secrets. Running in test verification mode.' : undefined
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('Unhandled error:', err);
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
