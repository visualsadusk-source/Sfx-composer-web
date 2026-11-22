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
    return { name: 'SFX Composer', email: 'sfxcomposer@gmail.com' };
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
  const sfxLibraryDriveUrl = (Deno.env.get('SFX_LIBRARY_DRIVE_URL') || 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing').trim();
  const licenseTypeLabel = (params.licenseType || 'lifetime').toUpperCase();
  const isResendNotice = params.isResend ? '<div style="background: rgba(255, 159, 10, 0.15); border: 1px solid #ff9f0a; color: #ff9f0a; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.05em;">Duplicate / Requested Copy</div>' : '';

  const subject = params.isResend 
    ? `Your SFX Composer Ultimate Bundle License & 7GB Library (Re-sent Copy)`
    : `Your SFX Composer Ultimate Bundle — License Key & 7GB SFX Library Access!`;

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
    .bundle-badge { display: inline-block; background: rgba(10, 132, 255, 0.15); border: 1px solid #0A84FF; color: #0A84FF; padding: 4px 10px; border-radius: 999px; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
    .key-card { background: #000000; border: 1.5px solid #0A84FF; border-radius: 8px; padding: 22px 18px; text-align: center; margin: 20px 0; box-shadow: 0 0 24px rgba(10,132,255,0.15); }
    .key-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; color: #0A84FF; margin-bottom: 8px; }
    .key-value { font-family: ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace; font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: 0.12em; user-select: all; word-break: break-all; }
    .key-hint { font-size: 11px; color: #626A7A; margin-top: 8px; }
    .library-card { background: #0B0E14; border: 1px solid #23272F; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .library-title { font-size: 14px; font-weight: 800; color: #FFFFFF; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    .library-meta { font-size: 11.5px; color: #626A7A; margin-bottom: 14px; line-height: 1.5; }
    .folder-pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 16px 0; }
    .folder-pill { display: inline-block; background: #181C24; border: 1px solid #283040; border-radius: 4px; padding: 3px 8px; font-size: 10.5px; color: #B0B8C8; font-family: monospace; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .info-table td { padding: 8px 12px; border-bottom: 1px solid #1C2028; }
    .info-table td.label { color: #626A7A; width: 38%; }
    .info-table td.val { color: #FFFFFF; font-weight: 600; text-align: right; }
    .steps { background: #0B0D10; border: 1px solid #1C2028; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .steps-title { font-size: 13px; font-weight: 700; color: #FFFFFF; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .steps ol { margin: 0; padding-left: 20px; font-size: 13px; color: #B0B8C8; line-height: 1.7; }
    .steps li { margin-bottom: 6px; }
    .btn-container { text-align: center; margin: 24px 0 12px 0; }
    .btn { display: inline-block; background: #0A84FF; color: #FFFFFF; font-size: 13px; font-weight: 700; text-decoration: none; padding: 11px 22px; border-radius: 6px; margin: 4px; }
    .btn-drive { background: #1F883D; color: #FFFFFF; }
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
          <div class="brand">SFX COMPOSER ULTIMATE BUNDLE</div>
          <div class="brand-sub">SFX Composer Plugin + 7GB Master SFX Library (20 Categories)</div>
        </td>
      </tr>
      <tr>
        <td class="content">
          ${isResendNotice}
          <div class="bundle-badge">TWO PRODUCTS — ONE BUNDLE (₹199)</div>
          <h1>Your Ultimate Bundle Access</h1>
          <p>Hello <strong>${recipientName}</strong>,</p>
          <p>
            Thank you for purchasing the <strong>SFX Composer Ultimate Bundle</strong>. Your payment of ₹199 has been securely verified. Both products included in your bundle are delivered below:
          </p>

          <!-- Product 1: Plugin License -->
          <div style="font-size: 14px; font-weight: 800; color: #fff; margin-top: 24px; border-left: 3px solid #0A84FF; padding-left: 10px;">
            PRODUCT 1: SFX COMPOSER PLUGIN LICENSE
          </div>

          <div class="key-card">
            <div class="key-label">Official ${licenseTypeLabel} License Key</div>
            <div class="key-value">${params.licenseKey}</div>
            <div class="key-hint">Copy and paste this key into the plugin activation window in Premiere Pro / After Effects</div>
          </div>

          <!-- Product 2: 7GB SFX Library -->
          <div style="font-size: 14px; font-weight: 800; color: #fff; margin-top: 28px; border-left: 3px solid #1F883D; padding-left: 10px;">
            PRODUCT 2: 7GB MASTER SOUND EFFECTS LIBRARY
          </div>

          <div class="library-card">
            <div class="library-title">
              <span>📁 7GB Master SFX Library (20 Folder Categories)</span>
            </div>
            <div class="library-meta">
              Original uncompressed 24-bit / 48kHz production audio archive hosted securely on Google Drive. Access and download anytime:
            </div>

            <div class="folder-pills">
              <span class="folder-pill">📁 Button</span>
              <span class="folder-pill">📁 Countdown &amp; List</span>
              <span class="folder-pill">📁 Devin SFX</span>
              <span class="folder-pill">📁 Foley</span>
              <span class="folder-pill">📁 General Music</span>
              <span class="folder-pill">📁 Glitch &amp; Flicker</span>
              <span class="folder-pill">📁 Granular Combo</span>
              <span class="folder-pill">📁 Granular</span>
              <span class="folder-pill">📁 Human</span>
              <span class="folder-pill">📁 Impact &amp; Hit</span>
              <span class="folder-pill">📁 Music Sounds Effect</span>
              <span class="folder-pill">📁 Power Down &amp; Up</span>
              <span class="folder-pill">📁 sfx 1</span>
              <span class="folder-pill">📁 SFX Monster</span>
              <span class="folder-pill">📁 sound effect important 2.0</span>
              <span class="folder-pill">📁 Sound Effects</span>
              <span class="folder-pill">📁 Transition</span>
              <span class="folder-pill">📁 Typing</span>
              <span class="folder-pill">📁 UE SFX PACK</span>
              <span class="folder-pill">📁 ui sfx</span>
            </div>

            <div style="text-align: center;">
              <a href="${sfxLibraryDriveUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-drive">
                ⬇ Download 7GB SFX Library (Google Drive)
              </a>
            </div>
          </div>

          <table class="info-table">
            <tr>
              <td class="label">Registered Email:</td>
              <td class="val">${cleanEmail}</td>
            </tr>
            <tr>
              <td class="label">Bundle Tier:</td>
              <td class="val">SFX Composer Ultimate Bundle (Plugin + 7GB Library)</td>
            </tr>
            <tr>
              <td class="label">Amount Paid:</td>
              <td class="val">₹199 INR (One-Time Payment)</td>
            </tr>
            ${params.orderId ? `<tr><td class="label">Order Reference:</td><td class="val" style="font-family:monospace; font-size:12px;">${params.orderId}</td></tr>` : ''}
            ${params.paymentId ? `<tr><td class="label">Payment ID:</td><td class="val" style="font-family:monospace; font-size:12px;">${params.paymentId}</td></tr>` : ''}
          </table>

          <div class="steps">
            <div class="steps-title">Plugin Installation &amp; Setup Guide</div>
            <ol>
              <li>Download the plugin installer package using the buttons below.</li>
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
          Need support or assistance? Contact our engineering team at <a href="mailto:support@sfxcomposer.com">support@sfxcomposer.com</a> or <a href="mailto:sfxcomposer@gmail.com">sfxcomposer@gmail.com</a>.<br/>
          &copy; 2026 SFX Composer. All rights reserved.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;

  const textContent = `
SFX COMPOSER ULTIMATE BUNDLE — PURCHASE SUCCESSFUL
(TWO PRODUCTS — ONE BUNDLE)

Hello ${recipientName},

Thank you for purchasing the SFX Composer Ultimate Bundle (₹199 One-Time Payment).
Both products included in your bundle are delivered below:

PRODUCT 1: SFX COMPOSER PLUGIN
Official License Key: ${params.licenseKey}
Registered Email: ${cleanEmail}
ZXP Installer: ${zxpDownloadUrl}
CEP ZIP Package: ${zipDownloadUrl}

PRODUCT 2: 7GB MASTER SOUND EFFECTS LIBRARY
Google Drive Access: ${sfxLibraryDriveUrl}
(Includes all 20 categories: Button, Countdown & List, Devin SFX, Foley, General Music, Glitch & Flicker, Granular Combo, Granular, Human, Impact & Hit, Music Sounds Effect, Power Down & Up, sfx 1, SFX Monster, sound effect important 2.0, Sound Effects, Transition, Typing, UE SFX PACK, ui sfx)

INSTALLATION & ACTIVATION:
1. Install plugin package using ZXP Installer or extract ZIP to your Adobe CEP directory.
2. Launch Adobe Premiere Pro or After Effects (CC 2021-2026 supported).
3. Open Window > Extensions > SFX Composer.
4. Enter registered email (${cleanEmail}) and license key: ${params.licenseKey}
5. Click Activate License.

Support: support@sfxcomposer.com / sfxcomposer@gmail.com
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
