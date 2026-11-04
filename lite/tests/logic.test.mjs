import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.mjs';

const plaidTxn = (id, amount, extra = {}) => ({ transaction_id: id, account_id: 'a1', name: 'Kahans', amount, date: '2026-11-03', pending: false, ...extra });
const withTxns = (...txns) => { const s = L.newState(); L.applySync(s, 'item1', { added: txns }); return s; };
const groceries = 'preset-1';

test('weeks run Sunday to Saturday; months and years use calendar bounds', () => {
  assert.deepEqual(L.weekRange('2026-11-04'), { start: '2026-11-01', end: '2026-11-07' });
  assert.deepEqual(L.weekRange('2026-11-01'), { start: '2026-11-01', end: '2026-11-07' });
  assert.deepEqual(L.periodRange('monthly', '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(L.periodRange('yearly', '2026-02-10'), { start: '2026-01-01', end: '2026-12-31' });
});

test('a suggestion never confirms; confirming counts it and teaches the merchant', () => {
  const s = withTxns(plaidTxn('t1', 2.53));
  L.confirmTxn(s, { id: 't1', categoryId: groceries });
  L.applySync(s, 'item1', { added: [plaidTxn('t2', 2.53)] });
  const t2 = s.txns.find(t => t.id === 't2');
  assert.equal(t2.reviewed, false);
  assert.equal(L.suggest(s, t2).categoryId, groceries);
  assert.equal(L.suggest(s, t2).exact, true);
  const b = L.budgetSummary(s, '2026-11-04').find(c => c.id === groceries);
  assert.equal(b.spent, 253);
});

test('budgets show true overages above 100% and keep pending separate', () => {
  const s = withTxns(plaidTxn('t1', 70), plaidTxn('t2', 12.5, { pending: true }));
  for (const id of ['t1', 't2']) L.confirmTxn(s, { id, categoryId: groceries });
  const b = L.budgetSummary(s, '2026-11-04').find(c => c.id === groceries);
  assert.deepEqual([b.spent, b.pending, b.pct], [7000, 1250, 110]);
});

test('transfers need a purpose; own-account transfers are neutral; direction is enforced', () => {
  const s = withTxns(plaidTxn('z1', 40, { name: 'Zelle payment to Sam' }), plaidTxn('z2', -100, { name: 'Zelle from Mom' }));
  assert.equal(s.txns[0].transfer, true);
  assert.throws(() => L.confirmTxn(s, { id: 'z1', categoryId: groceries }), /transfer/);
  assert.throws(() => L.confirmTxn(s, { id: 'z1', transferKind: 'income' }), /cannot be income/);
  L.confirmTxn(s, { id: 'z1', transferKind: 'own', categoryId: groceries });
  L.confirmTxn(s, { id: 'z2', transferKind: 'income' });
  assert.equal(s.txns[0].categoryId, null);
  assert.equal(L.weekSpending(s, '2026-11-04'), 0);
});

test('pending to posted keeps the review, and a changed amount reopens it without duplicating', () => {
  const s = withTxns(plaidTxn('p1', 20, { pending: true }));
  L.confirmTxn(s, { id: 'p1', categoryId: groceries, note: 'milk' });
  L.applySync(s, 'item1', { added: [plaidTxn('f1', 20, { pending_transaction_id: 'p1' })], removed: [{ transaction_id: 'p1' }] });
  assert.equal(s.txns.length, 1);
  assert.deepEqual([s.txns[0].reviewed, s.txns[0].note, s.txns[0].pending], [true, 'milk', false]);

  const s2 = withTxns(plaidTxn('p1', 20, { pending: true }));
  L.confirmTxn(s2, { id: 'p1', categoryId: groceries, note: 'tip' });
  L.applySync(s2, 'item1', { added: [plaidTxn('f1', 24, { pending_transaction_id: 'p1' })], removed: [{ transaction_id: 'p1' }] });
  assert.deepEqual([s2.txns.length, s2.txns[0].reviewed, s2.txns[0].amountChanged, s2.txns[0].note], [1, false, true, 'tip']);
});

test('a hand-logged card purchase is pending until the exact bank charge arrives, then merges once', () => {
  const s = L.newState();
  L.addManual(s, { merchant: 'Target', amountCents: 1299, date: '2026-11-02', categoryId: groceries, note: 'shampoo', expectMatch: true }, 'm1');
  let b = L.budgetSummary(s, '2026-11-04').find(c => c.id === groceries);
  assert.deepEqual([b.spent, b.pending], [0, 1299]);
  L.applySync(s, 'item1', { added: [plaidTxn('x', 12.98, { name: 'Target' })] });
  assert.equal(s.txns.length, 2, 'a different amount does not match');
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 12.99, { name: 'TARGET 00123' })] });
  assert.equal(s.txns.length, 2);
  const merged = s.txns.find(t => t.id === 't1');
  assert.deepEqual([merged.reviewed, merged.categoryId, merged.note, merged.matchedFrom], [true, groceries, 'shampoo', 'Target']);
  b = L.budgetSummary(s, '2026-11-04').find(c => c.id === groceries);
  assert.deepEqual([b.spent, b.pending], [1299, 0]);
});

test('cash purchases count immediately; deleting a budget returns bank items to the inbox', () => {
  const s = withTxns(plaidTxn('t1', 5));
  const c = L.saveCategory(s, { emoji: '☕', name: 'Coffee', description: 'Cafés', limitCents: 2000, interval: 'weekly' }, 'c1');
  L.addManual(s, { merchant: 'Cafe', amountCents: 450, date: '2026-11-03', categoryId: c.id, expectMatch: false }, 'm1');
  assert.equal(L.budgetSummary(s, '2026-11-04').find(x => x.id === 'c1').spent, 450);
  L.confirmTxn(s, { id: 't1', categoryId: 'c1' });
  assert.throws(() => L.deleteCategory(s, { id: 'c1' }), /hand-logged/);
  L.deleteTxn(s, { id: 'm1' });
  L.deleteCategory(s, { id: 'c1' });
  assert.deepEqual([s.txns[0].reviewed, s.txns[0].categoryId], [false, null]);
});

test('plans need a sensible range and show against their budget', () => {
  const s = L.newState();
  assert.throws(() => L.savePlan(s, { name: 'Coat', lowCents: 15000, highCents: 10000 }, 'p'), /high estimate/);
  L.savePlan(s, { name: 'Coat', lowCents: 10000, highCents: 15000, categoryId: 'preset-1', essential: true }, 'p');
  const b = L.budgetSummary(s, '2026-11-04').find(c => c.id === 'preset-1');
  assert.deepEqual([b.plannedLow, b.plannedHigh], [10000, 15000]);
});
