/**
 * api/library-download.js
 * License-Verified SFX Library Download Endpoint.
 *
 * Flow:
 *   1. Customer submits their SFX Composer license key
 *   2. Server validates the key against Supabase licenses table
 *   3. If valid & active → streams the 7GB archive from Google Drive
 *   4. Customer never sees any Google Drive URL or file ID
 *
 * Endpoint:  POST /api/library-download   { license_key: "SFX-XXXX-..." }
 *            GET  /api/library-download?license_key=SFX-XXXX-...
 *
 * Also accepts existing session tokens (Bearer or ?token=) as a fallback
 * for customers who already have an authenticated session.
 */

const crypto = require('crypto');
const { handleCors, memoryStore, verifySignedDownloadToken } = require('./_shared');
const { streamSfxLibrary, isDriveStreamingConfigured } = require('./drive-stream');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;    // 1 minute window
const RATE_LIMIT_MAX_ATTEMPTS = 5;      // Max 5 verification attempts per minute per IP
const DOWNLOAD_COOLDOWN = 10 * 1000;    // 10 seconds between download initiations

function getRateLimitKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function checkRateLimit(key) {
  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry = { windowStart: now, attempts: 0, lastDownload: 0 };
    rateLimitMap.set(key);
  }

  entry.attempts++;

  if (entry.attempts > RATE_LIMIT_MAX_ATTEMPTS) {
    return { blocked: true, reason: 'Too many verification attempts. Please wait a minute.' };
  }

  rateLimitMap.set(key, entry);
  return { blocked: false, entry };
}

function checkDownloadCooldown(key) {
  const entry = rateLimitMap.get(key);
  if (entry && entry.lastDownload && Date.now() - entry.lastDownload < DOWNLOAD_COOLDOWN) {
    return true;
  }
  return false;
}

function markDownloadStarted(key) {
  let entry = rateLimitMap.get(key);
  if (!entry) entry = { windowStart: Date.now(), attempts: 0, lastDownload: 0 };
  entry.lastDownload = Date.now();
  rateLimitMap.set(key, entry);
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, entry] of rateLimitMap.entries()) {
    if (entry.windowStart < cutoff) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

// ─── Audit Logging ──────────────────────────────────────────────────────────

const libraryAuditLog = [];

function logAudit(entry) {
  entry.timestamp = new Date().toISOString();
  libraryAuditLog.push(entry);
  if (libraryAuditLog.length > 500) libraryAuditLog.shift();
  // Log to console for server-side monitoring (scrubbed — no secrets)
  console.log(`[LIBRARY-DL] ${entry.status.toUpperCase()} | ${entry.license_key_prefix || 'no-key'} | ${entry.email || 'unknown'} | ${entry.reason}`);
}

// ─── License Verification ───────────────────────────────────────────────────

/**
 * Verify a license key against:
 *  1. In-memory store (recently issued keys from this server session)
 *  2. Supabase 'licenses' table (production database)
 *
 * Returns { valid, email, license_id, reason } or { valid: false, reason }
 */
async function verifyLicenseKey(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { valid: false, reason: 'missing_license_key' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();

  // Validate format: SFX-XXXX-XXXX-XXXX-XXXX
  if (!/^SFX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey)) {
    return { valid: false, reason: 'invalid_format' };
  }

  // 1. Check in-memory store
  for (const [orderId, lic] of memoryStore.licenses.entries()) {
    if (lic.license_key === cleanKey) {
      if (lic.status === 'active') {
        return {
          valid: true,
          email: lic.email,
          license_id: lic.license_id || lic.id,
          reason: 'active_memory_license'
        };
      } else {
        return { valid: false, reason: `license_${lic.status || 'inactive'}` };
      }
    }
  }

  // 2. Check Supabase database
  if (SERVICE_KEY) {
    try {
      // First, try to find the license by its plaintext key
      // The 'licenses' table may store license_key as a hash. Use the
      // Edge Function for verified lookup if direct match fails.
      const hash = crypto.createHash('sha256').update(cleanKey).digest('hex');

      const licRes = await fetch(
        `${SUPABASE_URL}/rest/v1/licenses?select=id,status,license_type,customer_id,product_id,created_at,customers!inner(email)&or=(license_key_hash.eq.${hash},license_key.eq.${encodeURIComponent(cleanKey)})&limit=1`,
        {
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
          }
        }
      );

      if (licRes.ok) {
        const rows = await licRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const lic = rows[0];
          const status = (lic.status || '').toLowerCase();

          if (status === 'active') {
            const email = lic.customers?.email || '';
            return {
              valid: true,
              email,
              license_id: lic.id,
              reason: 'active_database_license'
            };
          } else if (status === 'revoked') {
            return { valid: false, reason: 'license_revoked' };
          } else if (status === 'suspended') {
            return { valid: false, reason: 'license_suspended' };
          } else if (status === 'expired') {
            return { valid: false, reason: 'license_expired' };
          } else {
            return { valid: false, reason: `license_${status || 'inactive'}` };
          }
        }
      }

      // 3. Try Edge Function decryption-based lookup (for encrypted keys)
      try {
        const edgeRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-license-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
          },
          body: JSON.stringify({ license_key: cleanKey })
        });

        if (edgeRes.ok) {
          const edgeData = await edgeRes.json();
          if (edgeData && edgeData.valid && edgeData.status === 'active') {
            return {
              valid: true,
              email: edgeData.email || '',
              license_id: edgeData.license_id || edgeData.id,
              reason: 'active_edge_verified_license'
            };
          } else if (edgeData && edgeData.valid === false) {
            return { valid: false, reason: `license_${edgeData.status || 'not_found'}` };
          }
        }
      } catch (edgeErr) {
        // Edge function might not exist yet — fall through
        console.warn('Edge verify-license-key not available:', edgeErr.message);
      }
    } catch (dbErr) {
      console.error('Database license verification error:', dbErr.message);
      // Don't fail open — deny access on DB error
      return { valid: false, reason: 'verification_error' };
    }
  }

  return { valid: false, reason: 'license_not_found' };
}

