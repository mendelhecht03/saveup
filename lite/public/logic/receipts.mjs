// Receipts: reading one into a breakdown, splitting a purchase across budgets,
// matching a hand-logged or scanned purchase to its bank charge, and the
// remembered names for cryptic item codes. Nothing links on its own: a match is
// only a suggestion until the user taps Link.
import { InputError } from './state.mjs';
import { merchantKey } from './transfers.mjs';
import { breakdown, ADJUSTMENT } from './splits.mjs';
import { text, cents, date, findTxn, categoryOrNull } from './validate.mjs';
import { addManual } from './review.mjs';
import { suggest } from './suggestions.mjs';

const DAY = 864e5;
const daysApart = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;
const sameMerchant = (a, b) => {
  const x = merchantKey(a).split(' ')[0], y = merchantKey(b).split(' ')[0];
  return Boolean(x) && x === y;
};
export const findReceipt = (state, id) => state.receipts.find(r => r.id === id) || (() => { throw new InputError('Receipt not found.', 404); })();
const nameKey = (merchant, code) => `${merchantKey(merchant)}|${String(code).trim().toUpperCase()}`;

// ---- item code names
// Your own names for cryptic codes ("GV WHL MLK" → "Whole milk") win over what was read.
export function applyKnownNames(state, merchant, lines) {
  return lines.map(l => {
    const known = state.itemNames[nameKey(merchant, l.code)];
    return known ? { ...l, name: known, remembered: true } : l;
  });
}

// A budget guess for a receipt line, in order: what you chose for this item at
// this store before, the bank purchase's budget, then what this store usually is.
export function suggestLineBudget(state, { merchant, txnId }, line) {
  const exists = id => Boolean(id) && state.categories.some(c => c.id === id);
  if (merchant) {
    const key = nameKey(merchant, line.code);
    for (let i = state.receipts.length - 1; i >= 0; i--) {
      const r = state.receipts[i];
      if (!r.merchant || merchantKey(r.merchant) !== merchantKey(merchant)) continue;
      const hit = r.lines.find(l => !l.unsure && exists(l.categoryId) && nameKey(r.merchant, l.code) === key);
      if (hit) return hit.categoryId;
    }
  }
  const t = txnId && state.txns.find(x => x.id === txnId);
  if (t) {
    if (exists(t.categoryId) && !t.splits?.length) return t.categoryId;
    const s = suggest(state, t);
    if (exists(s?.categoryId)) return s.categoryId;
  }
  const rule = merchant && state.rules[merchantKey(merchant)];
  return exists(rule?.categoryId) ? rule.categoryId : null;
}
// Lines with no budget get the guess, marked unsure so the screen shows it as a guess.
const withGuesses = (state, r, lines) => lines.map(l => {
  if (l.categoryId) return l;
  const g = suggestLineBudget(state, r, l);
  return g ? { ...l, categoryId: g, unsure: true } : l;
});

// ---- receipts
const cleanLine = (state, l) => ({
  code: text(l.code || l.name, 'Item', 60), name: text(l.name || l.code, 'Item name', 80),
  amountCents: cents(l.amountCents, 'Item amount', { allowNegative: true }),
  categoryId: categoryOrNull(state, l.categoryId), unsure: Boolean(l.unsure)
});

// Create a receipt from a scan, a digital receipt or nothing (split manually).
export function addReceipt(state, input, newId) {
  const r = {
    id: newId, txnId: null, source: ['scan', 'digital', 'manual'].includes(input.source) ? input.source : 'manual',
    merchant: text(input.merchant || '', 'Store', 100, false), date: input.date ? date(input.date) : '',
    time: /^\d{2}:\d{2}$/.test(input.time || '') ? input.time : '', last4: /^\d{4}$/.test(input.last4 || '') ? input.last4 : '',
    method: ['card', 'cash'].includes(input.method) ? input.method : '',
    image: input.image || null, taxCents: Number.isSafeInteger(input.taxCents) ? input.taxCents : 0,
    totalCents: Number.isSafeInteger(input.totalCents) ? input.totalCents : 0,
    lines: [], createdAt: new Date().toISOString()
  };
  r.lines = applyKnownNames(state, r.merchant, (input.lines || []).map(l => {
    try { return cleanLine(state, l); } catch { return null; }
  }).filter(Boolean));
  if (input.txnId) r.txnId = findTxn(state, input.txnId).id;
  r.lines = withGuesses(state, r, r.lines);
  state.receipts.push(r);
  return r;
}

