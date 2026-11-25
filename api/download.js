/**
 * api/download.js
 * Secure Download Gateway for SFX Composer Products & Sound Libraries.
 * 
 * Enforces strict Server-Side Access Control:
 * 1. Authenticates Supabase JWT Bearer token
 * 2. Queries database for active, unrevoked purchase entitlement
 * 3. Logs all granted and denied access attempts (download_audit_logs)
 * 4. Delivers binary plugin files or authorized Google Drive links only to verified purchasers
 * 5. Returns HTTP 401 for unauthenticated and HTTP 403 for unpaid/refunded users
 */

const fs = require('fs');
const path = require('path');
const { handleCors, memoryStore, verifySignedDownloadToken } = require('./_shared');
const { streamSfxLibrary, isDriveStreamingConfigured } = require('./drive-stream');
const { verifyLicenseKey } = require('./library-download');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wyjazmiihwjlrkggeeez.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// In-memory download audit trail (supplementing database audit logs)
const downloadAuditLogs = [];

async function verifySupabaseToken(token) {
  if (!token) return null;
  // If service role key provided in admin context, treat as admin
  if (SERVICE_KEY && token === SERVICE_KEY) {
    return { email: 'admin@sfxcomposer.com', is_admin: true, id: 'admin-service-role' };
  }

  // Check customer portal verified session token (sfx_token_...)
  if (token.startsWith('sfx_token_')) {
    const payload = verifySignedDownloadToken(token);
    if (payload && payload.email) {
      return { email: payload.email, payment_id: payload.payment_id, id: payload.payment_id || payload.email };
    }
    return null;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return null;
    const userData = await res.json();
    return userData && userData.email ? userData : null;
  } catch (err) {
    console.error('Token verification network error:', err);
    return null;
  }
}

async function checkEntitlement(email, user) {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check in-memory store for recent verified purchases in this session
  for (const [orderId, lic] of memoryStore.licenses.entries()) {
    if (lic.email === cleanEmail && lic.status === 'active') {
      return { has_access: true, reason: 'verified_active_license' };
    }
  }

  if (user && user.payment_id) {
    for (const [orderId, lic] of memoryStore.licenses.entries()) {
      if (lic.payment_id === user.payment_id || lic.provider_payment_id === user.payment_id) {
        return { has_access: true, reason: 'verified_active_license_by_payment' };
      }
    }
    for (const [orderId, ord] of memoryStore.orders.entries()) {
      if ((ord.payment_id === user.payment_id || orderId === user.payment_id) && ord.status === 'completed') {
        return { has_access: true, reason: 'verified_order_by_payment' };
      }
    }
  }

  // 2. Query Supabase for active product_entitlements or active licenses
  try {
    const licRes = await fetch(`${SUPABASE_URL}/rest/v1/licenses?select=id,status,customer_id,customers!inner(email)&customers.email=eq.${cleanEmail}&status=eq.active`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    });
    if (licRes.ok) {
      const rows = await licRes.json();
      if (Array.isArray(rows) && rows.length > 0) {
        return { has_access: true, reason: 'active_database_license' };
      }
    }

    // Check payment_orders with completed status
    const ordRes = await fetch(`${SUPABASE_URL}/rest/v1/payment_orders?select=id,payment_status&customer_email=eq.${cleanEmail}&payment_status=eq.completed`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    });
    if (ordRes.ok) {
      const orders = await ordRes.json();
      if (Array.isArray(orders) && orders.length > 0) {
        return { has_access: true, reason: 'completed_payment_order' };
      }
    }
  } catch (dbErr) {
    console.warn('Database entitlement check warning:', dbErr.message);
  }

  return { has_access: false, reason: 'unpaid_or_revoked' };
}

