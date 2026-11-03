// Temporary, authenticated HTTPS bridge. The main app stays loopback-only.
import http from 'node:http';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cookieName = '__Host-saveup-preview';
const same = (a, b) => {
  const left = Buffer.from(String(a || '')), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const unlockPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SaveUp phone preview</title><style>body{margin:0;padding:60px 24px;background:#edf5fc;color:#142d50;font:18px system-ui}main{max-width:360px;margin:auto;padding:28px;background:white;border-radius:28px;box-shadow:0 12px 40px #142d5010}h1{font-size:26px}</style><main><h1>SaveUp phone preview</h1><p id="message">Open the complete private link printed in your terminal by npm run phone.</p><p>Temporary prototype · Plaid Sandbox</p></main><script>
const key = new URLSearchParams(location.hash.slice(1)).get('key');
history.replaceState(null, '', '/');
if(key) fetch('/_preview/unlock', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}).then(r=>{if(r.ok)location.replace('/');else document.getElementById('message').textContent='This link has expired. Ask for a fresh preview link.'}).catch(()=>document.getElementById('message').textContent='Unable to connect. Try the complete preview link again.');
</script></html>`;

export function createPreview({ upstreamPort = 4188, accessKey = randomBytes(32).toString('hex'), sessionKey = randomBytes(32).toString('hex'), expiresAt = Date.now() + 8 * 60 * 60 * 1000 } = {}) {
  let publicOrigin;
  const server = http.createServer(async (req, res) => {
    const reply = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type }); res.end(body);
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!publicOrigin || req.headers.host !== new URL(publicOrigin).host) return reply(403, 'Preview address not ready.');
    if (Date.now() >= expiresAt) return reply(410, 'Preview expired. Start a new phone preview.');
    if (req.headers.origin && req.headers.origin !== publicOrigin) return reply(403, 'Cross-origin request blocked.');
    if (req.headers['sec-fetch-site'] === 'cross-site' && req.method !== 'GET') return reply(403, 'Cross-site request blocked.');
    if (req.url === '/_preview/unlock' && req.method === 'POST') {
      if (req.headers.origin !== publicOrigin || !req.headers['content-type']?.startsWith('application/json')) return reply(403, 'Open the private link.');
      let body = '', size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024) return reply(413, 'Request too large.');
          body += chunk;
        }
        if (!same(JSON.parse(body).key, accessKey)) return reply(401, 'Invalid preview link.');
      } catch { return reply(400, 'Invalid request.'); }
      res.setHeader('Set-Cookie', `${cookieName}=${sessionKey}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}`);
      return reply(200, 'Unlocked');
    }
    const session = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!same(session, sessionKey)) {
      if (req.method === 'GET' && req.url === '/') return reply(200, unlockPage, 'text/html; charset=utf-8');
      return reply(401, 'Open the complete private preview link.');
    }
    // Forward only necessary headers. Cloud headers/cookies cannot override app security.
    const headers = { host: `127.0.0.1:${upstreamPort}` };
    for (const name of ['content-type', 'content-length', 'x-saveup-csrf', 'accept']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    if (req.headers.origin) headers.origin = `http://127.0.0.1:${upstreamPort}`;
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method, headers }, incoming => {
      res.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) reply(502, 'SaveUp is unavailable. Keep npm run start running on your PC.'); else res.destroy(); });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  return { server, accessKey, expiresAt, setOrigin(value) {
    const origin = new URL(value);
    if (origin.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(origin.hostname) || origin.port || origin.username || origin.password) throw new Error('Invalid tunnel origin.');
    publicOrigin = origin.origin;
  } };
}