// ─── Main Handler ───────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const clientIp = getRateLimitKey(req);

  // ── Extract license key from body (POST) or query (GET) ──

  let licenseKey = '';
  let sessionToken = '';

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body) body = {};
    licenseKey = (body.license_key || body.licenseKey || '').trim();
  } else {
    licenseKey = (url.searchParams.get('license_key') || '').trim();
  }

  // Also accept session token as fallback (from existing auth flow)
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    sessionToken = authHeader.substring(7).trim();
  }
  if (!sessionToken) {
    sessionToken = (url.searchParams.get('token') || '').trim();
  }

  // ── Require at least one auth method ──

  if (!licenseKey && !sessionToken) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      code: 'MISSING_CREDENTIALS',
      message: 'Please provide your SFX Composer license key to download the SFX Library.'
    }));
  }

  // ── Rate limit check ──

  const rateCheck = checkRateLimit(clientIp);
  if (rateCheck.blocked) {
    logAudit({
      license_key_prefix: licenseKey ? licenseKey.substring(0, 8) + '...' : 'session',
      status: 'rate_limited',
      ip: clientIp,
      reason: 'rate_limit_exceeded'
    });

    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      code: 'RATE_LIMITED',
      message: rateCheck.reason
    }));
  }

  // ── Verify license or session token ──

  let verifiedEmail = '';
  let verifiedLicenseId = '';
  let verificationMethod = '';

  if (licenseKey) {
    // Primary path: License key verification
    const result = await verifyLicenseKey(licenseKey);

    if (!result.valid) {
      const reasonMap = {
        'missing_license_key': 'Please enter your SFX Composer license key.',
        'invalid_format': 'Invalid license key format. Keys look like SFX-XXXX-XXXX-XXXX-XXXX.',
        'license_revoked': 'This license has been revoked. Please contact support.',
        'license_suspended': 'This license is suspended. Please contact support.',
        'license_expired': 'This license has expired.',
        'license_not_found': 'License key not found. Please check your key and try again.',
        'verification_error': 'Could not verify license at this time. Please try again later.'
      };

      logAudit({
        license_key_prefix: licenseKey.substring(0, 8) + '...',
        status: 'denied',
        ip: clientIp,
        reason: result.reason
      });

      res.writeHead(result.reason === 'verification_error' ? 503 : 403, {
        'Content-Type': 'application/json'
      });
      return res.end(JSON.stringify({
        ok: false,
        code: result.reason.toUpperCase(),
        message: reasonMap[result.reason] || 'License verification failed.'
      }));
    }

    verifiedEmail = result.email;
    verifiedLicenseId = result.license_id;
    verificationMethod = result.reason;

  } else if (sessionToken) {
    // Fallback: Existing session token (from customer dashboard)
    const payload = verifySignedDownloadToken(sessionToken);
    if (!payload || !payload.email) {
      logAudit({
        license_key_prefix: 'session-token',
        status: 'denied',
        ip: clientIp,
        reason: 'invalid_session_token'
      });

      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: false,
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired session. Please use your license key.'
      }));
    }

    verifiedEmail = payload.email;
    verificationMethod = 'session_token';
  }

  // ── Download cooldown check ──

  if (checkDownloadCooldown(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      code: 'COOLDOWN',
      message: 'Download already in progress. Please wait a moment before trying again.'
    }));
  }

  // ── Verification-only mode (for frontend to show success state before download) ──

  if (url.searchParams.get('verify_only') === 'true' || (req.body && req.body.verify_only)) {
    logAudit({
      license_key_prefix: licenseKey ? licenseKey.substring(0, 8) + '...' : 'session',
      email: verifiedEmail,
      status: 'verified',
      ip: clientIp,
      reason: verificationMethod
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      verified: true,
      email: verifiedEmail,
      license_id: verifiedLicenseId || undefined,
      message: 'License verified. Ready to download.'
    }));
  }

  // ── Check Drive streaming configuration ──

  if (!isDriveStreamingConfigured()) {
    logAudit({
      license_key_prefix: licenseKey ? licenseKey.substring(0, 8) + '...' : 'session',
      email: verifiedEmail,
      status: 'error',
      ip: clientIp,
      reason: 'drive_not_configured'
    });

    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      code: 'SERVICE_NOT_CONFIGURED',
      message: 'The SFX Library download service is not yet configured. Please contact support or check back shortly.'
    }));
  }

  // ── Stream the 7GB SFX Library ──

  logAudit({
    license_key_prefix: licenseKey ? licenseKey.substring(0, 8) + '...' : 'session',
    email: verifiedEmail,
    license_id: verifiedLicenseId,
    status: 'granted',
    ip: clientIp,
    reason: `download_started_via_${verificationMethod}`
  });

  markDownloadStarted(clientIp);

  try {
    await streamSfxLibrary(req, res);
  } catch (streamErr) {
    console.error('SFX Library stream error:', streamErr.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        code: 'STREAM_ERROR',
        message: 'An error occurred during download. Please try again.'
      }));
    }
  }
};

module.exports.verifyLicenseKey = verifyLicenseKey;
module.exports.libraryAuditLog = libraryAuditLog;
