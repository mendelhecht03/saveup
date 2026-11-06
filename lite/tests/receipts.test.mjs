import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.mjs';
import { RECEIPTS, subtotalCents } from '../sandbox/receipts.mjs';

const plaidTxn = (id, amount, extra = {}) => ({ transaction_id: id, account_id: 'a1', name: 'Target', amount, date: '2026-11-01', pending: false, ...extra });
const sum = xs => xs.reduce((s, x) => s + x.amountCents, 0);

// A state with a budget for every category the sample receipts use.
function setup() {
  const s = L.newState();
  for (const [name, i] of [['Household', 'h'], ['Clothing', 'c']]) L.saveCategory(s, { emoji: '🧽', name, description: name, limitCents: 10000, interval: 'monthly' }, i);
  const byName = Object.fromEntries(s.categories.map(c => [c.name.toLowerCase(), c.id]));
  const digital = r => ({ source: 'digital', merchant: r.merchant, date: '2026-11-02', method: r.payment.method, last4: r.payment.last4, taxCents: r.taxCents, totalCents: r.totalCents,
    lines: r.items.map(i => ({ code: i.code, name: i.name, amountCents: i.amountCents, categoryId: byName[i.category] || null })) });
  return { s, byName, digital };
}

test('sharing cents always adds up exactly, with leftovers to the largest remainders', () => {
  assert.deepEqual(L.shareCents(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(L.shareCents(878, [6500, 4000, 2500, 2000]).reduce((a, b) => a + b, 0), 878);
  assert.deepEqual(L.shareCents(-10, [1, 1, 1]), [-4, -3, -3]);
  assert.deepEqual(L.shareCents(5, [0, 0]), [5, 0]);
  for (let t = 0; t < 50; t++) {
    const w = Array.from({ length: 1 + (t % 7) }, (_, i) => (i * 37 + t * 11) % 900);
    assert.equal(L.shareCents(t * 13, w).reduce((a, b) => a + b, 0), t * 13);
  }
});

test('a receipt splits the bank charge across budgets, tax included, summing exactly', () => {
  const { s, byName, digital } = setup();
  const target = RECEIPTS.find(r => r.id === 'target-split');
  assert.equal(subtotalCents(target) + target.taxCents, target.totalCents, 'the fixture itself adds up');
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 150)] });
  const r = L.addReceipt(s, { ...digital(target), txnId: 't1' }, 'r1');
  const check = L.receiptCheck(s, r);
  assert.equal(check.difference, 0);
  assert.equal(check.ready, true);
  assert.deepEqual(check.parts.map(p => p.categoryId).sort(), [byName.groceries, byName.household, byName['personal care'], byName.clothing].sort());
  const t = L.confirmReceipt(s, { id: 'r1' });
  assert.equal(sum(t.splits), 15000);
  assert.equal(t.reviewed, true);
  assert.equal(t.receiptId, 'r1');
  const totals = L.budgetSummary(s, '2026-11-04').filter(b => b.total).map(b => b.total);
  assert.equal(totals.reduce((a, b) => a + b, 0), 15000, 'counted once across all budgets');
  const groceries = L.budgetSummary(s, '2026-11-04').find(b => b.id === byName.groceries);
  assert.equal(groceries.txns[0].shareCents, t.splits.find(p => p.categoryId === byName.groceries).amountCents);
});

test('a receipt that does not match the charge cannot be confirmed until the difference is assigned', () => {
  const { s, byName, digital } = setup();
  const shoprite = RECEIPTS.find(r => r.id === 'shoprite-off');
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 145, { name: 'ShopRite' })] });
  const r = L.addReceipt(s, { ...digital(shoprite), txnId: 't1' }, 'r1');
  assert.equal(L.receiptCheck(s, r).difference, -500);
  assert.throws(() => L.confirmReceipt(s, { id: 'r1' }), /items add up to \$150\.00, but the purchase is \$145\.00/);
  L.addDifferenceLine(s, { id: 'r1', categoryId: byName.groceries });
  assert.equal(r.lines.at(-1).amountCents, -500);
  const t = L.confirmReceipt(s, { id: 'r1' });
  assert.equal(sum(t.splits), 14500);
});

test('every item needs a budget before confirming', () => {
  const { s, digital } = setup();
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 150)] });
  const target = RECEIPTS.find(r => r.id === 'target-split');
  const input = digital(target);
  input.lines[0].categoryId = null;
  L.addReceipt(s, { ...input, txnId: 't1' }, 'r1');
  assert.throws(() => L.confirmReceipt(s, { id: 'r1' }), /budget for every item/);
});

