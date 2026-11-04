// Reviewing purchases: confirm, reopen, add by hand, delete.
import { InputError, TRANSFER_KINDS, ESSENTIAL } from './state.mjs';
import { merchantKey } from './transfers.mjs';
import { suggest } from './suggestions.mjs';
import { text, cents, date, findTxn, categoryOrNull } from './validate.mjs';
// ---- review
export function confirmTxn(state, { id, categoryId, transferKind, note, priority }) {
  const t = findTxn(state, id);
  const fields = { note: text(note, 'Comment', 500, false), priority: priority == null ? null : Number(priority) };
  if (fields.priority !== null && !(Number.isInteger(fields.priority) && fields.priority >= 1 && fields.priority <= ESSENTIAL)) throw new InputError(`Priority must be 1–${ESSENTIAL}.`);
  if (t.transfer) {
    if (!TRANSFER_KINDS.includes(transferKind)) throw new InputError('Say what this transfer was before confirming.');
    if (transferKind === 'income' && t.amountCents > 0) throw new InputError('Money that left your account cannot be income.');
    if (transferKind === 'spending' && t.amountCents < 0) throw new InputError('Money that came in cannot be spending.');
    fields.transferKind = transferKind;
    fields.categoryId = transferKind === 'spending' ? categoryOrNull(state, categoryId) : null;
    if (transferKind === 'spending' && !fields.categoryId) throw new InputError('Pick a budget for this spending.');
  } else {
    fields.categoryId = categoryOrNull(state, categoryId);
    if (!fields.categoryId) throw new InputError('Pick a budget first.');
  }
  // Record whether a suggestion was taken. The guess (t.ai) stays separate from the answer.
  const sug = suggest(state, t);
  const took = sug && (sug.categoryId || null) === fields.categoryId && (sug.transferKind || null) === (fields.transferKind || null);
  fields.suggestionTaken = took ? sug.source : null;
  // Choosing one budget here replaces any split; the receipt stays attached.
  Object.assign(t, fields, { splits: null, reviewed: true, amountChanged: false });
  const key = merchantKey(t.name);
  const rule = { categoryId: t.categoryId, transferKind: t.transferKind || null };
  if (key) state.rules[key] = state.rules[`${key}|${t.amountCents}`] = rule;
  return t;
}

export function unreviewTxn(state, { id }) {
  const t = findTxn(state, id);
  if (t.source === 'manual') throw new InputError('Hand-logged purchases stay reviewed. Edit or delete it instead.');
  t.reviewed = false;
  return t;
}

export function addManual(state, input, newId) {
  const t = {
    id: newId, source: 'manual', itemId: null, accountId: null,
    name: text(input.merchant, 'Merchant', 100), amountCents: cents(input.amountCents, 'Amount', { min: 1 }),
    date: date(input.date), pending: false, pfc: null, transfer: false, transferKind: null,
    categoryId: categoryOrNull(state, input.categoryId), note: text(input.note, 'Comment', 500, false),
    priority: null, expectMatch: Boolean(input.expectMatch), verified: !input.expectMatch, reviewed: true, amountChanged: false
  };
  if (!t.categoryId) throw new InputError('Pick a budget first.');
  state.txns.push(t);
  return t;
}

export function deleteTxn(state, { id }) {
  const t = findTxn(state, id);
  if (t.source !== 'manual') throw new InputError('Bank transactions come from your bank and cannot be deleted.');
  state.txns = state.txns.filter(x => x !== t);
  for (const r of state.receipts || []) if (r.txnId === t.id) r.txnId = null;
}
