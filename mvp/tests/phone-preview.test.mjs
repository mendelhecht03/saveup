import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPreview } from '../phone-preview.mjs';

test('phone preview gates every app route, enforces origin, and preserves upstream CSRF', async t => {
  let forwarded;
  const app = http.createServer((req, res) => {
    forwarded = req.headers;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const preview = createPreview({ upstreamPort: app.address().port, accessKey: 'private-key', sessionKey: 'session-key' });
  preview.setOrigin('https://saveup-test.trycloudflare.com');
  await new Promise(resolve => preview.server.listen(0, '127.0.0.1', resolve));
  t.after(() => { app.close(); preview.server.close(); });
  const request = (route, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: preview.server.address().port, path: route, method, headers: { host: 'saveup-test.trycloudflare.com', ...headers } }, res => {
      let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject); req.end(body);
  });
  assert.match((await request('/')).text, /complete private preview link/);
  for (const route of ['/api/state', '/app.js', '/.env.local']) assert.equal((await request(route)).status, 401);
  const unlock = { method: 'POST', headers: { origin: 'https://saveup-test.trycloudflare.com', 'content-type': 'application/json' }, body: JSON.stringify({ key: 'private-key' }) };
  assert.equal((await request('/_preview/unlock', { ...unlock, body: '{"key":"wrong"}' })).status, 401);
  assert.equal((await request('/_preview/unlock', { ...unlock, headers: { ...unlock.headers, origin: 'https://evil.example' } })).status, 403);
  const login = await request('/_preview/unlock', unlock);
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'][0], /Secure; HttpOnly; SameSite=Strict/);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request('/api/state', { headers: { cookie } })).status, 200);
  assert.equal(forwarded.cookie, undefined);
  assert.equal((await request('/api/state', { headers: { cookie, host: 'evil.example' } })).status, 403);
  assert.equal((await request('/api/review', { method: 'POST', headers: { cookie, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/review', { method: 'POST', headers: { cookie, origin: 'https://saveup-test.trycloudflare.com', 'x-saveup-csrf': 'csrf-marker', 'content-type': 'application/json' }, body: '{}' })).status, 200);
  assert.equal(forwarded.origin, `http://127.0.0.1:${app.address().port}`);
  assert.equal(forwarded['x-saveup-csrf'], 'csrf-marker');
});

test('expired phone preview rejects access', async t => {
  const preview = createPreview({ expiresAt: Date.now() - 1 });
  preview.setOrigin('https://expired.trycloudflare.com');
  await new Promise(resolve => preview.server.listen(0, '127.0.0.1', resolve));
  t.after(() => preview.server.close());
  const status = await new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: preview.server.address().port, headers: { host: 'expired.trycloudflare.com' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 410);
});