test('scanning first creates one card purchase that waits for its bank charge, then links once', () => {
  const { s, byName, digital } = setup();
  const target = RECEIPTS.find(r => r.id === 'target-split');
  L.addReceipt(s, digital(target), 'r1');
  const m = L.confirmReceipt(s, { id: 'r1' }, 'm1');
  assert.deepEqual([m.source, m.expectMatch, m.verified, m.reviewed, sum(m.splits)], ['manual', true, false, true, 15000]);
  let pending = L.budgetSummary(s, '2026-11-04').reduce((a, b) => a + b.pending, 0);
  assert.equal(pending, 15000, 'counts as pending until the bank charge is linked');

  L.applySync(s, 'item1', { added: [plaidTxn('t1', 150, { date: '2026-11-02', pending: true })] });
  const [match] = L.openMatches(s);
  assert.equal(match.differenceCents, 0);
  const bank = L.linkPurchase(s, { bankId: 't1', manualId: 'm1' });
  assert.deepEqual([bank.reviewed, bank.receiptId, sum(bank.splits)], [true, 'r1', 15000]);
  assert.equal(s.receipts[0].txnId, 't1');
  assert.equal(s.txns.length, 1);
  pending = L.budgetSummary(s, '2026-11-04').reduce((a, b) => a + b.pending, 0);
  assert.equal(pending, 15000, 'still pending: the bank says so');

  // Pending → posted keeps the split and the receipt.
  L.applySync(s, 'item1', { added: [plaidTxn('t2', 150, { date: '2026-11-03', pending_transaction_id: 't1' })] });
  const posted = s.txns.find(t => t.id === 't2');
  assert.deepEqual([posted.reviewed, posted.receiptId, sum(posted.splits)], [true, 'r1', 15000]);
  assert.equal(s.receipts[0].txnId, 't2');
  assert.equal(L.budgetSummary(s, '2026-11-04').reduce((a, b) => a + b.spent, 0), 15000);
  assert.ok(byName.groceries);
});

test('a different amount is shown as a possible match, never linked automatically, and reopens review if linked', () => {
  const s = L.newState();
  L.addManual(s, { merchant: 'ShopRite', amountCents: 15000, date: '2026-10-31', categoryId: 'preset-1', expectMatch: true }, 'm1');
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 145, { name: 'SHOPRITE TEANECK' }), plaidTxn('x1', 145, { name: 'Other store' })] });
  const matches = L.openMatches(s);
  assert.equal(matches.length, 1, 'a different amount needs the same store');
  assert.deepEqual([matches[0].bank.id, matches[0].differenceCents], ['t1', -500]);
  assert.equal(s.txns.length, 3);
  const bank = L.linkPurchase(s, { bankId: 't1', manualId: 'm1' });
  assert.deepEqual([bank.reviewed, bank.amountChanged], [false, true]);
});

test('"Not a match" is remembered for that pair', () => {
  const s = L.newState();
  L.addManual(s, { merchant: 'Target', amountCents: 2000, date: '2026-10-31', categoryId: 'preset-1', expectMatch: true }, 'm1');
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 20)] });
  assert.equal(L.openMatches(s).length, 1);
  L.rejectMatch(s, { bankId: 't1', manualId: 'm1' });
  assert.equal(L.openMatches(s).length, 0);
  assert.equal(s.txns.find(t => t.id === 'm1').verified, false, 'the purchase keeps waiting for its real charge');
});

test('a scan-first receipt warns about a purchase that may already be logged', () => {
  const { s, digital } = setup();
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 150, { date: '2026-10-31' }), plaidTxn('t2', 150, { date: '2026-10-20' })] });
  const r = L.addReceipt(s, digital(RECEIPTS.find(x => x.id === 'target-split')), 'r1');
  assert.deepEqual(L.possibleDuplicates(s, r).map(t => t.id), ['t1'], 'only within 3 days');
  L.attachReceipt(s, { id: 'r1', txnId: 't1' });
  L.confirmReceipt(s, { id: 'r1' }, 'never-used');
  assert.equal(s.txns.length, 2, 'attaching did not create a duplicate purchase');
});