// Save edits from the editable copy. Renaming a line teaches SaveUp that code.
export function saveReceipt(state, input) {
  const r = findReceipt(state, input.id);
  if (input.merchant !== undefined) r.merchant = text(input.merchant, 'Store', 100);
  if (input.date !== undefined) r.date = date(input.date);
  if (input.taxCents !== undefined) r.taxCents = cents(input.taxCents, 'Tax', { allowNegative: true });
  if (input.totalCents !== undefined) r.totalCents = cents(input.totalCents, 'Total', { min: 1 });
  if (input.lines) {
    if (!Array.isArray(input.lines) || input.lines.length > 200) throw new InputError('Too many receipt lines.');
    const before = new Map(r.lines.map(l => [l.code, l.name]));
    r.lines = input.lines.map(l => cleanLine(state, l));
    for (const l of r.lines) if (r.merchant && l.name !== l.code && before.get(l.code) !== l.name && before.has(l.code)) state.itemNames[nameKey(r.merchant, l.code)] = l.name;
  }
  return r;
}

export function deleteReceipt(state, { id }) {
  const r = findReceipt(state, id);
  const t = r.txnId && state.txns.find(x => x.id === r.txnId);
  if (t && t.receiptId === r.id) { t.receiptId = null; t.splits = null; }
  state.receipts = state.receipts.filter(x => x !== r);
}

// What the receipt says each budget should get, against what the purchase cost.
export function receiptCheck(state, r) {
  const t = r.txnId ? state.txns.find(x => x.id === r.txnId) : null;
  const lineSum = r.lines.reduce((s, l) => s + l.amountCents, 0);
  const targetCents = t ? t.amountCents : r.totalCents;
  const parts = breakdown(r.lines, r.taxCents);
  const assigned = parts.reduce((s, p) => s + p.amountCents, 0);
  return {
    target: targetCents, lineSum, assigned, parts,
    printedDifference: r.totalCents - (lineSum + r.taxCents), // lines + tax vs the printed total
    difference: targetCents - assigned,                        // what's left to assign
    unassigned: parts.find(p => !p.categoryId)?.amountCents || 0,
    ready: r.lines.length > 0 && targetCents === assigned && parts.every(p => p.categoryId)
  };
}

// Confirming the breakdown splits the purchase across budgets and marks it
// reviewed. A scanned receipt with no purchase yet becomes a new hand-logged
// one (card purchases wait for their bank charge, cash ones count right away).
export function confirmReceipt(state, { id }, newTxnId) {
  const r = findReceipt(state, id);
  if (!r.txnId) {
    if (!r.merchant) throw new InputError('Add the store name first.');
    if (!r.date) throw new InputError('Add the date first.');
    if (r.totalCents < 1) throw new InputError('Add the receipt total first.');
  }
  const check = receiptCheck(state, r);
  if (!r.lines.length) throw new InputError('Add at least one item.');
  if (check.unassigned) throw new InputError('Pick a budget for every item.');
  if (!check.ready) throw new InputError(`The items add up to $${(check.assigned / 100).toFixed(2)}, but the purchase is $${(check.target / 100).toFixed(2)}. Fix an amount or add the difference to a budget.`);
  if (!r.txnId) r.txnId = addManual(state, { merchant: r.merchant, amountCents: r.totalCents, date: r.date, categoryId: check.parts[0].categoryId, expectMatch: r.method !== 'cash' }, newTxnId).id;
  const t = findTxn(state, r.txnId);
  if (t.transfer && t.transferKind !== 'spending' && t.transferKind) throw new InputError('Only spending can be split across budgets.');
  Object.assign(t, {
    splits: check.parts.map(p => ({ categoryId: p.categoryId, amountCents: p.amountCents })),
    categoryId: check.parts[0].categoryId, receiptId: r.id, reviewed: true, amountChanged: false,
    transferKind: t.transfer ? 'spending' : t.transferKind
  });
  return t;
}

