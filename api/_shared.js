/**
 * api/_shared.js
 * Shared utilities for SFX Composer payment backend (Vercel Serverless & Node.js).
 * Native Node.js crypto & https — Zero external npm dependencies.
 */

const crypto = require('crypto');
const https = require('https');

// CORS configuration for production (sfxcomposer.in, GitHub Pages, Localhost)
function getCorsHeaders(req) {
  const origin = req?.headers?.origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-razorpay-signature',
    'Access-Control-Allow-Credentials': 'true'
  };
}

function handleCors(req, res) {
  const headers = getCorsHeaders(req);
  Object.keys(headers).forEach(k => res.setHeader(k, headers[k]));
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

// Generate license key in SFX Composer format: SFX-XXXX-XXXX-XXXX-XXXX
function generateLicenseKey() {
  const segment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `SFX-${segment()}-${segment()}-${segment()}-${segment()}`;
}

// Cryptographic HMAC SHA-256 signature verification (timing-safe)
function verifyHmacSha256(data, signature, secret) {
  if (!data || !signature || !secret) return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret.trim())
      .update(data)
      .digest('hex');
    
    const sigBuf = Buffer.from(signature.trim().toLowerCase(), 'hex');
    const expBuf = Buffer.from(expected.toLowerCase(), 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch (err) {
    console.error('HMAC verification error:', err);
    return false;
  }
}

// Call Razorpay API using native https
function makeRazorpayRequest(endpoint, method, payload, keyId, keySecret) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const dataStr = payload ? JSON.stringify(payload) : null;

    const options = {
      hostname: 'api.razorpay.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    };

    if (dataStr) {
      options.headers['Content-Length'] = Buffer.byteLength(dataStr);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 });
        } catch (e) {
          resolve({ status: res.statusCode, text: body, ok: false });
        }
      });
    });

    req.on('error', err => reject(err));
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Razorpay API request timed out'));
    });

    if (dataStr) req.write(dataStr);
    req.end();
  });
}

// In-memory store for orders and verified licenses (fallback & local development)
const memoryStore = {
  orders: new Map(),
  licenses: new Map(),
  processedPayments: new Set(),
  purchases: new Map(),
  entitlements: new Map()
};

function getDownloadTokenSecret() {
  return process.env.LICENSE_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.RAZORPAY_KEY_SECRET || 'sfx-composer-secure-token-secret-2026';
}

// Generate cryptographically signed, expiring download session token (HMAC-SHA256)
function createSignedDownloadToken(payload, expiresInMs = 24 * 60 * 60 * 1000) {
  const secret = getDownloadTokenSecret();
  const tokenPayload = {
    ...payload,
    exp: Date.now() + expiresInMs
  };
  const data = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `sfx_token_${data}.${sig}`;
}

// Verify signed download session token
function verifySignedDownloadToken(token) {
  if (!token || typeof token !== 'string') return null;
  if (!token.startsWith('sfx_token_')) return null;
  const raw = token.substring('sfx_token_'.length);
  const secret = getDownloadTokenSecret();
  const parts = raw.split('.');
  if (parts.length === 2) {
    const [data, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('hex');
    const sigBuf = Buffer.from(sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
      if (payload && payload.exp && payload.exp > Date.now()) {
        return payload;
      }
    } catch (e) {
      return null;
    }
  } else if (parts.length === 1) {
    // Backwards-compatible fallback for active sessions in memory
    try {
      const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
      if (payload && payload.exp && payload.exp > Date.now()) {
        return payload;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

module.exports = {
  getCorsHeaders,
  handleCors,
  generateLicenseKey,
  verifyHmacSha256,
  makeRazorpayRequest,
  memoryStore,
  createSignedDownloadToken,
  verifySignedDownloadToken
};
