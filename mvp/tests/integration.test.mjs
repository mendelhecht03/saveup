import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store, cents } from '../store.mjs';
import { fixtureBatch } from '../fixtures.mjs';
import { plaidClient, collectUpdates, PlaidError } from '../plaid.mjs';
import { createApp } from '../server.mjs';
import { budgetTotals, isFullWeek } from '../public/budget-math.js';

function sampleStore(t, filename = ':memory:', key = randomBytes(32)) {
  const store = new Store(filename, key); t.after(() => store.close());
  store.addItem({ id: 'sample-bank', provider: 'fixture', name: 'Sample bank', token: 'fixture-secret' });
  store.applySync('sample-bank', fixtureBatch());
  return store;
}
function reviewDraft(t, more = {}) { return { revision: t.revision, category: 'Essentials', description: 'My description', note: 'Keep my note', ...more }; }

test('amounts use exact cents; unsupported precision and non-finite values are rejected', () => {
  assert.equal(cents(0.29), 29); assert.equal(cents(-12.53), -1253);
  for (const bad of [NaN, Infinity, '12.00', 1.001]) assert.throws(() => cents(bad));
});
test('weekly budgets validate limits, preserve canonical names, and support custom categories in reviews', t => {
  const store = sampleStore(t);
  for (const limitCents of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => store.saveBudget({ name: 'Groceries', description: 'Food', limitCents }));
  assert.throws(() => store.saveBudget({ name: 'Groceries', limitCents: 2500 }), /Describe/);
  store.saveBudget({ name: 'Groceries', limitCents: 2500, description: 'Food and household basics' });
  store.saveBudget({ name: 'groceries', limitCents: 3000 });
  assert.equal(store.state().budgets.filter(b => b.name.toLowerCase() === 'groceries').length, 1);
  assert.equal(store.state().budgets.find(b => b.name === 'Groceries').limitCents, 3000);
  const row = store.state().transactions.find(t => t.externalId === 'demo-kahan');
  store.review(row.id, reviewDraft(row, { category: 'groceries' }));
  assert.equal(store.state().transactions.find(t => t.id === row.id).category, 'Groceries');
});
test('budgets include confirmed pending amounts, keep overages above 100%, and exclude unresolved or neutral transfers', t => {
  const store = sampleStore(t);
  store.saveBudget({ name: 'Essentials', limitCents: 2500 });
  let state = store.state();
  for (const externalId of ['demo-kahan', 'demo-groceries-pending']) {
    const row = state.transactions.find(t => t.externalId === externalId); store.review(row.id, reviewDraft(row));
  }
  const own = state.transactions.find(t => t.externalId === 'demo-savings');
  store.review(own.id, reviewDraft(own, { classification: 'own' }));
  state = store.state();
  const range = { start: '2026-11-01', end: '2026-11-07' };
  let totals = budgetTotals(state.transactions, state.budgets, range);
  let essentials = totals.categories.find(b => b.name === 'Essentials');
  assert.deepEqual([essentials.posted, essentials.pending, essentials.spent, essentials.remaining], [253, 3000, 3253, -753]);
  assert.ok(Math.abs(essentials.percent - 130.12) < 0.00001);
  assert.equal(totals.income, 0); assert.equal(totals.spent, 3253);
  store.applySync('sample-bank', fixtureBatch(true));
  state = store.state(); totals = budgetTotals(state.transactions, state.budgets, range);
  assert.equal(totals.spent, 253); assert.equal(totals.pending, 0);
  const changed = state.transactions.find(t => t.externalId === 'demo-groceries-posted'); store.review(changed.id, reviewDraft(changed));
  state = store.state(); totals = budgetTotals(state.transactions, state.budgets, range);
  assert.equal(totals.spent, 3453);
  essentials = totals.categories.find(b => b.name === 'Essentials'); assert.equal(essentials.remaining, -953);
  assert.equal(budgetTotals(state.transactions, state.budgets, { start: '2026-11-01', end: '2026-11-02' }).spent, 0);
});
test('weekly comparisons only apply to a full Sunday–Saturday week, including across a month boundary', () => {
  assert.equal(isFullWeek({ start: '2026-11-01', end: '2026-11-07' }), true);
  assert.equal(isFullWeek({ start: '2026-10-25', end: '2026-10-31' }), true);
  assert.equal(isFullWeek({ start: '2026-11-02', end: '2026-11-08' }), false);
  assert.equal(isFullWeek({ start: '2026-11-01', end: '2026-11-14' }), false);
  assert.equal(isFullWeek({ start: '', end: '' }), false);
});
test('posting preserves identity and notes, reopens review for a changed amount, and never duplicates spending', t => {
  const store = sampleStore(t);
  const original = store.state().transactions.find(t => t.externalId === 'demo-groceries-pending');
  store.review(original.id, reviewDraft(original));
  store.applySync('sample-bank', fixtureBatch(true));
  const rows = store.state().transactions;
  const posted = rows.find(t => t.externalId === 'demo-groceries-posted');
  assert.equal(rows.length, 7); assert.equal(posted.id, original.id);
  assert.equal(posted.amount, 3200); assert.equal(posted.status, 'posted');
  assert.equal(posted.reviewed, false); assert.equal(posted.changed, true); assert.equal(posted.note, 'Keep my note');
  store.applySync('sample-bank', fixtureBatch(true));
  assert.equal(store.state().transactions.length, 7);
});
test('unchanged pending-to-posted replacement retains confirmed review, even across separate sync batches', t => {
  const store = sampleStore(t), original = store.state().transactions.find(t => t.status === 'pending');
  store.review(original.id, reviewDraft(original));
  const update = fixtureBatch(true); update.added[0].amount = 30;
  store.applySync('sample-bank', { ...update, added: [], cursor: 'removed-first' });
  store.applySync('sample-bank', { ...update, removed: [] });
  const posted = store.state().transactions.find(t => t.id === original.id);
  assert.equal(posted.reviewed, true); assert.equal(posted.note, 'Keep my note');
});
test('transfers and inflows require an explicit purpose, with valid direction and categories', t => {
  const store = sampleStore(t), rows = store.state().transactions;
  const incoming = rows.find(t => t.externalId === 'demo-zelle'), outgoing = rows.find(t => t.externalId === 'demo-savings');
  assert.equal(incoming.reviewed, undefined);
  assert.throws(() => store.review(incoming.id, reviewDraft(incoming)), /purpose/);
  assert.throws(() => store.review(incoming.id, reviewDraft(incoming, { classification: 'expense' })), /Incoming/);
  assert.throws(() => store.review(outgoing.id, reviewDraft(outgoing, { classification: 'income' })), /Outgoing/);
  store.review(outgoing.id, reviewDraft(outgoing, { classification: 'own' }));
  assert.equal(store.state().transactions.find(t => t.id === outgoing.id).category, '');
});
test('stale reviews cannot overwrite updated bank facts or a more recent review', t => {
  const store = sampleStore(t), row = store.state().transactions[0];
  const draft = reviewDraft(row, { classification: row.kind === 'transfer' ? 'own' : '' });
  store.review(row.id, draft);
  assert.throws(() => store.review(row.id, draft), e => e.status === 409);
});
test('invalid sync batches do not change rows or the committed cursor', t => {
  const store = sampleStore(t), before = store.state(), cursor = store.items()[0].cursor;
  const bad = fixtureBatch(true); bad.added.push({ ...bad.added[0], transaction_id: 'bad', amount: 1.001 });
  assert.throws(() => store.applySync('sample-bank', bad));
  assert.deepEqual(store.state(), before); assert.equal(store.items()[0].cursor, cursor);
});
test('SQL failures roll back earlier row changes and the cursor together', t => {
  const store = sampleStore(t), before = store.state(), cursor = store.items()[0].cursor;
  store.db.exec("CREATE TRIGGER prevent_update BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  assert.throws(() => store.applySync('sample-bank', fixtureBatch(true)), /injected failure/);
  assert.deepEqual(store.state(), before); assert.equal(store.items()[0].cursor, cursor);
});
test('paginated sync restarts from the original cursor after mutation and discards partial results', async () => {
  const calls = []; let attempt = 0;
  const call = async (route, payload) => {
    calls.push(payload.cursor);
    if (calls.length === 2) throw new PlaidError('TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION');
    attempt++;
    return { added: [{ transaction_id: String(attempt) }], modified: [], removed: [], accounts: [], next_cursor: payload.cursor === 'original' ? 'next' : 'final', has_more: payload.cursor === 'original' };
  };
  const result = await collectUpdates(call, 'access-sandbox-example', 'original');
  assert.deepEqual(calls, ['original', 'next', 'original', 'next']);
  assert.deepEqual(result.added.map(t => t.transaction_id), ['2', '3']); assert.equal(result.cursor, 'final');
});
test('failed later pages never return a partial import', async () => {
  let n = 0;
  await assert.rejects(collectUpdates(async () => {
    if (n++) throw new PlaidError('ITEM_LOGIN_REQUIRED');
    return { added: [{ transaction_id: 'not-committed' }], modified: [], removed: [], accounts: [], next_cursor: 'next', has_more: true };
  }, 'token'), /ITEM_LOGIN_REQUIRED/);
});
test('only the fixed Sandbox and Production hosts are reachable', async () => {
  for (const environment of ['development', 'https://evil.example', '__proto__']) assert.throws(() => plaidClient({ environment }), /sandbox or production/);
  let sentUrl;
  const client = plaidClient({ clientId: 'id', secret: 'secret', environment: 'production', fetchImpl: async url => { sentUrl = url; return new Response('{}', { status: 200 }); } });
  await client.call('/transactions/sync', {});
  assert.equal(sentUrl, 'https://production.plaid.com/transactions/sync'); assert.equal(client.environment, 'production');
  await assert.rejects(plaidClient({ environment: 'production' }).call('/link/token/create', {}), /PRODUCTION_CREDENTIALS_MISSING/);
});
test('a data folder keeps one environment; real and test records never mix', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'saveup-env-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const key = randomBytes(32), sandboxFile = path.join(folder, 'sandbox.sqlite'), liveFile = path.join(folder, 'live.sqlite');
  new Store(sandboxFile, key).close();
  assert.throws(() => new Store(sandboxFile, key, 'production'), /holds sandbox data/);
  const live = new Store(liveFile, key, 'production');
  assert.throws(() => live.addItem({ id: 'sample-bank', provider: 'fixture', name: 'Sample', token: 'fixture-only' }), /only available in Sandbox/);
  assert.throws(() => live.addItem({ id: 'x', provider: 'plaid', name: 'Bank', token: 'access-sandbox-x' }), /production access tokens/);
  live.addItem({ id: 'real', provider: 'plaid', name: 'Bank', token: 'access-production-x' }); live.close();
  assert.throws(() => new Store(liveFile, key), /holds production data/);
  // A folder from before the label existed already holds Sandbox banks, so it stays Sandbox.
  const legacyFile = path.join(folder, 'legacy.sqlite'), legacy = new Store(legacyFile, key);
  legacy.addItem({ id: 'old', provider: 'plaid', name: 'Old', token: 'access-sandbox-old' });
  legacy.db.prepare("DELETE FROM settings WHERE key='environment'").run(); legacy.close();
  assert.throws(() => new Store(legacyFile, key, 'production'), /holds sandbox data/);
});
test('Production mode blocks test actions, names the bank, and accepts only production tokens', async t => {
  const store = new Store(':memory:', randomBytes(32), 'production');
  const calls = [], client = { configured: true, environment: 'production', call: async route => {
    calls.push(route);
    if (route === '/item/public_token/exchange') return { item_id: 'live-item', access_token: 'access-production-secret' };
    if (route === '/transactions/sync') return { ...fixtureBatch(), next_cursor: 'live-ready', has_more: false };
    throw new Error('Unexpected test endpoint');
  } };
  assert.throws(() => createApp({ store, client: { ...client, environment: 'sandbox' } }), /do not match/);
  const { server } = createApp({ store, client }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.environment, 'production');
  const post = (route, body = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': state.csrfToken }, body: JSON.stringify(body) });
  for (const route of ['/api/demo/connect', '/api/demo/post', '/api/plaid/test-item', '/api/plaid/refresh']) assert.equal((await post(route)).status, 404, route);
  assert.equal((await post('/api/plaid/exchange', { publicToken: 'public-sandbox-x' })).status, 400);
  const response = await post('/api/plaid/exchange', { publicToken: 'public-production-x', institutionName: 'Chase' });
  const text = await response.text();
  assert.equal(response.status, 200); assert.equal(text.includes('access-production-secret'), false);
  assert.equal(JSON.parse(text).items[0].name, 'Chase');
  assert.deepEqual(calls, ['/item/public_token/exchange', '/transactions/sync']);
});
test('Sandbox is enforced and credentials remain in server request headers', async () => {
  let sent;
  const client = plaidClient({ clientId: 'test-id', secret: 'test-secret', fetchImpl: async (url, options) => {
    sent = { url, options }; return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } });
  await client.call('/transactions/sync', { access_token: 'access-sandbox-example' });
  assert.equal(sent.url, 'https://sandbox.plaid.com/transactions/sync');
  assert.equal(sent.options.headers['PLAID-SECRET'], 'test-secret');
  assert.equal(sent.options.redirect, 'error');
});
test('SQLite persists reviews across restarts; stored access tokens are encrypted and not in browser state', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'saveup-mvp-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'test.sqlite'), key = randomBytes(32);
  let store = new Store(filename, key);
  store.addItem({ id: 'sample-bank', provider: 'fixture', name: 'Sample bank', token: 'fixture-secret' });
  store.applySync('sample-bank', fixtureBatch());
  const row = store.state().transactions.find(t => t.kind === 'purchase'); store.review(row.id, reviewDraft(row));
  store.saveBudget({ name: 'Essentials', limitCents: 2500 });
  assert.equal(store.items()[0].token.includes('fixture-secret'), false);
  assert.equal(JSON.stringify(store.state()).includes('fixture-secret'), false);
  store.close();
  store = new Store(filename, key);
  assert.equal(store.state().transactions.find(t => t.id === row.id).note, 'Keep my note');
  assert.equal(store.state().budgets.find(b => b.name === 'Essentials').limitCents, 2500);
  assert.equal(store.open(store.items()[0].token), 'fixture-secret'); store.close();
});
test('local HTTP flow imports, reviews, posts, blocks cross-origin writes, and never serves configuration', async t => {
  const store = new Store(':memory:', randomBytes(32));
  const client = plaidClient({});
  const { server } = createApp({ store, client });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let state = await (await fetch(base + '/api/state')).json();
  const headers = { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': state.csrfToken };
  const post = (route, body = {}) => fetch(base + route, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await fetch(base + '/api/demo/connect', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/demo/connect', { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body: '{}' })).status, 403);
  state = await (await post('/api/demo/connect')).json(); assert.equal(state.transactions.length, 7);
  const budgetResponse = await post('/api/budget', { name: 'Groceries', description: 'Weekly food', limitCents: 2500 });
  assert.equal(budgetResponse.status, 200); assert.ok((await budgetResponse.json()).categories.includes('Groceries'));
  assert.equal((await post('/api/budget', { name: 'Groceries', limitCents: -1 })).status, 400);
  const pending = state.transactions.find(t => t.status === 'pending');
  assert.equal((await post('/api/review', { id: pending.id, ...reviewDraft(pending) })).status, 200);
  state = await (await post('/api/demo/post')).json();
  assert.equal(state.transactions.find(t => t.id === pending.id).reviewed, false);
  for (const route of ['/server.mjs', '/.env.local', '/store.mjs', '/../../package.json', '/assets/not-a-file.svg']) assert.equal((await fetch(base + route)).status, 404, route);
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await post('/api/plaid/link-token')).status, 503);
});
test('test-bank creation exchanges Sandbox tokens, syncs, and keeps secrets off the wire to the browser', async t => {
  const store = new Store(':memory:', randomBytes(32));
  const calls = [], client = { configured: true, call: async (route, body) => {
    calls.push(route);
    if (route === '/sandbox/public_token/create') return { public_token: 'public-sandbox-test' };
    if (route === '/item/public_token/exchange') return { item_id: 'sandbox-item', access_token: 'access-sandbox-secret' };
    if (route === '/transactions/sync') return { ...fixtureBatch(), next_cursor: 'sandbox-ready', has_more: false };
    throw new Error('Unexpected test endpoint');
  } };
  const { server } = createApp({ store, client }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(base + '/api/state')).json();
  const response = await fetch(base + '/api/plaid/test-item', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': state.csrfToken }, body: '{}' });
  const text = await response.text();
  assert.equal(response.status, 200); assert.equal(text.includes('access-sandbox-secret'), false);
  assert.equal(JSON.parse(text).transactions.length, 7);
  assert.deepEqual(calls, ['/sandbox/public_token/create', '/item/public_token/exchange', '/transactions/sync']);
});