// The difference between the items and the purchase goes to one budget as a
// line of its own, so the user sees it on the receipt.
export function addDifferenceLine(state, { id, categoryId }) {
  const r = findReceipt(state, id);
  const { difference } = receiptCheck(state, r);
  if (!difference) return r;
  r.lines.push({ code: ADJUSTMENT, name: difference > 0 ? 'Difference from the bank charge' : 'Discount or refund', amountCents: difference, categoryId: categoryOrNull(state, categoryId), unsure: false });
  return r;
}

// Before a scanned receipt becomes a new purchase: anything already logged that
// looks like the same purchase (same amount within 3 days, or the same store and
// a close amount). Attaching to it avoids a duplicate.
export function possibleDuplicates(state, r) {
  if (!r.totalCents || !r.date) return [];
  return state.txns.filter(t => t.amountCents > 0 && !t.receiptId && daysApart(t.date, r.date) <= 3 &&
    (t.amountCents === r.totalCents || (sameMerchant(t.name, r.merchant) && Math.abs(t.amountCents - r.totalCents) <= Math.max(1000, r.totalCents * 0.1))))
    .sort((a, b) => Math.abs(a.amountCents - r.totalCents) - Math.abs(b.amountCents - r.totalCents));
}

export function attachReceipt(state, { id, txnId }) {
  const r = findReceipt(state, id);
  const t = findTxn(state, txnId);
  if (t.receiptId && t.receiptId !== r.id) throw new InputError('That purchase already has a receipt.');
  r.txnId = t.id;
  r.lines = withGuesses(state, r, r.lines);
  return r;
}

// ---- matching a hand-logged or scanned card purchase to its bank charge
// Possible matches for a bank charge: card purchases still waiting for a match,
// within 7 days, that the user hasn't already ruled out. Same amount: "Looks like
// the same purchase". A different amount needs the same store and stays amber.
export function matchCandidates(state, bank) {
  if (bank.source !== 'plaid' || bank.amountCents <= 0 || bank.transfer) return [];
  return state.txns.filter(m => m.source === 'manual' && m.expectMatch && !m.verified && daysApart(m.date, bank.date) <= 7 &&
    !(bank.notMatch || []).includes(m.id) &&
    (m.amountCents === bank.amountCents || (sameMerchant(m.name, bank.name) && Math.abs(m.amountCents - bank.amountCents) <= Math.max(1000, m.amountCents * 0.1))))
    .map(m => ({ bank, manual: m, differenceCents: bank.amountCents - m.amountCents }))
    .sort((a, b) => Math.abs(a.differenceCents) - Math.abs(b.differenceCents));
}

// Every open suggestion in the app, newest bank charge first, one per bank charge
// and one per hand-logged purchase.
export function openMatches(state) {
  const used = new Set(), out = [];
  for (const bank of [...state.txns].sort((a, b) => b.date.localeCompare(a.date))) {
    const c = matchCandidates(state, bank).find(x => !used.has(x.manual.id));
    if (c) { used.add(c.manual.id); out.push(c); }
  }
  return out;
}

// Link: the bank charge keeps its bank status and takes the purchase's review,
// split and receipt. The hand-logged copy is removed, so it counts once. A
// different amount reopens review, because the split no longer adds up.
export function linkPurchase(state, { bankId, manualId }) {
  const bank = findTxn(state, bankId), m = findTxn(state, manualId);
  if (bank.source !== 'plaid' || m.source !== 'manual') throw new InputError('Link a bank charge to a purchase you logged.');
  for (const f of ['reviewed', 'categoryId', 'note', 'priority', 'splits', 'receiptId']) bank[f] = m[f] ?? null;
  bank.matchedFrom = m.name;
  if (bank.amountCents !== m.amountCents) Object.assign(bank, { reviewed: false, amountChanged: true, splits: null });
  const r = bank.receiptId && state.receipts.find(x => x.id === bank.receiptId);
  if (r) r.txnId = bank.id;
  state.txns = state.txns.filter(x => x !== m);
  return bank;
}

export function rejectMatch(state, { bankId, manualId }) {
  const bank = findTxn(state, bankId);
  bank.notMatch = [...new Set([...(bank.notMatch || []), manualId])];
  return bank;
}
