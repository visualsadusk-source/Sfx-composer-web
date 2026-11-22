const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

// Ensure defaults
if (!process.env.SFX_LIBRARY_DRIVE_URL) {
  process.env.SFX_LIBRARY_DRIVE_URL = 'https://drive.google.com/file/d/1rF1f3KEKSpri1KoZqP8SCv-Q0-NYxvGD/view?usp=sharing';
}
if (!process.env.PRICE_INR) {
  process.env.PRICE_INR = '199';
}

// Serverless API handlers
const apiHandlers = {
  '/api/create-order': require('./api/create-order'),
  '/api/verify-payment': require('./api/verify-payment'),
  '/api/payment-webhook': require('./api/payment-webhook'),
  '/api/download': require('./api/download'),
  '/api/refund': require('./api/refund'),
  '/api/health': require('./api/health')
};

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.zxp': 'application/octet-stream'
};

const server = http.createServer((req, res) => {
  const [reqPath] = req.url.split('?');
  const cleanPath = decodeURI(reqPath);

  // 1. Route API requests to Serverless handlers
  if (cleanPath.startsWith('/api/')) {
    const handler = apiHandlers[cleanPath] || apiHandlers[cleanPath.replace(/\/$/, '')];
    if (handler) {
      let bodyData = '';
      req.on('data', chunk => bodyData += chunk);
      req.on('end', async () => {
        try {
          if (bodyData && req.headers['content-type']?.includes('application/json')) {
            req.body = JSON.parse(bodyData);
          } else {
            req.body = bodyData;
          }
        } catch (e) {
          req.body = bodyData;
        }

        try {
          await handler(req, res);
        } catch (handlerErr) {
          console.error(`API Error on ${cleanPath}:`, handlerErr);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, message: handlerErr.message }));
          }
        }
      });
      return;
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok: false, message: 'API Route Not Found' }));
    }
  }

  // 1.5. Secure Download Gateway: NEVER serve /downloads/ statically!
  if (cleanPath.startsWith('/downloads/')) {
    return apiHandlers['/api/download'](req, res);
  }

  // 2. Static File Serving & Clean URLs
  let filePath = path.join(__dirname, cleanPath === '/' ? 'index.html' : cleanPath);

  // Security: prevent directory traversal outside root
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Clean URLs fallback (e.g. /admin -> /admin.html, /demo -> /demo.html)
      const htmlPath = filePath + '.html';
      if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
        filePath = htmlPath;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n======================================================`);
  console.log(`  SFX Composer Server running at: ${url}`);
  console.log(`  Razorpay Live Key: ${process.env.RAZORPAY_KEY_ID || 'Not set'}`);
  console.log(`  API Endpoints Active: /api/create-order, /api/verify-payment, /api/health`);
  console.log(`======================================================\n`);
});
