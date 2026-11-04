import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp } from '../server.mjs';
import { sqliteStore } from '../db.mjs';

// Raw request so the Host and Origin headers can be set freely.
const request = (port, path, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path, headers }, res => {
    let body = '';
    res.on('data', c => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
  }).on('error', reject);
});

test('the phone app address is accepted, and nothing else from outside', async () => {
  const store = sqliteStore(':memory:');
  const app = await createApp({ client: { configured: true, call: async () => ({}) }, store, publicHosts: ['my-pc.tail1234.ts.net'] });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const port = app.server.address().port;
  try {
    assert.equal((await request(port, '/api/state')).status, 200, 'loopback works as before');
    assert.equal((await request(port, '/api/state', { host: 'my-pc.tail1234.ts.net' })).status, 200, 'the Tailscale address works');
    assert.equal((await request(port, '/api/state', { host: 'evil.example.com' })).status, 403);
    assert.equal((await request(port, '/api/state', { host: 'my-pc.tail1234.ts.net', origin: 'https://evil.example.com' })).status, 403);
    assert.equal((await request(port, '/api/state', { host: 'my-pc.tail1234.ts.net', origin: 'https://my-pc.tail1234.ts.net' })).status, 200);

    const manifest = await request(port, '/manifest.webmanifest');
    assert.equal(manifest.type, 'application/manifest+json');
    const m = JSON.parse(manifest.body);
    assert.equal(m.display, 'standalone');
    assert.ok(m.icons.some(i => i.purpose === 'maskable') && m.icons.some(i => i.sizes === '512x512'));
    assert.match((await request(port, '/sw.js')).type, /javascript/);
    for (const icon of m.icons) assert.equal((await request(port, `/${icon.src}`)).status, 200, icon.src);
  } finally { app.server.close(); store.close(); }
});

test('the service worker never caches money data, and precaches files that exist', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /startsWith\('\/api\/'\)[^\n]*\) return;/, 'requests to /api/ are passed straight through');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  for (const f of shell.filter(f => f !== '/')) assert.doesNotThrow(() => readFileSync(new URL(`../public/${f}`, import.meta.url)), f);
});