function logAudit(entry) {
  entry.timestamp = new Date().toISOString();
  downloadAuditLogs.push(entry);
  if (downloadAuditLogs.length > 1000) downloadAuditLogs.shift();
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const reqType = url.searchParams.get('type') || '';
  const tokenParam = url.searchParams.get('token') || '';
  const licenseKeyParam = (url.searchParams.get('license_key') || (req.body && req.body.license_key) || '').trim();

  // 1. Extract Bearer Token from Authorization Header or query param
  let token = '';
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (tokenParam) {
    token = tokenParam.trim();
  }

  // Also check if request comes from a static direct file path like /downloads/sfx-composer-pro-v2.2.0.zxp
  let requestedFile = '';
  if (url.pathname.includes('.zxp') || reqType === 'zxp') {
    requestedFile = url.pathname.includes('v2.4.0') ? 'sfx-composer-pro-v2.4.0.zxp' : 'sfx-composer-pro-v2.2.0.zxp';
  } else if (reqType === 'sfx-library') {
    requestedFile = 'sfx-library';
  }

  // 2. Authentication Check (Accepts either session token OR verified license key)
  let user = null;
  let entitlement = { has_access: false, reason: 'unauthenticated' };

  if (licenseKeyParam) {
    // License key authentication path
    const licResult = await verifyLicenseKey(licenseKeyParam);
    if (!licResult.valid) {
      logAudit({
        email: 'invalid_license',
        file: requestedFile || 'sfx-library',
        status: 'denied',
        ip: req.socket?.remoteAddress,
        reason: licResult.reason
      });

      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        ok: false,
        code: (licResult.reason || 'INVALID_LICENSE').toUpperCase(),
        message: 'Invalid, expired, or revoked license key. Access denied.'
      }));
    }

    user = { email: licResult.email || 'license-user', id: licResult.license_id };
    entitlement = { has_access: true, reason: licResult.reason };
  } else if (token) {
    user = await verifySupabaseToken(token);
    if (!user) {
      logAudit({
        email: 'invalid_token',
        file: requestedFile || 'unknown',
        status: 'denied',
        ip: req.socket?.remoteAddress,
        reason: 'invalid_or_expired_token'
      });

      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        ok: false,
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired session token. Please sign in again.'
      }));
    }

    entitlement = await checkEntitlement((user.email || '').trim().toLowerCase(), user);
  } else {
    logAudit({
      email: 'anonymous',
      file: requestedFile || 'unknown',
      status: 'denied',
      ip: req.socket?.remoteAddress,
      reason: 'missing_authentication'
    });

    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'Authentication required. Please enter your license key or sign in to access product downloads.'
    }));
  }

  const userEmail = (user.email || '').trim().toLowerCase();

  // 3. Purchase Entitlement Check
  if (!entitlement.has_access) {
    logAudit({
      email: userEmail,
      file: requestedFile || 'unknown',
      status: 'denied',
      ip: req.socket?.remoteAddress,
      reason: 'unpaid_or_revoked_entitlement'
    });

    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Access denied: Active purchase entitlement required. Please purchase SFX Composer to unlock product downloads.'
    }));
  }

  // 4. Authorized Access Granted -> Log & Deliver
  logAudit({
    email: userEmail,
    file: requestedFile || 'unknown',
    status: 'granted',
    ip: req.socket?.remoteAddress,
    reason: entitlement.reason
  });

  // Action A: Deliver 7GB SFX Library
  if (requestedFile === 'sfx-library') {
    // 1. Verification-only check (for frontend status preview)
    const isVerifyOnly = url.searchParams.get('verify_only') === 'true' || (req.body && req.body.verify_only);

  // Handle verify_only request: respond with JSON indicating verification status and download URLs
  if (isVerifyOnly) {
    // Perform entitlement check without streaming the file
    const entitlement = await checkEntitlement(userEmail, user);
    if (!entitlement.has_access) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, code: 'UNAUTHORIZED', message: 'License verification failed: ' + entitlement.reason }));
    }
    // Successful verification: return JSON with secure download URLs (including token)
    const tokenParam = encodeURIComponent(token || licenseKeyParam);
    const responsePayload = {
      ok: true,
      verified: true,
      email: userEmail,
      downloads: {
        zxp_url: `/api/download?type=zxp&token=${tokenParam}`,
        sfx_library_url: `/api/download?type=sfx-library&token=${tokenParam}`
      }
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(responsePayload));
  }
    if (isVerifyOnly) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        ok: true,
        verified: true,
        has_access: true,
        email: userEmail,
        product: '7GB Master SFX Library',
        message: 'License verified. Ready to download.'
      }));
    }

    const acceptHeader = req.headers['accept'] || '';
    if (acceptHeader.includes('application/json') || url.searchParams.get('format') === 'json') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        ok: true,
        has_access: true,
        verified: true,
        product: 'SFX Composer Complete Bundle',
        download_ready: true,
        download_url: `/api/download?type=sfx-library&token=${encodeURIComponent(token || licenseKeyParam)}`
      }));
    }

    // 2. Stream directly from Google Drive API if configured
    if (isDriveStreamingConfigured()) {
      logAudit({
        email: userEmail,
        file: 'sfx-library-stream',
        status: 'granted',
        ip: req.socket?.remoteAddress,
        reason: 'streaming_via_drive_api'
      });

      try {
        await streamSfxLibrary(req, res);
        return;
      } catch (streamErr) {
        console.error('Drive stream error:', streamErr.message);
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            ok: false,
            code: 'DRIVE_STREAM_ERROR',
            message: 'Unable to stream download from Google Drive API. Please try again.'
          }));
        }
        return;
      }
    }

    // 3. Local/Private storage streaming fallback (for offline, testing or dedicated server hosting)
    const localLibPaths = [
      path.join(__dirname, '..', 'private_storage', 'downloads', 'SFX-Composer-Master-Library.zip'),
      path.join(__dirname, '..', 'private_storage', 'SFX-Composer-Master-Library.zip'),
      path.join(__dirname, '..', 'private_storage', 'downloads', 'sfx-library-7gb.zip')
    ];
    const localLibFile = localLibPaths.find(p => fs.existsSync(p));
    if (localLibFile) {
      const stat = fs.statSync(localLibFile);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="SFX-Composer-Master-Library.zip"',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate'
      });
      return fs.createReadStream(localLibFile).pipe(res);
    }

    // 4. If neither Google Drive streaming nor local archive is configured
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: false,
      code: 'SERVICE_NOT_CONFIGURED',
      message: 'The secure SFX Library streaming service is not configured with Google Drive API credentials. Please contact support.'
    }));
  }

  // Action B: Stream Binary Plugin Installer (.zxp) from Private Storage
  if (requestedFile.endsWith('.zxp')) {
    const candidatePaths = [
      path.join(__dirname, '..', 'private_storage', 'downloads', requestedFile),
      path.join(__dirname, '..', 'private_storage', requestedFile),
      path.join(__dirname, '..', 'downloads', requestedFile)
    ];

    let filePath = candidatePaths.find(p => fs.existsSync(p));

    if (!filePath) {
      // Fallback to canonical v2.2.0 file
      const canonicalName = 'sfx-composer-pro-v2.2.0.zxp';
      const fallbackPaths = [
        path.join(__dirname, '..', 'private_storage', 'downloads', canonicalName),
        path.join(__dirname, '..', 'private_storage', canonicalName),
        path.join(__dirname, '..', 'downloads', canonicalName)
      ];
      filePath = fallbackPaths.find(p => fs.existsSync(p));
    }
    if (!filePath || !fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, message: 'Installer file not found on server' }));
    }

    const stat = fs.statSync(filePath);
    const contentType = 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${requestedFile}"`,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate'
    });

    const readStream = fs.createReadStream(filePath);
    return readStream.pipe(res);
  }

  // Default: Return verified download URLs list
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({
    ok: true,
    has_access: true,
    email: userEmail,
    downloads: {
      zxp_url: `/api/download?type=zxp&token=${encodeURIComponent(token)}`,
      sfx_library_url: `/api/download?type=sfx-library&token=${encodeURIComponent(token)}`
    }
  }));
};

module.exports.downloadAuditLogs = downloadAuditLogs;
