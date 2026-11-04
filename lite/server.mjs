import http from 'node:http';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { loadEnvFile } from 'node:process';
import * as L from './public/logic.mjs';
import { plaidClient, collectUpdates } from './plaid.mjs';
import { BANK_NAME, publicTokenRequest } from './sandbox/banks.mjs';
import { sqliteStore } from './db.mjs';
import { claudeSuggester, addAiSuggestions } from './ai.mjs';
import { claudeReceiptReader } from './receipts/reader.mjs';
import { veryfiReceiptReader } from './receipts/veryfi.mjs';
import { RECEIPTS } from './sandbox/receipts.mjs';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const sampleRoot = fileURLToPath(new URL('./sandbox/receipts/', import.meta.url));
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE = 8 * 1024 * 1024;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };
const wait = ms => new Promise(r => setTimeout(r, ms));

// Never send access tokens or sync cursors to the browser.
const publicState = s => ({ ...s, items: s.items.map(({ id, name, lastSync, error }) => ({ id, name, lastSync, error })) });

export async function createApp({ client, store, categorize = null, readReceipt = null, readerName = '', receiptDir = null, publicHosts = [], csrf = randomBytes(24).toString('hex'), pollDelay = 2500 }) {
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
        await suggestNew();
        if (!untilFound || untilFound(batch)) return;
      } catch (error) { item.error = error.message; throw error; }
    }
  }
  // AI suggestions are a bonus: if the API is down or there is no key, sync still works.
  async function suggestNew() {
    try { await addAiSuggestions(state, categorize); } catch (e) { console.warn(`AI suggestions skipped: ${e.message}`); }
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
    // A sample "digital receipt" from the test bank, so receipts can be tried without a photo or an API key.
    '/api/receipt/digital': b => {
      const sample = RECEIPTS.find(r => r.id === b.sampleId) || (() => { throw new L.InputError('Pick a sample receipt.'); })();
      const byName = name => state.categories.find(c => c.name.toLowerCase() === name)?.id || null;
      const r = L.addReceipt(state, {
        source: 'digital', txnId: b.txnId || null, merchant: sample.merchant, date: L.addDays(L.todayISO(), sample.day), time: sample.time,
        method: sample.payment.method, last4: sample.payment.last4, taxCents: sample.taxCents, totalCents: sample.totalCents,
        lines: sample.items.map(i => ({ code: i.code, name: i.code, amountCents: i.amountCents, categoryId: byName(i.category), unsure: !byName(i.category) })),
        image: { sample: sample.id, mediaType: 'image/png' }
      }, randomUUID());
      return { receiptId: r.id };
    },
    '/api/receipt/manual': b => {
      const t = b.txnId ? state.txns.find(x => x.id === b.txnId) : null;
      const r = L.addReceipt(state, { source: 'manual', txnId: t?.id || null, merchant: t?.name || '', date: t?.date || L.todayISO(), totalCents: t?.amountCents || 0, method: 'card' }, randomUUID());
      return { receiptId: r.id };
    },
    '/api/receipt/save': b => { L.saveReceipt(state, b); },
    '/api/receipt/difference': b => { L.addDifferenceLine(state, b); },
    '/api/receipt/attach': b => { L.attachReceipt(state, b); },
    '/api/receipt/confirm': b => ({ txnId: L.confirmReceipt(state, b, randomUUID()).id }),
    '/api/receipt/delete': async b => {
      const r = L.findReceipt(state, b.id);
      L.deleteReceipt(state, b);
      if (r.image?.file && receiptDir) await unlink(path.join(receiptDir, r.image.file)).catch(() => {});
    },
    '/api/match/link': b => { L.linkPurchase(state, b); },
    '/api/match/reject': b => { L.rejectMatch(state, b); },
    '/api/ai/suggest': async () => { if (!categorize) throw new L.InputError('Add ANTHROPIC_API_KEY to lite/.env.local to turn on AI suggestions.'); await addAiSuggestions(state, categorize); },
    '/api/txn/unreview': b => { L.unreviewTxn(state, b); },
    '/api/txn/manual': b => { L.addManual(state, b, randomUUID()); },
    '/api/txn/delete': b => { L.deleteTxn(state, b); },
    '/api/category/save': b => { L.saveCategory(state, b, randomUUID()); },
    '/api/category/delete': b => { L.deleteCategory(state, b); },
    '/api/plan/save': b => { L.savePlan(state, b, randomUUID()); },
    '/api/plan/delete': b => { L.deletePlan(state, b); }
  };

  const checkCsrf = req => {
    const supplied = Buffer.from(String(req.headers['x-saveup-csrf'] || ''));
    if (supplied.length !== csrf.length || !timingSafeEqual(supplied, Buffer.from(csrf))) throw new L.InputError('Reload the app and try again.', 403);
  };
  const server = http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const port = server.address().port;
      // Loopback only, plus the private Tailscale address for the phone app (npm run phone:app).
      const local = [`127.0.0.1:${port}`, `localhost:${port}`];
      const origins = [...local.map(h => `http://${h}`), ...publicHosts.map(h => `https://${h}`)];
      if (!local.includes(req.headers.host) && !publicHosts.includes(req.headers.host)) throw new L.InputError('Use the local address.', 403);
      if (req.headers.origin && !origins.includes(req.headers.origin)) throw new L.InputError('Cross-origin requests are blocked.', 403);
      const url = new URL(req.url, 'http://local');
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, { state: publicState(state), csrf, configured: client.configured, ai: Boolean(categorize), reader: Boolean(readReceipt), readerName,
        samples: RECEIPTS.map(r => ({ id: r.id, merchant: r.merchant, totalCents: r.totalCents })) });
      if (req.method === 'GET' && url.pathname === '/api/receipt/image') {
        const r = L.findReceipt(state, url.searchParams.get('id'));
        const file = r.image?.sample ? path.join(sampleRoot, `${r.image.sample}.png`) : r.image?.file && receiptDir ? path.join(receiptDir, r.image.file) : null;
        const body = file && await readFile(file).catch(() => null);
        if (!body) throw new L.InputError('No photo for this receipt.', 404);
        res.writeHead(200, { 'Content-Type': r.image.mediaType || 'image/png' });
        return res.end(body);
      }
      // A receipt photo arrives as the raw image body (the browser shrinks it first).
      if (req.method === 'POST' && url.pathname === '/api/receipt/upload') {
        checkCsrf(req);
        const mediaType = String(req.headers['content-type'] || '').split(';')[0];
        if (!IMAGE_TYPES[mediaType]) throw new L.InputError('Use a JPEG, PNG or WebP photo.', 415);
        const chunks = [];
        let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > MAX_IMAGE) throw new L.InputError('That photo is too large.', 413); chunks.push(chunk); }
        const image = Buffer.concat(chunks);
        if (!image.length) throw new L.InputError('The photo was empty.');
        const id = randomUUID(), file = `${id}.${IMAGE_TYPES[mediaType]}`;
        if (receiptDir) { await mkdir(receiptDir, { recursive: true }); await writeFile(path.join(receiptDir, file), image); }
        // Reading takes several seconds, so it happens before taking the data lock.
        let reading = null, note = '';
        if (!readReceipt) note = 'Reading receipts needs ANTHROPIC_API_KEY in lite/.env.local. You can type the items instead.';
        else {
          try { reading = await readReceipt({ imageBase64: image.toString('base64'), mediaType, categories: state.categories.map(({ id, name, description }) => ({ id, name, description })) }); }
          catch (e) { console.warn(`Receipt reading failed: ${e.message}`); note = 'This receipt couldn\u2019t be read. You can type the items instead.'; }
        }
        const txnId = url.searchParams.get('txnId') || null;
        const r = await mutate(async () => {
          try {
            const r = L.addReceipt(state, { ...(reading || {}), source: 'scan', txnId, image: { file, mediaType } }, id);
            const t = !reading && txnId && state.txns.find(x => x.id === txnId);
            if (t) Object.assign(r, { merchant: t.name, date: t.date, totalCents: t.amountCents });
            r.note = note;
            return r;
          } finally { await store.save(state); }
        });
        return send(200, { receiptId: r.id, state: publicState(state) });
      }
      if (req.method === 'POST' && routes[url.pathname]) {
        checkCsrf(req);
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

// Which service reads receipt photos. SAVEUP_RECEIPT_READER=veryfi or claude picks one;
// otherwise Veryfi when its keys are set, else Claude.
export function pickReceiptReader(env) {
  const veryfi = veryfiReceiptReader({ clientId: env.VERYFI_CLIENT_ID, apiKey: env.VERYFI_API_KEY, username: env.VERYFI_USERNAME || undefined });
  const claude = claudeReceiptReader({ apiKey: env.ANTHROPIC_API_KEY, model: env.SAVEUP_RECEIPT_MODEL || undefined });
  const want = String(env.SAVEUP_RECEIPT_READER || '').toLowerCase();
  const chosen = want === 'claude' ? ['Claude', claude] : want === 'veryfi' ? ['Veryfi', veryfi] : veryfi ? ['Veryfi', veryfi] : ['Claude', claude];
  return chosen[1] ? { readReceipt: chosen[1].read, readerName: chosen[0] } : { readReceipt: null, readerName: '' };
}

async function start() {
  try { loadEnvFile(fileURLToPath(new URL('./.env.local', import.meta.url))); } catch { /* keys optional until connecting */ }
  if ((process.env.PLAID_ENV || 'sandbox') !== 'sandbox') throw new Error('SaveUp Lite only runs against Plaid Sandbox.');
  const dataDir = path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'share'), 'SaveUp', 'lite-sandbox');
  const dbFile = process.env.SAVEUP_LITE_DB || path.join(dataDir, 'saveup.sqlite');
  const legacyFile = process.env.SAVEUP_LITE_DATA || path.join(dataDir, 'state.json');
  const port = Number(process.env.LITE_PORT || 4193);
  const app = await createApp({ client: plaidClient({ clientId: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET }), store: sqliteStore(dbFile, { legacyFile }),
    categorize: claudeSuggester({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.SAVEUP_AI_MODEL || undefined }),
    ...pickReceiptReader(process.env),
    receiptDir: path.join(dataDir, 'receipts'),
    publicHosts: String(process.env.SAVEUP_PUBLIC_HOST || '').split(',').map(h => h.trim().toLowerCase()).filter(h => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(h)) });
  app.server.listen(port, '127.0.0.1', () => console.log(`SaveUp Lite (Plaid Sandbox) at http://127.0.0.1:${port}`));
  app.refreshStale();
  setInterval(app.refreshStale, 3 * 3600e3).unref();
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) start().catch(e => { console.error(e.message); process.exitCode = 1; });
