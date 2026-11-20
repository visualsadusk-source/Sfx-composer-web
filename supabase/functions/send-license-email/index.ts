import { corsHeaders, handleCors } from '../_shared/cors.ts';

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
    const { email, license_key } = body;

    if (!email || !license_key) {
      return new Response(JSON.stringify({ ok: false, message: 'Email and license_key are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || body.resend_key || '';

    if (!resendApiKey) {
      return new Response(JSON.stringify({
        ok: false,
        sent: false,
        message: 'RESEND_API_KEY is not configured in Supabase secrets.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Your SFX Composer License</title>
        <style>
          body { background: #080a09; color: #e8e8ec; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; }
          .container { max-width: 540px; margin: 0 auto; background: #121214; border: 1px solid #232326; border-radius: 12px; padding: 32px; }
          .logo { color: #0a84ff; font-size: 20px; font-weight: 800; margin-bottom: 20px; }
          .key-box { background: #000; border: 1px solid #0a84ff; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
          .key-val { font-family: monospace; font-size: 22px; font-weight: 700; color: #fff; letter-spacing: 2px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">SFX COMPOSER PRO</div>
          <h2>Your Lifetime License Key</h2>
          <p>Here is your license key for SFX Composer Pro:</p>
          <div class="key-box">
            <div style="font-size: 11px; color: #0a84ff; text-transform: uppercase; margin-bottom: 6px;">License Key</div>
            <div class="key-val">${license_key}</div>
          </div>
          <p>To activate inside Premiere Pro or After Effects, go to <strong>Window &gt; Extensions &gt; SFX Composer</strong> and enter your email and key.</p>
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
        to: [cleanEmail],
        subject: 'Your SFX Composer Pro License Key',
        html: htmlBody
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ ok: false, sent: false, error: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, sent: true, id: data.id }), {
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
