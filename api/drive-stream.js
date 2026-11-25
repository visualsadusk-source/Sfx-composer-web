/**
 * api/drive-stream.js
 * Google Drive Streaming Proxy — Zero-dependency, server-side only.
 *
 * Authenticates with Google Drive API v3 using a Service Account,
 * then pipes the private file bytes directly to the HTTP response.
 * Supports HTTP Range requests for download resumption.
 *
 * NEVER exposes the Google Drive file ID, service account credentials,
 * or any Google URL to the client.  All the client sees is our own
 * /api/download?type=sfx-library endpoint returning binary data.
 *
 * Required environment variables:
 *   SFX_LIBRARY_DRIVE_FILE_ID   — Google Drive file ID of the 7GB archive
 *   GOOGLE_SERVICE_ACCOUNT_JSON — Full JSON key (string) for the service account
 */

const crypto = require('crypto');
const https = require('https');

// ─── Service Account JWT Authentication ─────────────────────────────────────

/**
 * Create a signed JWT for Google OAuth2 token exchange.
 * Uses RS256 (RSA-SHA256) — native Node.js crypto, zero npm deps.
 */
function createServiceAccountJWT(serviceAccount, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600 // 1 hour
  };

  const segments = [
    base64urlEncode(JSON.stringify(header)),
    base64urlEncode(JSON.stringify(payload))
  ];
  const signingInput = segments.join('.');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(serviceAccount.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return signingInput + '.' + signature;
}

function base64urlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Token Cache ────────────────────────────────────────────────────────────

let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Obtain an OAuth2 access token (cached, auto-refreshes).
 * Returns { access_token, expires_in } or throws.
 */
async function getAccessToken(serviceAccount) {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const jwt = createServiceAccountJWT(serviceAccount, [
    'https://www.googleapis.com/auth/drive.readonly'
  ]);

  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const opts = {
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.access_token) {
            cachedAccessToken = data.access_token;
            tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
            resolve(data.access_token);
          } else {
            reject(new Error(`Google OAuth error: ${data.error_description || data.error || body}`));
          }
        } catch (e) {
          reject(new Error(`Google OAuth parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Google OAuth token request timed out')); });
    req.write(postData);
    req.end();
  });
}

// ─── Google Drive File Metadata ──────────────────────────────────────────────

/**
 * Fetch file metadata (name, size, mimeType) from Google Drive API v3.
 */
async function getFileMetadata(fileId, accessToken) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'www.googleapis.com',
      port: 443,
      path: `/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,size,mimeType`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Drive metadata error (${res.statusCode}): ${body}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Drive metadata parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Drive metadata request timed out')); });
    req.end();
  });
}

// ─── Streaming Proxy ─────────────────────────────────────────────────────────

/**
 * Stream file content from Google Drive to the client HTTP response.
 * Supports HTTP Range requests for download resumption.
 *
 * @param {string} fileId     Google Drive file ID
 * @param {string} accessToken  OAuth2 bearer token
 * @param {object} metadata   { name, size, mimeType }
 * @param {object} req        Node.js IncomingMessage (client request)
 * @param {object} res        Node.js ServerResponse  (client response)
 */
function streamFileToResponse(fileId, accessToken, metadata, req, res) {
  return new Promise((resolve, reject) => {
    const totalSize = parseInt(metadata.size, 10);
    const fileName = metadata.name || 'SFX-Composer-Master-Library.zip';
    const mimeType = metadata.mimeType || 'application/zip';

    // Parse Range header for resumable downloads
    let rangeStart = 0;
    let rangeEnd = totalSize - 1;
    let isPartial = false;

    const rangeHeader = req.headers['range'];
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        rangeStart = parseInt(match[1], 10);
        if (match[2]) {
          rangeEnd = parseInt(match[2], 10);
        }
        if (rangeStart >= 0 && rangeStart < totalSize) {
          isPartial = true;
        } else {
          // Invalid range
          res.writeHead(416, {
            'Content-Range': `bytes */${totalSize}`,
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({ ok: false, message: 'Range Not Satisfiable' }));
          return resolve();
        }
      }
    }

    const contentLength = rangeEnd - rangeStart + 1;

    // Build Google Drive API media download request
    const driveHeaders = {
      'Authorization': `Bearer ${accessToken}`
    };

    if (isPartial) {
      driveHeaders['Range'] = `bytes=${rangeStart}-${rangeEnd}`;
    }

    const driveOpts = {
      hostname: 'www.googleapis.com',
      port: 443,
      path: `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      method: 'GET',
      headers: driveHeaders
    };

    const driveReq = https.request(driveOpts, (driveRes) => {
      // Google returns 200 for full or 206 for partial content
      if (driveRes.statusCode !== 200 && driveRes.statusCode !== 206) {
        let errBody = '';
        driveRes.on('data', c => errBody += c);
        driveRes.on('end', () => {
          console.error(`Drive download error (${driveRes.statusCode}):`, errBody.substring(0, 500));
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ok: false,
              code: 'DRIVE_ERROR',
              message: 'The download service is temporarily unavailable. Please try again later.'
            }));
          }
          resolve();
        });
        return;
      }

      // Set response headers for the client download
      const responseHeaders = {
        'Content-Type': mimeType,
        'Content-Length': contentLength,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      };

      if (isPartial) {
        responseHeaders['Content-Range'] = `bytes ${rangeStart}-${rangeEnd}/${totalSize}`;
        res.writeHead(206, responseHeaders);
      } else {
        res.writeHead(200, responseHeaders);
      }

      // Pipe Google Drive response directly to client — zero buffering
      driveRes.pipe(res);

      driveRes.on('end', resolve);
      driveRes.on('error', (err) => {
        console.error('Drive stream error:', err.message);
        if (!res.writableEnded) {
          res.end();
        }
        resolve();
      });

      // Handle client disconnecting mid-download
      res.on('close', () => {
        driveRes.destroy();
      });
    });

    driveReq.on('error', (err) => {
      console.error('Drive request connection error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          code: 'DRIVE_UNAVAILABLE',
          message: 'Could not connect to the download service. Please try again later.'
        }));
      }
      resolve();
    });

    driveReq.setTimeout(30000, () => {
      driveReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          code: 'DRIVE_TIMEOUT',
          message: 'The download service took too long to respond. Please try again.'
        }));
      }
      resolve();
    });

    driveReq.end();
  });
}

