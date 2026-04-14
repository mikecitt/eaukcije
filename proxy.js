/**
 * Minimal CORS proxy for eaukcija.sud.rs
 * Usage: node proxy.js
 * Then open http://localhost:3000 in your browser
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PROXY_PORT  = 3000;
const TARGET_HOST = 'eaukcija.sud.rs';

// MIME types for static files
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
};

const server = http.createServer((req, res) => {
  // ── API proxy: forward anything under /WebApi.Proxy/ to eaukcija.sud.rs ──
  if (req.url.startsWith('/WebApi.Proxy/')) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      const options = {
        hostname: TARGET_HOST,
        port:     443,
        path:     req.url,
        method:   req.method,
        headers: {
          'Content-Type':   'application/json',
          'Accept':         'application/json',
          'Content-Length': body.length,
          'User-Agent':     'Mozilla/5.0',
        },
      };

      const proxyReq = https.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          ...CORS_HEADERS,
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', err => {
        console.error('Proxy error:', err.message);
        res.writeHead(502, CORS_HEADERS);
        res.end(JSON.stringify({ error: err.message }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });

    return;
  }

  // ── Static file server: serve public/ directory ───────────────────────────
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`\n  Server:  http://localhost:${PROXY_PORT}`);
  console.log(`  Proxy:   https://${TARGET_HOST} (via localhost)\n`);
});
