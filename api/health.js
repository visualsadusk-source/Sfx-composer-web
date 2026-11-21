/**
 * api/health.js
 * Health check & configuration status endpoint.
 * Exposes key ID public prefix and verifies system readiness without leaking secrets.
 */

const { handleCors } = require('./_shared');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const hasSecret = !!process.env.RAZORPAY_KEY_SECRET;
  const isLive = keyId.startsWith('rzp_live_');
  const isTest = keyId.startsWith('rzp_test_');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    ok: true,
    service: 'SFX Composer Payment Backend',
    version: '2.4.0',
    timestamp: new Date().toISOString(),
    razorpay: {
      configured: !!(keyId && hasSecret),
      key_id: keyId || null,
      mode: isLive ? 'LIVE' : (isTest ? 'TEST' : 'UNCONFIGURED'),
      is_live: isLive
    },
    pricing: {
      amount_inr: 199,
      amount_paise: 19900,
      currency: 'INR'
    },
    product: {
      name: 'SFX Composer Ultimate Bundle',
      includes: ['SFX Composer Plugin (Lifetime)', '7GB Master SFX Library (20 Folders)'],
      drive_link_configured: !!process.env.SFX_LIBRARY_DRIVE_URL
    }
  }));
};
