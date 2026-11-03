import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Store } from '../store.mjs';
import { fixtureBatch } from '../fixtures.mjs';
import { plaidClient } from '../plaid.mjs';
import { createApp } from '../server.mjs';
import { budgetTotals, splitByCategory } from '../public/budget-math.js';

const week = { start: '2026-11-01', end: '2026-11-07' };
function sampleStore(t) {
  const store = new Store(':memory:', randomBytes(32)); t.after(() => store.close());
  store.addItem({ id: 'sample-bank', provider: 'fixture', name: 'Sample bank', token: 'fixture-secret' });
  store.applySync('sample-bank', fixtureBatch());
  return store;
}
const budgets = store => {
  const state = store.state();
  return Object.fromEntries(budgetTotals(state.transactions, state.budgets, week, state.receipts).categories.map(b => [b.name, b]));
};
// A Target purchase entered by hand: shampoo to Personal Care, chocolate to the purchase's own budget.
const entry = (more = {}) => ({ merchant: 'Target', date: '2026-11-03', taxCents: 90, tipCents: 0, totalCents: 1100,
  items: [{ name: 'Shampoo', amountCents: 800, category: 'Personal Care' }, { name: 'Chocolate', amountCents: 210 }], ...more });

test('splitting by category always adds up to the exact amount', () => {
  const items = [{ amountCents: 1, category: 'A' }, { amountCents: 1, category: 'B' }, { amountCents: 1, category: 'C' }];
  const parts = splitByCategory(100, items);
  assert.equal(parts.reduce((sum, p) => sum + p.amount, 0), 100);
  assert.deepEqual(parts.map(p => p.amount).sort(), [33, 33, 34]);
  assert.deepEqual(splitByCategory(1100, [{ amountCents: 800, category: 'Personal Care' }, { amountCents: 210, category: '' }], 'Essentials'), [{ category: 'Personal Care', amount: 871 }, { category: 'Essentials', amount: 229 }]);
  assert.deepEqual(splitByCategory(500, [{ amountCents: 500, category: '' }], 'Essentials'), [{ category: 'Essentials', amount: 500 }]);
});

test('a manual purchase with per-item budgets counts in each budget, and a discount cannot push a budget below zero', t => {
  const store = sampleStore(t);
  store.saveReceipt({ receipt: entry(), category: 'Essentials', watch: false });
  const totals = budgets(store);
  assert.deepEqual([totals['Personal Care'].posted, totals.Essentials.posted], [871, 229]);
  assert.equal(totals['Personal Care'].transactions[0].total, 1100);
  assert.throws(() => store.saveReceipt({ receipt: entry({ items: [{ name: 'Shampoo', amountCents: 800, category: 'Personal Care' }, { name: 'Coupon', amountCents: -900, category: 'Essentials' }, { name: 'Gum', amountCents: 1110 }], totalCents: 1100 }), category: 'Essentials', watch: false }), /discount/);
  assert.throws(() => store.saveReceipt({ receipt: entry({ items: [{ name: 'Shampoo', amountCents: 1010, category: 'Groceries?' }] }), category: 'Essentials', watch: false }), /category/);
});

test('editing a manual purchase changes it in place and can turn watching off; matched ones are locked', t => {
  const store = sampleStore(t);
  const id = store.saveReceipt({ receipt: entry(), category: 'Essentials', watch: true });
  assert.equal(budgets(store)['Personal Care'].unverified, 871);
  store.saveReceipt({ id, receipt: entry({ merchant: 'Corner store', items: [{ name: 'Shampoo', amountCents: 1010 }] }), category: 'Essentials', watch: false });
  const [saved] = store.state().receipts;
  assert.deepEqual([store.state().receipts.length, saved.status, saved.merchant], [1, 'cash', 'Corner store']);
  assert.deepEqual([budgets(store).Essentials.posted, budgets(store)['Personal Care'].spent], [1100, 0]);
  assert.throws(() => store.saveReceipt({ id: 'missing', receipt: entry(), category: 'Essentials', watch: true }), /not found/);
});

test('matching a watched manual purchase moves its per-item split onto the bank charge, counted once', t => {
  const store = sampleStore(t);
  const id = store.saveReceipt({ receipt: entry(), category: 'Essentials', watch: true });
  const charge = store.state().transactions.find(t => t.externalId === 'demo-target');
  assert.equal(store.state().receipts[0].matches[0].account, 'Sample Visa · 4821');
  store.review(charge.id, { revision: charge.revision, category: 'Essentials', description: '', note: '', priority: '4', receipt: { ...entry(), id } });
  const totals = budgets(store);
  assert.deepEqual([totals['Personal Care'].posted, totals.Essentials.posted, totals.Essentials.unverified], [871, 229, 0]);
  assert.equal(store.state().transactions.find(t => t.id === charge.id).priority, 4);
  const kahan = store.state().transactions.find(t => t.externalId === 'demo-kahan');
  assert.throws(() => store.review(kahan.id, { revision: kahan.revision, category: 'Essentials', description: '', note: '', priority: 9 }), /Priority/);
  assert.throws(() => store.saveReceipt({ id, receipt: entry(), category: 'Essentials', watch: true }), /matched/);
});

test('HTTP check finds the bank charge already in the inbox before a manual purchase is saved', async t => {
  const store = sampleStore(t);
  const { server } = createApp({ store, client: plaidClient({}), reader: { configured: false } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { csrfToken } = await (await fetch(base + '/api/state')).json();
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': csrfToken }, body: JSON.stringify(body) });
  const found = await (await post('/api/receipts/check', { receipt: entry() })).json();
  assert.equal(found.transactions[0].name, 'Target');
  assert.equal((await post('/api/receipts/check', { receipt: entry({ totalCents: 5 }) })).status, 400);
  const saved = await (await post('/api/receipts/save', { receipt: entry(), category: 'Essentials', watch: false })).json();
  assert.equal(saved.receipts[0].status, 'cash');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n, 7);
});
