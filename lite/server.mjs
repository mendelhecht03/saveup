import http from 'node:http';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { loadEnvFile } from 'node:process';
import * as L from './public/logic.mjs';
import { plaidClient, collectUpdates } from './plaid.mjs';
import { BANK_NAME, publicTokenRequest } from './sandbox/banks.mjs';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
const wait = ms => new Promise(r => setTimeout(r, ms));

// Plain JSON file outside the repo and OneDrive. Writes go to a temp file first
// so a crash mid-write cannot corrupt the saved data.
export function fileStore(file) {
  return {
    async load() {
      try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return L.newState(); throw e; }
    },
    async save(state) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(state));
      await rename(`${file}.tmp`, file);
    }
  };
}

// Never send access tokens or sync cursors to the browser.
const publicState = s => ({ ...s, items: s.items.map(({ id, name, lastSync, error }) => ({ id, name, lastSync, error })) });

export async function createApp({ client, store, csrf = randomBytes(24).toString('hex'), pollDelay = 2500 }) {
  const state = await store.load();
  let queue = Promise.resolve();
  const mutate = task => { const run = queue.then(task); queue = run.catch(() => {}); return run; };

  async function sync(item, { untilFound } = {}) {
    // Sandbox data can take a few seconds to appear, so poll briefly when we expect something new.
    for (let tries = 0; tries < (untilFound ? 8 : 1); tries++) {
      if (tries) await wait(pollDelay);
      try {
        const batch = await collectUpdates(client.call, item.token, item.cursor);
        L.applySync(state, item.id, batch);
        Object.assign(item, { cursor: batch.cursor, lastSync: new Date().toISOString(), error: null });
        if (!untilFound || untilFound(batch)) return;
      } catch (error) { item.error = error.message; throw error; }
    }
  }
  async function addItem(publicToken, name) {
    const ex = await client.call('/item/public_token/exchange', { public_token: publicToken });
    const item = { id: ex.item_id, name: String(name || 'Sandbox bank').slice(0, 80), token: ex.access_token, cursor: '', lastSync: null, error: null };
    state.items.push(item);
    await store.save(state);
    try { await sync(item, { untilFound: b => b.added.length > 0 }); } catch { /* shown on the Banks tab; retry with Sync */ }
  }
  const findItem = id => state.items.find(i => i.id === id) || (() => { throw new L.InputError('Bank not found.', 404); })();

  const routes = {
    '/api/link-token': async () => {
      const r = await client.call('/link/token/create', { user: { client_user_id: 'saveup-lite-owner' }, client_name: 'SaveUp', products: ['transactions'], country_codes: ['US'], language: 'en' });
      return { linkToken: r.link_token };
    },
    '/api/exchange': async b => {
      if (typeof b.publicToken !== 'string' || !b.publicToken.startsWith('public-sandbox-')) throw new L.InputError('A Sandbox public token is required.');
      await addItem(b.publicToken, b.institution);
    },
    // Skips the Link screens. The "dynamic" test user is the one Plaid lets us add custom charges to.
    '/api/sandbox/instant': async () => {
      const r = await client.call('/sandbox/public_token/create', { institution_id: 'ins_109508', initial_products: ['transactions'], options: { override_username: 'user_transactions_dynamic', override_password: 'pass_good' } });
      await addItem(r.public_token, 'First Platypus Bank (test)');
    },
    // The SaveUp Test Bank: a custom Sandbox user with every edge case (see sandbox/banks.mjs).
    // fresh: true removes earlier test banks first; banks added through Link stay.
    '/api/sandbox/seed': async b => {
      if (b.fresh) for (const item of state.items.filter(i => i.name === BANK_NAME)) {
        await client.call('/item/remove', { access_token: item.token }).catch(() => {});
        L.removeItem(state, item.id);
      }
      const r = await client.call('/sandbox/public_token/create', publicTokenRequest(L.todayISO()));
      await addItem(r.public_token, BANK_NAME);
      // Plaid sends the last 30 days first and the older history a few seconds later.
      await sync(state.items.at(-1), { untilFound: batch => batch.status === 'HISTORICAL_UPDATE_COMPLETE' }).catch(() => {});
    },
    '/api/sandbox/charge': async b => {
      const item = findItem(b.itemId);
      const description = typeof b.description === 'string' ? b.description.trim().slice(0, 60) : '';
      if (!description) throw new L.InputError('Add a description.');
      if (!Number.isSafeInteger(b.amountCents) || b.amountCents === 0 || Math.abs(b.amountCents) > 1_000_000) throw new L.InputError('Enter an amount up to $10,000.');
      const daysAgo = Number.isInteger(b.daysAgo) && b.daysAgo >= 0 && b.daysAgo <= 13 ? b.daysAgo : 0;
      const date = L.addDays(L.todayISO(), -daysAgo);
      await client.call('/sandbox/transactions/create', { access_token: item.token, transactions: [{ amount: b.amountCents / 100, date_transacted: date, date_posted: date, description, iso_currency_code: 'USD' }] });
      // Refresh only speeds things up; Sandbox sometimes rejects it even when the charge was created.
      await client.call('/transactions/refresh', { access_token: item.token }).catch(() => {});
      await sync(item, { untilFound: batch => batch.added.some(t => t.name === description || t.merchant_name === description) });
    },
    '/api/sync': async b => {
      const items = b.itemId ? [findItem(b.itemId)] : state.items;
      const failed = [];
      for (const item of items) await sync(item).catch(() => failed.push(item.name));
      if (failed.length) throw new L.InputError(`Could not sync ${failed.join(', ')}.`, 502);
    },
    '/api/items/remove': async b => {
      const item = findItem(b.itemId);
      await client.call('/item/remove', { access_token: item.token }).catch(() => {});
      L.removeItem(state, item.id);
    },
    '/api/txn/confirm': b => { L.confirmTxn(state, b); },
    '/api/txn/unreview': b => { L.unreviewTxn(state, b); },
    '/api/txn/manual': b => { L.addManual(state, b, randomUUID()); },
    '/api/txn/delete': b => { L.deleteTxn(state, b); },
    '/api/category/save': b => { L.saveCategory(state, b, randomUUID()); },
    '/api/category/delete': b => { L.deleteCategory(state, b); },
    '/api/plan/save': b => { L.savePlan(state, b, randomUUID()); },
    '/api/plan/delete': b => { L.deletePlan(state, b); }
  };

  const server = http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const port = server.address().port;
      const local = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!local.includes(req.headers.host)) throw new L.InputError('Use the local address.', 403);
      if (req.headers.origin && !local.some(h => req.headers.origin === `http://${h}`)) throw new L.InputError('Cross-origin requests are blocked.', 403);
      const url = new URL(req.url, 'http://local');
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, { state: publicState(state), csrf, configured: client.configured });
      if (req.method === 'POST' && routes[url.pathname]) {
        const supplied = Buffer.from(String(req.headers['x-saveup-csrf'] || ''));
        if (supplied.length !== csrf.length || !timingSafeEqual(supplied, Buffer.from(csrf))) throw new L.InputError('Reload the app and try again.', 403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw new L.InputError('JSON is required.', 415);
        let raw = '';
        for await (const chunk of req) { raw += chunk; if (raw.length > 16384) throw new L.InputError('Request too large.', 413); }
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { throw new L.InputError('Invalid JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new L.InputError('Invalid request.');
        const result = await mutate(async () => {
          try { return await routes[url.pathname](body); } finally { await store.save(state); }
        });
        return send(200, { ...(result || {}), state: publicState(state) });
      }
      if (req.method !== 'GET') throw new L.InputError('Not found.', 404);
      const file = path.join(publicRoot, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(publicRoot) || !types[path.extname(file)]) throw new L.InputError('Not found.', 404);
      const body = await readFile(file).catch(() => { throw new L.InputError('Not found.', 404); });
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] });
      res.end(body);
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error(error);
      send(status, { error: status === 500 ? 'Something went wrong.' : error.message, state: publicState(state) });
    }
  });

  // Background refresh: sync anything not synced in the last 20 hours, checked every 3 hours.
  const refreshStale = () => mutate(async () => {
    for (const item of state.items) {
      if (!item.lastSync || Date.now() - Date.parse(item.lastSync) > 20 * 3600e3) await sync(item).catch(() => {});
    }
    await store.save(state);
  });
  return { server, state, refreshStale };
}

async function start() {
  try { loadEnvFile(fileURLToPath(new URL('./.env.local', import.meta.url))); } catch { /* keys optional until connecting */ }
  if ((process.env.PLAID_ENV || 'sandbox') !== 'sandbox') throw new Error('SaveUp Lite only runs against Plaid Sandbox.');
  const dataFile = process.env.SAVEUP_LITE_DATA || path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'share'), 'SaveUp', 'lite-sandbox', 'state.json');
  const port = Number(process.env.LITE_PORT || 4193);
  const app = await createApp({ client: plaidClient({ clientId: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET }), store: fileStore(dataFile) });
  app.server.listen(port, '127.0.0.1', () => console.log(`SaveUp Lite (Plaid Sandbox) at http://127.0.0.1:${port}`));
  app.refreshStale();
  setInterval(app.refreshStale, 3 * 3600e3).unref();
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) start().catch(e => { console.error(e.message); process.exitCode = 1; });
