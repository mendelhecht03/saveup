import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { Store, InputError } from './store.mjs';
import { plaidClient, collectUpdates } from './plaid.mjs';
import { fixtureBatch } from './fixtures.mjs';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
export function createApp({ store, client, csrfToken = randomBytes(32).toString('hex') }) {
  let mutationQueue = Promise.resolve();
  const mutate = task => {
    const pending = mutationQueue.then(task, task);
    mutationQueue = pending.catch(() => {});
    return pending;
  };
  const state = () => ({ ...store.state(), configured: client.configured, csrfToken, environment: 'sandbox', localOnly: true });
  async function syncItem(item) {
    if (item.provider === 'fixture') return;
    try {
      const batch = await collectUpdates(client.call, store.open(item.token), item.cursor);
      store.applySync(item.id, batch);
    } catch (error) { store.failItem(item.id, error.code || 'SYNC_FAILED'); throw error; }
  }
  async function exchange(publicToken) {
    if (typeof publicToken !== 'string' || !publicToken.startsWith('public-sandbox-') || publicToken.length > 2048) throw new InputError('A Sandbox public token is required.');
    const exchanged = await client.call('/item/public_token/exchange', { public_token: publicToken });
    if (typeof exchanged.item_id !== 'string' || typeof exchanged.access_token !== 'string') throw new InputError('Invalid Sandbox exchange response.');
    store.addItem({ id: exchanged.item_id, provider: 'plaid', name: 'Plaid Sandbox bank', token: exchanged.access_token });
    // A successful connection survives even if initial transaction sync is not ready.
    try { await syncItem(store.items().find(i => i.id === exchanged.item_id)); } catch { /* Retry from Banks. */ }
  }
  const server = http.createServer(async (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    try {
      const port = server.address().port;
      const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!hosts.has(req.headers.host)) throw new InputError('Use the local SaveUp address.', 403);
      if (req.headers.origin && !new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]).has(req.headers.origin)) throw new InputError('Cross-origin requests are blocked.', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/api/state') return json(200, state());
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        const supplied = Buffer.from(String(req.headers['x-saveup-csrf'] || ''));
        const expected = Buffer.from(csrfToken);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new InputError('Reload the app before saving.', 403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw new InputError('JSON is required.', 415);
        let text = '', size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32768) throw new InputError('Request too large.', 413);
          text += chunk;
        }
        let body;
        try { body = JSON.parse(text || '{}'); } catch { throw new InputError('Invalid JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('A JSON object is required.');
        const result = await mutate(async () => {
          if (url.pathname === '/api/demo/connect') {
            if (!store.items().some(i => i.id === 'sample-bank')) {
              store.addItem({ id: 'sample-bank', provider: 'fixture', name: 'Sample bank · local fixtures', token: 'fixture-only' });
              store.applySync('sample-bank', fixtureBatch());
            }
          } else if (url.pathname === '/api/demo/post') {
            const item = store.items().find(i => i.id === 'sample-bank');
            if (!item) throw new InputError('Load the sample bank first.');
            if (item.cursor !== 'demo-posted') store.applySync(item.id, fixtureBatch(true));
          } else if (url.pathname === '/api/plaid/link-token') {
            const token = await client.call('/link/token/create', { user: { client_user_id: store.userId },
              client_name: 'SaveUp Sandbox MVP', products: ['transactions'], country_codes: ['US'], language: 'en', transactions: { days_requested: 90 } });
            return { linkToken: token.link_token };
          } else if (url.pathname === '/api/plaid/exchange') {
            await exchange(body.publicToken);
          } else if (url.pathname === '/api/plaid/test-item') {
            const token = await client.call('/sandbox/public_token/create', { institution_id: 'ins_109508', initial_products: ['transactions'] });
            await exchange(token.public_token);
          } else if (url.pathname === '/api/sync') {
            for (const item of store.items()) { try { await syncItem(item); } catch { /* Other connections can still sync. */ } }
          } else if (url.pathname === '/api/plaid/refresh') {
            for (const item of store.items().filter(i => i.provider === 'plaid')) {
              try { await client.call('/transactions/refresh', { access_token: store.open(item.token) }); }
              catch (error) { store.failItem(item.id, error.code || 'REFRESH_FAILED'); }
            }
          } else if (url.pathname === '/api/review') {
            if (typeof body.id !== 'string') throw new InputError('Choose a transaction.');
            store.review(body.id, body);
          } else if (url.pathname === '/api/budget') {
            store.saveBudget(body);
          } else throw new InputError('Endpoint not found.', 404);
          return state();
        });
        return json(200, result);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new InputError('Method not allowed.', 405);
      const route = decodeURIComponent(url.pathname);
      const allowed = ['/', '/index.html', '/app.js', '/budget-math.js', '/style.css'].includes(route) || /^\/assets\/[a-z-]+\.svg$/.test(route);
      if (!allowed) throw new InputError('Not found.', 404);
      const filename = path.join(publicRoot, route === '/' ? 'index.html' : route.slice(1));
      let data;
      try { data = await readFile(filename); } catch { throw new InputError('Not found.', 404); }
      res.writeHead(200, { 'Content-Type': types[path.extname(filename)] }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      json(error.status || 500, { error: error instanceof InputError ? error.message : (error.code || 'Something went wrong. Please try again.') });
    }
  });
  return { server, state };
}

export async function start() {
  try { loadEnvFile(fileURLToPath(new URL('./.env.local', import.meta.url))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const dataDir = process.env.SAVEUP_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'share'), 'SaveUp', 'sandbox-mvp');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dataDir, 'token.key');
  try { await writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const store = new Store(path.join(dataDir, 'saveup.sqlite'), await readFile(keyPath));
  const client = plaidClient({ clientId: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET, environment: process.env.PLAID_ENV || 'sandbox' });
  const { server } = createApp({ store, client });
  server.listen(Number(process.env.PORT || 4188), '127.0.0.1', () => console.log(`SaveUp MVP: http://127.0.0.1:${server.address().port} (${client.configured ? 'Plaid Sandbox configured' : 'sample data available; Plaid credentials not configured'})`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => store.close()));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) start().catch(() => { console.error('Could not start SaveUp. Check the local configuration and data-folder access.'); process.exitCode = 1; });
