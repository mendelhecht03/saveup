import { merchantKey } from './transfers.mjs';
import { TRANSFER_KINDS } from './state.mjs';
// A suggestion is only a hint. It never marks anything reviewed.
// Your own past choices come first; otherwise an AI guess saved on the purchase.
export function suggest(state, t) {
  const key = merchantKey(t.name);
  const rule = state.rules[`${key}|${t.amountCents}`] || state.rules[key];
  if (rule && (!rule.categoryId || state.categories.some(c => c.id === rule.categoryId)))
    return { ...rule, source: 'history', exact: Boolean(state.rules[`${key}|${t.amountCents}`]) };
  return aiSuggestion(state, t);
}

// An AI guess is used only while it still makes sense: the budget exists, and
// a transfer's purpose fits the direction the money moved.
export function aiSuggestion(state, t) {
  const a = t.ai;
  if (!a || (!a.categoryId && !a.transferKind)) return null;
  const hasCat = Boolean(a.categoryId) && state.categories.some(c => c.id === a.categoryId);
  const reason = a.reason || '';
  if (t.transfer) {
    if (!TRANSFER_KINDS.includes(a.transferKind)) return null;
    if (a.transferKind === 'income' && t.amountCents > 0) return null;
    if (a.transferKind === 'spending' && (t.amountCents < 0 || !hasCat)) return null;
    return { categoryId: a.transferKind === 'spending' ? a.categoryId : null, transferKind: a.transferKind, source: 'ai', reason };
  }
  if (!hasCat || t.amountCents < 0) return null;
  return { categoryId: a.categoryId, transferKind: null, source: 'ai', reason };
}

// Purchases worth asking the AI about: open bank lines with no suggestion that were never asked.
export const needsAiSuggestion = (state, t) => t.source === 'plaid' && !t.reviewed && !t.ai && !suggest(state, t);
