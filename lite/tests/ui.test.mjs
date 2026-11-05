import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.mjs';
import * as C from '../public/ui/components.mjs';
import { ART, artFor } from '../public/ui/icons.mjs';
import { inboxScreen, QUEUE_SIZE } from '../public/screens/inbox.mjs';
import { budgetsScreen, budgetView } from '../public/screens/budgets.mjs';
import { plannedScreen } from '../public/screens/planned.mjs';
import { moreScreen, accountsScreen, historyScreen, historyHits, labScreen } from '../public/screens/more.mjs';
import { galleryScreen } from '../public/screens/gallery.mjs';
import { txnRow } from '../public/screens/shared.mjs';
import { reviewSheet, categorySheet, planSheet } from '../public/screens/sheets.mjs';
import { quickAddSheet, guessBudget } from '../public/screens/quickadd.mjs';

const today = '2026-11-04';
const plaidTxn = (id, amount, extra = {}) => ({ transaction_id: id, account_id: 'a1', name: 'Kahans', amount, date: '2026-11-03', pending: false, ...extra });
const ui = () => ({ weekOffset: 0, showAll: false, openBudgets: new Set(), editPlans: false, search: '' });
const groceries = 'preset-1';

test('budget bar: segments fill the limit, and past 100% they shrink to fit with the limit marked', () => {
  const s = C.barSegments({ limit: 10000, spent: 6000, pending: 2000 });
  assert.deepEqual([s.spent, s.pending, s.left, s.over], [60, 20, 20, false]);
  const over = C.barSegments({ limit: 20000, spent: 21000 });
  assert.equal(over.over, true);
  assert.equal(Math.round(over.spent), 100);
  assert.equal(Math.round(over.limitAt * 10) / 10, 95.2);
  assert.equal(C.percentOf(21000, 20000), 105, 'percent is not capped');
});

test('a budget reserves the high end of its plans and shows what is left after them', () => {
  const s = L.newState();
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 100)] });
  L.confirmTxn(s, { id: 't1', categoryId: 'preset-2' });
  L.savePlan(s, { name: 'Guitar', lowCents: 10000, highCents: 30000, categoryId: 'preset-2' }, 'p1');
  const rec = budgetView(L.budgetSummary(s, today).find(b => b.id === 'preset-2'));
  assert.deepEqual([rec.planned, rec.left], [30000, rec.limitCents - 10000 - 30000]);
  assert.match(budgetsScreen({ S: s, ui: ui(), today }), /planned/);
});

test('inbox shows about five rows, offers a swipe only when there is a suggestion, and never confirms by itself', () => {
  const s = L.newState();
  L.applySync(s, 'item1', { added: [plaidTxn('k1', 2.53, { date: '2026-10-20' })] });
  L.confirmTxn(s, { id: 'k1', categoryId: groceries });
  L.applySync(s, 'item1', { added: Array.from({ length: 7 }, (_, i) => plaidTxn(`n${i}`, i ? 10 + i : 2.53, { name: i ? `Shop ${i}` : 'Kahans' })) });
  const html = inboxScreen({ S: s, ui: ui(), today });
  assert.equal((html.match(/data-flip=/g) || []).length, QUEUE_SIZE);
  assert.equal((html.match(/data-swipe-confirm/g) || []).length, 1, 'only the familiar Kahan’s row can be swiped to confirm');
  assert.equal((html.match(/data-swipe-scan/g) || []).length, QUEUE_SIZE, 'every purchase can be swiped left to scan its receipt');
  assert.match(html, /2 more waiting/);
  assert.equal(s.txns.filter(t => !t.reviewed).length, 7);
});

test('a suggested budget looks different from a confirmed one', () => {
  const s = L.newState();
  L.applySync(s, 'item1', { added: [plaidTxn('k1', 2.53, { date: '2026-10-20' })] });
  L.confirmTxn(s, { id: 'k1', categoryId: groceries });
  L.applySync(s, 'item1', { added: [plaidTxn('k2', 2.53, { name: 'Kahans' })] });
  const queue = inboxScreen({ S: s, ui: ui(), today });
  assert.match(queue, /chip-suggested[^>]*>.*Groceries/s, 'the open purchase shows an outlined suggestion');
  const done = txnRow(s, s.txns.find(t => t.id === 'k1'));
  assert.doesNotMatch(done, /chip-suggested/, 'a reviewed purchase never looks like a suggestion');
  assert.match(done, /Groceries/);
});

test('bank, review and match statuses render as separate pills', () => {
  const s = L.newState();
  L.applySync(s, 'item1', { added: [plaidTxn('p1', 20, { pending: true })] });
  const html = reviewSheet(s, s.txns[0]);
  assert.match(html, />Pending</);
  assert.match(html, />Needs review</);
  L.addManual(s, { merchant: 'Target', amountCents: 15000, date: '2026-11-02', categoryId: groceries, expectMatch: true }, 'm1');
  const manual = reviewSheet(s, s.txns.find(t => t.id === 'm1'));
  assert.match(manual, /Reviewed/);
  assert.match(manual, /Awaiting bank match/);
});