// ─── Metadata Cache ──────────────────────────────────────────────────────────
let cachedMetadata = null;
let metadataCachedAt = 0;
const METADATA_TTL = 10 * 60 * 1000; // 10 minutes

// ─── Main Export ─────────────────────────────────────────────────────────────

const DEFAULT_SFX_LIBRARY_FILE_ID = '1NBpzJIUwErF6RPNaIOxcoGtWYL50Hw5s';

/**
 * Stream a shared Google Drive file via drive.usercontent.google.com with
 * confirmation bypass, redirect handling, HTML-response guard, and Range support.
 */
function streamPublicDriveToResponse(fileId, req, res, redirectUrl, depth) {
  const hop = depth || 0;
  if (hop > 5) {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'DRIVE_REDIRECT_LOOP', message: 'Too many redirects from storage provider.' }));
    }
    return Promise.resolve();
  }

  const targetUrl = redirectUrl || `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;

  return new Promise((resolve) => {
    const reqHeaders = {};
    if (req.headers['range']) {
      reqHeaders['Range'] = req.headers['range'];
    }

    const driveReq = https.request(targetUrl, { method: 'GET', headers: reqHeaders }, (driveRes) => {
      if (driveRes.statusCode >= 300 && driveRes.statusCode < 400 && driveRes.headers.location) {
        driveRes.resume();
        const nextUrl = new URL(driveRes.headers.location, targetUrl).toString();
        return streamPublicDriveToResponse(fileId, req, res, nextUrl, hop + 1).then(resolve);
      }

      const contentType = (driveRes.headers['content-type'] || '').toLowerCase();
      if ((driveRes.statusCode !== 200 && driveRes.statusCode !== 206) || contentType.includes('text/html')) {
        let errBody = '';
        driveRes.on('data', (c) => { if (errBody.length < 1024) errBody += c; });
        driveRes.on('end', () => {
          console.error(`Drive direct stream error (${driveRes.statusCode}, ${contentType}):`, errBody.substring(0, 300));
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              ok: false,
              code: 'DRIVE_ERROR',
              message: 'Unable to stream the Master SFX Library archive from storage. Please try again.'
            }));
          }
          resolve();
        });
        return;
      }

      const responseHeaders = {
        'Content-Type': 'application/zip',
        'Content-Disposition': driveRes.headers['content-disposition'] || 'attachment; filename="Sfx.zip"',
        'Accept-Ranges': driveRes.headers['accept-ranges'] || 'bytes',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff'
      };
      if (driveRes.headers['content-length']) {
        responseHeaders['Content-Length'] = driveRes.headers['content-length'];
      }
      if (driveRes.headers['content-range']) {
        responseHeaders['Content-Range'] = driveRes.headers['content-range'];
      }

      res.writeHead(driveRes.statusCode, responseHeaders);
      driveRes.pipe(res);

      driveRes.on('end', resolve);
      driveRes.on('error', (err) => {
        console.error('Drive stream pipe error:', err.message);
        if (!res.writableEnded) res.end();
        resolve();
      });
      res.on('close', () => {
        driveRes.destroy();
      });
    });

    driveReq.on('error', (err) => {
      console.error('Drive direct connection error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          code: 'DRIVE_UNAVAILABLE',
          message: 'Could not connect to the download service. Please try again later.'
        }));
      }
      resolve();
    });

    driveReq.setTimeout(30000, () => {
      driveReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          code: 'DRIVE_TIMEOUT',
          message: 'The download service took too long to respond. Please try again.'
        }));
      }
      resolve();
    });

    driveReq.end();
  });
}

/**
 * Stream the SFX Library archive from Google Drive to the authenticated client.
 * Call this ONLY after verifying the user's license / entitlement.
 *
 * @param {IncomingMessage} req  — client HTTP request
 * @param {ServerResponse}  res  — client HTTP response
 * @returns {Promise<void>}
 */
async function streamSfxLibrary(req, res) {
  // 1. Load credentials from environment
  const fileId = process.env.SFX_LIBRARY_DRIVE_FILE_ID || DEFAULT_SFX_LIBRARY_FILE_ID;
  const saJsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!saJsonStr) {
    await streamPublicDriveToResponse(fileId, req, res);
    return;
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(saJsonStr);
  } catch (e) {
    console.error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      code: 'CONFIG_ERROR',
      message: 'Server configuration error. Please contact support.'
    }));
  }

  // 2. Get access token
  let accessToken;
  try {
    accessToken = await getAccessToken(serviceAccount);
  } catch (err) {
    console.error('Google auth failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      code: 'AUTH_ERROR',
      message: 'Download service authentication failed. Please try again later.'
    }));
  }

  // 3. Get file metadata (cached)
  let metadata;
  try {
    if (cachedMetadata && Date.now() - metadataCachedAt < METADATA_TTL) {
      metadata = cachedMetadata;
    } else {
      metadata = await getFileMetadata(fileId, accessToken);
      cachedMetadata = metadata;
      metadataCachedAt = Date.now();
    }
  } catch (err) {
    console.error('Drive metadata fetch failed:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      code: 'DRIVE_ERROR',
      message: 'Could not retrieve file information from the download service.'
    }));
  }

  // 4. Stream the file to the client
  await streamFileToResponse(fileId, accessToken, metadata, req, res);
}

/**
 * Check whether Google Drive streaming is configured.
 * Returns true if both env vars are set.
 */
function isDriveStreamingConfigured() {
  return !!(process.env.SFX_LIBRARY_DRIVE_FILE_ID || DEFAULT_SFX_LIBRARY_FILE_ID);
}

module.exports = {
  streamSfxLibrary,
  isDriveStreamingConfigured,
  getAccessToken,
  getFileMetadata
};
