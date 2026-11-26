import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { sendLicenseEmailBrevo } from '../_shared/brevo.ts';

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
    const { email, license_key, name, order_id, payment_id } = body;

    if (!email || !license_key) {
      return new Response(JSON.stringify({ ok: false, message: 'Email and license_key are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const result = await sendLicenseEmailBrevo({
      toEmail: cleanEmail,
      toName: name || '',
      licenseKey: license_key,
      orderId: order_id,
      paymentId: payment_id,
      isResend: true
    });

    if (!result.success) {
      return new Response(JSON.stringify({
        ok: false,
        sent: false,
        error: result.error
      }), {
        status: result.statusCode || 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      sent: true,
      message_id: result.messageId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