test('every screen and sheet renders from the component set, and user text is escaped', () => {
  const s = L.newState();
  L.applySync(s, 'item1', { added: [plaidTxn('x', 5, { name: '<img src=x onerror=alert(1)>' })], accounts: [{ account_id: 'a1', name: 'Checking', mask: '0000' }] });
  s.items.push({ id: 'item1', name: 'Test bank', lastSync: null, error: null });
  const ctx = { S: s, ui: ui(), today, configured: true };
  const all = [inboxScreen, budgetsScreen, plannedScreen, moreScreen, accountsScreen, historyScreen, labScreen, galleryScreen].map(f => f(ctx)).join('')
    + reviewSheet(s, s.txns[0]) + quickAddSheet(s, today) + categorySheet(s) + planSheet(s);
  assert.doesNotMatch(all, /<img src=x/);
  assert.equal(historyHits(s, 'img').length, 1);
  assert.equal(historyHits(s, 'nothing like this').length, 0);
});

test('every 3D icon key has a placeholder and a description for the final image', () => {
  for (const [key, [emoji, tint, description]] of Object.entries(ART)) assert.ok(emoji && tint && description.length > 5, key);
  assert.equal(artFor('missing', '☕').emoji, '☕');
});

test('receipt screens render from the component set and escape what was read', async () => {
  const { receiptScreen, receiptStartSheet, matchCard } = await import('../public/screens/receipt.mjs');
  const s = L.newState();
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 10, { name: 'Shop' })] });
  const r = L.addReceipt(s, { source: 'scan', txnId: 't1', merchant: '<b>Shop</b>', date: '2026-11-02', totalCents: 1000,
    lines: [{ code: 'X<1>', name: 'X<1>', amountCents: 1000, categoryId: groceries, unsure: true }] }, 'r1');
  const items = receiptScreen({ S: s, ui: { receiptStep: 'items' }, route: 'receipt/r1' });
  assert.match(items, /Editable copy|rline/);
  assert.match(items, /Check this/);
  assert.doesNotMatch(items, /<b>Shop<\/b>|X<1>/, 'receipt text is escaped');
  const split = receiptScreen({ S: s, ui: { receiptStep: 'split' }, route: 'receipt/r1' });
  assert.match(split, /Difference/);
  assert.match(split, /Confirm breakdown/);
  assert.match(receiptStartSheet(s, s.txns[0], { reader: false, samples: [{ id: 'a', merchant: 'Target', totalCents: 15000 }] }), /Take photo[\s\S]*Choose file[\s\S]*Use digital receipt[\s\S]*Split manually/);
  L.addManual(s, { merchant: 'Shop', amountCents: 1000, date: '2026-11-02', categoryId: groceries, expectMatch: true }, 'm1');
  L.applySync(s, 'item1', { added: [plaidTxn('t2', 10, { name: 'Shop' })] });
  const [m] = L.openMatches(s);
  assert.match(matchCard(s, m), /Looks like the same purchase[\s\S]*Link purchase[\s\S]*Not a match/);
  assert.equal(r.id, 'r1');
});

test('preview screens are clearly marked and the weekly review and what-if use real numbers', async () => {
  const P = await import('../public/screens/preview.mjs');
  const { weekDoneCard, whatIfResult } = await import('../public/screens/week.mjs');
  const s = L.newState();
  for (const html of [P.subscriptionsScreen({ ui: {} }), P.subscriptionsScreen({ ui: { subsTab: 'past' } }), P.iousScreen(), P.goalsScreen(), P.cashScreen(), P.returnsScreen()])
    assert.match(html, /Preview[\s\S]*Sample data/, 'every preview says it is sample data');
  assert.match(P.settingsScreen({ S: s }), /Accounts[\s\S]*Coming later/);

  L.applySync(s, 'item1', { added: [plaidTxn('a', 30, { date: '2026-11-02' }), plaidTxn('b', 5, { date: '2026-10-20' })] });
  L.confirmTxn(s, { id: 'a', categoryId: groceries });
  const week = s.txns.filter(t => t.date >= '2026-11-01');
  const card = weekDoneCard(s, { start: '2026-11-01', end: '2026-11-07', week, older: s.txns.filter(t => !t.reviewed), today });
  assert.match(card, /1 \/ 1/);
  assert.match(card, /1 older purchase still waiting/, 'never a false inbox zero');

  // Recreation: $40 weekly limit, a $10–$30 plan. At $25 it leaves $15.
  L.savePlan(s, { name: 'Guitar', lowCents: 1000, highCents: 3000, categoryId: 'preset-2' }, 'p1');
  const out = whatIfResult(s, s.plans[0], 2500, today);
  assert.match(out, /\$15\.00[\s\S]*left in Recreation/);
  assert.match(whatIfResult(s, s.plans[0], 2500, today), /Before the purchase<\/dt><dd>\$40\.00/);
});

test('Add purchase guesses the budget from the store, your own past choice first', () => {
  const s = L.newState();
  assert.equal(guessBudget(s, ''), null);
  assert.equal(guessBudget(s, 'Zzz Place'), null, 'unsure means no guess');
  assert.equal(guessBudget(s, 'Corner Groceries').name, 'Groceries', 'a word shared with a budget name');
  assert.equal(guessBudget(s, 'Trip Travel Agency').name, 'Travel');
  L.applySync(s, 'item1', { added: [plaidTxn('k1', 2.53, { name: 'Kahans' })] });
  L.confirmTxn(s, { id: 'k1', categoryId: 'preset-4' });
  assert.equal(guessBudget(s, 'Kahans').name, 'Personal Care', 'your choice for that store wins');
  const html = quickAddSheet(s, today);
  assert.match(html, /Where\?[\s\S]*0\.00[\s\S]*Paid by[\s\S]*today[\s\S]*a budget/);
  assert.match(html, /class="composer-save" disabled aria-label="Save"/, 'Save waits until the purchase is complete');
});