test('renaming a cryptic item code is remembered for that store', () => {
  const s = L.newState();
  const r = L.addReceipt(s, { source: 'scan', merchant: 'Target', date: '2026-10-30', totalCents: 429, lines: [{ code: 'GV WHL MLK', name: 'GV WHL MLK', amountCents: 429 }] }, 'r1');
  L.saveReceipt(s, { id: 'r1', lines: [{ ...r.lines[0], name: 'Whole milk' }] });
  const next = L.addReceipt(s, { source: 'scan', merchant: 'TARGET', totalCents: 429, lines: [{ code: 'gv whl mlk', name: 'GV WHL MLK', amountCents: 429 }] }, 'r2');
  assert.equal(next.lines[0].name, 'Whole milk');
  assert.equal(next.lines[0].remembered, true);
  const other = L.addReceipt(s, { source: 'scan', merchant: 'ShopRite', totalCents: 429, lines: [{ code: 'GV WHL MLK', name: 'GV WHL MLK', amountCents: 429 }] }, 'r3');
  assert.equal(other.lines[0].name, 'GV WHL MLK', 'names are per store');
});

test('choosing one budget in the review sheet replaces a split', () => {
  const { s, digital } = setup();
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 150)] });
  L.addReceipt(s, { ...digital(RECEIPTS.find(x => x.id === 'target-split')), txnId: 't1' }, 'r1');
  L.confirmReceipt(s, { id: 'r1' });
  L.confirmTxn(s, { id: 't1', categoryId: 'preset-1' });
  const t = s.txns[0];
  assert.equal(t.splits, null);
  assert.equal(L.budgetSummary(s, '2026-11-04').find(b => b.id === 'preset-1').total, 15000);
});

test('receipt items arrive with a budget guess: your past choice for that item, then the purchase, then the store', () => {
  const { s } = setup();
  // A past receipt at the same store taught that this code is Clothing.
  L.addReceipt(s, { source: 'manual', merchant: 'Flamms Clothing', lines: [{ code: 'BLZR', name: 'Blazer', amountCents: 10999, categoryId: 'c' }] }, 'old');
  const r = L.addReceipt(s, { source: 'scan', merchant: 'FLAMMS CLOTHING', lines: [{ code: 'BLZR', name: 'Blazer', amountCents: 10999 }, { code: 'SOCK', name: 'Socks', amountCents: 500 }] }, 'new');
  assert.deepEqual(r.lines.map(l => [l.categoryId, l.unsure]), [['c', true], [null, false]], 'only the known item is guessed, and the guess is marked unsure');
  // Attaching the bank purchase fills the rest from that purchase's budget.
  L.applySync(s, 'item1', { added: [plaidTxn('t1', 115.99, { name: 'Flamms Clothing' })] });
  L.confirmTxn(s, { id: 't1', categoryId: 'h' });
  L.attachReceipt(s, { id: 'new', txnId: 't1' });
  assert.deepEqual(r.lines.map(l => l.categoryId), ['c', 'h']);
  assert.equal(L.suggestLineBudget(s, { merchant: 'Somewhere new' }, { code: 'X' }), null, 'no history, no guess');
});

test('the receipt screen shows payee, budget, account and date, with chips instead of dropdowns', async () => {
  const { receiptScreen, receiptBudgetSheet } = await import('../public/screens/receipt.mjs');
  const { s } = setup();
  L.addReceipt(s, { source: 'scan', merchant: 'Flamms Clothing', date: '2026-10-20', time: '17:30', last4: '4417', method: 'card', totalCents: 11499,
    lines: [{ code: 'BLZR', name: 'Blazer', amountCents: 10999, categoryId: 'c' }, { code: 'SOCK', name: 'Socks', amountCents: 500 }] }, 'r1');
  const html = receiptScreen({ S: s, ui: { receiptStep: 'items' }, route: 'receipt/r1' });
  assert.doesNotMatch(html, /<select/, 'no dropdowns');
  for (const bit of ['Payee', 'Flamms Clothing', 'Split · 1 budget, 1 to pick', 'Card •••• 4417 · waiting for the bank charge', 'Tue, Oct 20, 2026 · 17:30', '$114.99'])
    assert.ok(html.includes(bit), bit);
  const sheet = receiptBudgetSheet(s, s.receipts[0], '1');
  assert.ok(sheet.includes('New budget') && sheet.includes('Also use it for the 1 other item') === false, 'the other item already has a budget');
  assert.match(receiptBudgetSheet(s, s.receipts[0], 'all'), /Every item on this receipt/);
});
