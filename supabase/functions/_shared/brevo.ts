/**
 * Brevo Transactional Email Service for SFX Composer
 * Integrates directly with official Brevo API v3 (https://api.brevo.com/v3/smtp/email).
 * Replaces legacy Resend integration without exposing API keys to frontend or client responses.
 */

export interface SendLicenseEmailParams {
  toEmail: string;
  toName?: string;
  licenseKey: string;
  licenseType?: string;
  orderId?: string;
  paymentId?: string;
  amount?: number;
  currency?: string;
  isResend?: boolean;
}

export interface BrevoSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
}

function parseSender(senderConfig?: string): { name: string; email: string } {
  const raw = (senderConfig || Deno.env.get('EMAIL_FROM') || '').trim();
  if (!raw) {
    // Default to the confirmed administrator email
    return { name: 'SFX Composer', email: 'visualsadusk@gmail.com' };
  }

  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim() || 'SFX Composer',
      email: match[2].trim().toLowerCase()
    };
  }

  return {
    name: 'SFX Composer',
    email: raw.toLowerCase()
  };
}

export async function sendLicenseEmailBrevo(params: SendLicenseEmailParams): Promise<BrevoSendResult> {
  const apiKey = (Deno.env.get('BREVO_API_KEY') || '').trim();

  if (!apiKey) {
    console.warn('[BREVO] BREVO_API_KEY secret is not configured in Supabase secrets.');
    return {
      success: false,
      error: 'BREVO_API_KEY is missing from Supabase Edge Function Secrets.',
      statusCode: 500
    };
  }

  const cleanEmail = (params.toEmail || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      success: false,
      error: `Invalid destination email: ${params.toEmail}`,
      statusCode: 400
    };
  }

  const sender = parseSender();
  const recipientName = (params.toName || '').trim() || cleanEmail.split('@')[0];
  const baseUrl = (Deno.env.get('APP_BASE_URL') || 'https://wyjazmiihwjlrkggeeez.supabase.co').replace(/\/+$/, '');
  const zxpDownloadUrl = `${baseUrl}/downloads/sfx-composer-pro-v2.4.0.zxp`;
  const zipDownloadUrl = `${baseUrl}/downloads/sfx-composer-pro-v2.4.0.zip`;
  const licenseTypeLabel = (params.licenseType || 'lifetime').toUpperCase();
  const isResendNotice = params.isResend ? '<div style="background: rgba(255, 159, 10, 0.15); border: 1px solid #ff9f0a; color: #ff9f0a; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">Duplicate / Requested Copy</div>' : '';

  const subject = params.isResend 
    ? `Your SFX Composer License Key (Re-sent Copy)`
    : `Your SFX Composer License Key — Purchase Successful!`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #080A09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E8E8EC; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #080A09; padding: 40px 0; }
    .main { background-color: #121418; margin: 0 auto; width: 100%; max-width: 580px; border: 1px solid #23272F; border-radius: 12px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
    .header { padding: 32px 36px 20px 36px; border-bottom: 1px solid #1C2028; }
    .brand { font-size: 18px; font-weight: 900; letter-spacing: 0.12em; color: #0A84FF; text-decoration: none; }
    .brand-sub { font-size: 11px; color: #626A7A; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 3px; }
    .content { padding: 32px 36px; }
    h1 { font-size: 22px; font-weight: 800; color: #FFFFFF; margin: 0 0 12px 0; letter-spacing: -0.02em; }
    p { font-size: 14px; line-height: 1.65; color: #A0A8B8; margin: 0 0 18px 0; }
    .key-card { background: #000000; border: 1.5px solid #0A84FF; border-radius: 8px; padding: 22px 18px; text-align: center; margin: 26px 0; box-shadow: 0 0 24px rgba(10,132,255,0.15); }
    .key-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #0A84FF; margin-bottom: 8px; }
    .key-value { font-family: ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace; font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.12em; user-select: all; word-break: break-all; }
    .key-hint { font-size: 11px; color: #626A7A; margin-top: 8px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .info-table td { padding: 8px 12px; border-bottom: 1px solid #1C2028; }
    .info-table td.label { color: #626A7A; width: 38%; }
    .info-table td.val { color: #FFFFFF; font-weight: 600; text-align: right; }
    .steps { background: #0B0D10; border: 1px solid #1C2028; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .steps-title { font-size: 13px; font-weight: 700; color: #FFFFFF; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .steps ol { margin: 0; padding-left: 20px; font-size: 13px; color: #B0B8C8; line-height: 1.7; }
    .steps li { margin-bottom: 6px; }
    .btn-container { text-align: center; margin: 28px 0 12px 0; }
    .btn { display: inline-block; background: #0A84FF; color: #FFFFFF; font-size: 13.5px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin: 4px; }
    .btn-secondary { background: #1C2028; color: #E8E8EC; border: 1px solid #2A303C; }
    .footer { padding: 24px 36px 32px 36px; border-top: 1px solid #1C2028; font-size: 11.5px; color: #525866; line-height: 1.6; text-align: center; }
    .footer a { color: #0A84FF; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" align="center" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <div class="brand">SFX COMPOSER</div>
          <div class="brand-sub">Native Sound Effects Engine for Premiere Pro &amp; After Effects</div>
        </td>
      </tr>
      <tr>
        <td class="content">
          ${isResendNotice}
          <h1>Your SFX Composer License Key</h1>
          <p>Hello <strong>${recipientName}</strong>,</p>
          <p>
            Thank you for purchasing <strong>SFX Composer Pro</strong>. Your payment has been verified and your permanent ${licenseTypeLabel} license key has been generated and bound to your account.
          </p>

          <div class="key-card">
            <div class="key-label">Official ${licenseTypeLabel} License Key</div>
            <div class="key-value">${params.licenseKey}</div>
            <div class="key-hint">Copy and paste this key into the plugin activation window</div>
          </div>

          <table class="info-table">
            <tr>
              <td class="label">Registered Email:</td>
              <td class="val">${cleanEmail}</td>
            </tr>
            <tr>
              <td class="label">License Tier:</td>
              <td class="val">SFX Composer Pro (${licenseTypeLabel})</td>
            </tr>
            <tr>
              <td class="label">Workstation Activations:</td>
              <td class="val">1 Active Workstation Slot (Transferable)</td>
            </tr>
            ${params.orderId ? `<tr><td class="label">Order Reference:</td><td class="val" style="font-family:monospace; font-size:12px;">${params.orderId}</td></tr>` : ''}
            ${params.paymentId ? `<tr><td class="label">Payment ID:</td><td class="val" style="font-family:monospace; font-size:12px;">${params.paymentId}</td></tr>` : ''}
          </table>

          <div class="steps">
            <div class="steps-title">Installation &amp; Activation Guide</div>
            <ol>
              <li>Download the plugin package from the buttons below.</li>
              <li>Install the <code>.zxp</code> file using <strong>Anastasiy's Extension Manager</strong> or <strong>ZXP Installer</strong> (or extract the CEP <code>.zip</code> into your Adobe CEP extensions directory).</li>
              <li>Launch <strong>Adobe Premiere Pro</strong> or <strong>After Effects</strong> (CC 2021 – 2026 supported).</li>
              <li>Open <strong>Window &gt; Extensions &gt; SFX Composer</strong>.</li>
              <li>Enter your registered email (<code>${cleanEmail}</code>) and your license key above.</li>
              <li>Click <strong>Activate License</strong> to unlock full lifetime access with offline capability.</li>
            </ol>
          </div>

          <div class="btn-container">
            <a href="${zxpDownloadUrl}" class="btn">Download ZXP Installer</a>
            <a href="${zipDownloadUrl}" class="btn btn-secondary">Download ZIP Package</a>
          </div>
        </td>
      </tr>
      <tr>
        <td class="footer">
          Need support or assistance? Contact our engineering team at <a href="mailto:support@sfxcomposer.com">support@sfxcomposer.com</a> or <a href="mailto:visualsadusk@gmail.com">visualsadusk@gmail.com</a>.<br/>
          &copy; 2026 SFX Composer. All rights reserved.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;

  const textContent = `
SFX COMPOSER PRO — PURCHASE SUCCESSFUL

Hello ${recipientName},

Thank you for purchasing SFX Composer Pro (${licenseTypeLabel}).
Your official license key has been generated:

LICENSE KEY: ${params.licenseKey}
REGISTERED EMAIL: ${cleanEmail}
LICENSE TIER: SFX Composer Pro (${licenseTypeLabel})
${params.orderId ? `ORDER REFERENCE: ${params.orderId}\n` : ''}${params.paymentId ? `PAYMENT ID: ${params.paymentId}\n` : ''}
INSTALLATION & ACTIVATION:
1. Download ZXP: ${zxpDownloadUrl}
2. Download ZIP: ${zipDownloadUrl}
3. In Premiere Pro / After Effects CC 2021-2026, go to Window > Extensions > SFX Composer.
4. Enter your email (${cleanEmail}) and your license key: ${params.licenseKey}
5. Click Activate License.

Support: support@sfxcomposer.com / visualsadusk@gmail.com
(C) 2026 SFX Composer. All rights reserved.
  `.trim();

  try {
    const payload = {
      sender: {
        name: sender.name,
        email: sender.email
      },
      to: [
        {
          email: cleanEmail,
          name: recipientName
        }
      ],
      subject: subject,
      htmlContent: htmlContent,
      textContent: textContent
    };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text();
      let parsedMsg = errBody;
      try {
        const jsonErr = JSON.parse(errBody);
        parsedMsg = jsonErr.message || jsonErr.code || errBody;
      } catch (e) {}

      console.error(`[BREVO ERROR] Status ${res.status}:`, parsedMsg);
      return {
        success: false,
        error: parsedMsg,
        statusCode: res.status
      };
    }

    const data = await res.json();
    console.log(`[BREVO SUCCESS] Email dispatched to ${cleanEmail}, MessageId: ${data.messageId}`);

    return {
      success: true,
      messageId: data.messageId,
      statusCode: 201
    };
  } catch (err: any) {
    console.error('[BREVO EXCEPTION]', err);
    return {
      success: false,
      error: err.message || 'Network exception communicating with Brevo API',
      statusCode: 500
    };
  }
}
