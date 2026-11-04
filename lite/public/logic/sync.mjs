// Applying Plaid /transactions/sync batches without double counting.
import { looksLikeTransfer } from './transfers.mjs';
const toDate = s => new Date(`${s}T00:00:00Z`);
// ---- bank sync
const REVIEW_FIELDS = ['reviewed', 'categoryId', 'transferKind', 'note', 'priority'];

// Apply one complete /transactions/sync batch. Pending→posted keeps the review
// (and reopens it if the amount changed); a hand-logged purchase waiting for a
// match is merged into the bank record so it is never counted twice.
export function applySync(state, itemId, batch) {
  for (const a of batch.accounts || []) state.accounts[a.account_id] = { itemId, name: a.name, mask: a.mask || '' };
  for (const p of batch.added || []) {
    if (state.txns.some(t => t.id === p.transaction_id)) continue;
    const t = {
      id: p.transaction_id, source: 'plaid', itemId, accountId: p.account_id,
      name: p.merchant_name || p.name || 'Bank transaction', amountCents: Math.round(p.amount * 100),
      date: p.date, pending: Boolean(p.pending), pfc: p.personal_finance_category?.primary || null,
      reviewed: false, categoryId: null, transferKind: null, note: '', priority: null, amountChanged: false
    };
    t.transfer = looksLikeTransfer(`${p.name} ${p.merchant_name || ''}`, t.pfc);
    const previous = p.pending_transaction_id && state.txns.find(x => x.id === p.pending_transaction_id);
    const manual = !previous && state.txns.find(x => x.source === 'manual' && x.expectMatch && !x.verified &&
      x.amountCents === t.amountCents && Math.abs(toDate(x.date) - toDate(t.date)) <= 7 * 864e5);
    if (previous) {
      for (const f of REVIEW_FIELDS) t[f] = previous[f];
      if (previous.reviewed && previous.amountCents !== t.amountCents) Object.assign(t, { reviewed: false, amountChanged: true });
      state.txns = state.txns.filter(x => x !== previous);
    } else if (manual) {
      for (const f of REVIEW_FIELDS) t[f] = manual[f];
      t.matchedFrom = manual.name;
      state.txns = state.txns.filter(x => x !== manual);
    }
    state.txns.push(t);
  }
  for (const p of batch.modified || []) {
    const t = state.txns.find(x => x.id === p.transaction_id);
    if (!t) continue;
    const amountCents = Math.round(p.amount * 100);
    if (t.reviewed && amountCents !== t.amountCents) Object.assign(t, { reviewed: false, amountChanged: true });
    Object.assign(t, { amountCents, date: p.date, pending: Boolean(p.pending), name: p.merchant_name || p.name || t.name });
  }
  const removed = new Set((batch.removed || []).map(r => r.transaction_id));
  state.txns = state.txns.filter(t => !removed.has(t.id));
}

export function removeItem(state, itemId) {
  state.items = state.items.filter(i => i.id !== itemId);
  state.txns = state.txns.filter(t => t.itemId !== itemId);
  for (const [id, a] of Object.entries(state.accounts)) if (a.itemId === itemId) delete state.accounts[id];
}
