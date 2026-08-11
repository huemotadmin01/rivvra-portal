#!/usr/bin/env node
/**
 * Staging static server — serves the Vite build (dist/) on Render behind
 * HTTP basic auth, with noindex headers and a blanket robots.txt disallow.
 * Dependency-free (node:http only) so it adds nothing to the portal's
 * package.json.
 *
 * ENV
 *   STAGING_BASIC_AUTH   "user:password" — REQUIRED; refuses to start without
 *                        it (an ungated staging origin defeats the point).
 *   PORT                 default 10000 (Render's default)
 *
 * Render setup: build `npm ci && npm run build:staging`, start `node staging/server.js`.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 10000;
const AUTH = process.env.STAGING_BASIC_AUTH;
if (!AUTH || !AUTH.includes(':')) {
  console.error('STAGING_BASIC_AUTH="user:password" is required — staging must not be publicly reachable.');
  process.exit(1);
}
const EXPECTED = 'Basic ' + Buffer.from(AUTH).toString('base64');
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`No build found at ${DIST} — run \`npm run build:staging\` first.`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
  '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

// timingSafeEqual over hashes so length differences don't leak.
const crypto = require('node:crypto');
function authOk(header) {
  if (!header) return false;
  const a = crypto.createHash('sha256').update(header).digest();
  const b = crypto.createHash('sha256').update(EXPECTED).digest();
  return crypto.timingSafeEqual(a, b);
}

http.createServer((req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // robots.txt is served pre-auth so crawlers that ignore 401s still get told no.
  if (urlPath === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('User-agent: *\nDisallow: /\n');
  }

  if (!authOk(req.headers.authorization)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Rivvra staging"' });
    return res.end('Authentication required');
  }

  // Resolve inside dist only (blocks ../ traversal).
  let filePath = path.normalize(path.join(DIST, urlPath));
  if (!filePath.startsWith(DIST)) { res.writeHead(400); return res.end(); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html'); // SPA fallback for deep links
  }

  const ext = path.extname(filePath).toLowerCase();
  const isHashedAsset = /-[A-Za-z0-9_]{8,}\.\w+$/.test(path.basename(filePath));
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // Hashed assets are immutable; index.html must always revalidate.
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}).listen(PORT, () => console.log(`Staging server on :${PORT}, serving ${DIST} (basic auth ON)`));
