// Helpers every screen uses to describe purchases and budgets the same way.
import * as L from '../logic.mjs';
import { ART } from '../ui/icons.mjs';
import { statusPill, money, row, categoryChip } from '../ui/components.mjs';

export const shortDate = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const longDate = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const rangeLabel = (a, b) => a.slice(0, 7) === b.slice(0, 7) ? `${shortDate(a)} – ${Number(b.slice(8))}` : `${shortDate(a)} – ${shortDate(b)}`;
export const signed = t => t.amountCents < 0 ? `+${money(-t.amountCents)}` : money(t.amountCents);
export const byDate = (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name);

// Budgets made before 3D icons store an emoji; map presets and known emoji to art keys.
const NAME_ART = { groceries: 'groceries', recreation: 'recreation', 'personal care': 'personal-care', housing: 'housing', travel: 'travel', education: 'education', essentials: 'household', household: 'household', clothing: 'clothing', 'dining out': 'dining', dining: 'dining', transportation: 'transportation', gifts: 'gifts', other: 'other' };
const EMOJI_ART = Object.fromEntries(Object.entries(ART).map(([k, [e]]) => [e, k]));
export const catArt = c => c ? NAME_ART[c.name.toLowerCase()] || EMOJI_ART[c.emoji] || null : null;
export const catTint = c => ART[catArt(c)]?.[1] || 'gray';
export const catChip = (c, opts) => c ? categoryChip(c.name, catTint(c), opts) : '';

export function periodLabel(c, today) {
  const { start, end } = L.periodRange(c.interval, today);
  if (c.interval === 'weekly') return rangeLabel(start, end);
  if (c.interval === 'monthly') return new Date(`${start}T12:00:00`).toLocaleDateString('en-US', { month: 'long' });
  return start.slice(0, 4);
}

export const accountLabel = (S, t) => {
  if (t.source === 'manual') return t.expectMatch ? 'Card' : 'Cash';
  const a = S.accounts[t.accountId];
  return a ? `${a.name}${a.mask ? ` •••• ${a.mask}` : ''}` : 'Bank';
};

export function txnIcon(S, t) {
  const c = S.categories.find(x => x.id === (t.categoryId || (!t.reviewed && L.suggest(S, t)?.categoryId)));
  if (t.transfer) return { icon: t.transferKind === 'own' ? 'bank' : 'transfer' };
  if (c) return { icon: catArt(c), emoji: c.emoji };
  if (t.source === 'manual') return { icon: t.expectMatch ? 'card' : 'cash' };
  return { icon: t.amountCents < 0 ? 'refund' : 'store' };
}

// Bank status, review status and match status are three separate pills.
export function statusPills(t) {
  const p = [];
  if (t.source === 'plaid') p.push(t.pending ? statusPill('Pending', 'warn') : statusPill('Posted', 'ok'));
  if (t.transfer && !t.reviewed) p.push(statusPill('Needs purpose', 'warn'));
  else p.push(t.reviewed ? statusPill('Reviewed', 'ok', { icon: 'check' }) : statusPill('Needs review', 'info'));
  if (t.source === 'manual' && t.expectMatch) p.push(t.verified ? statusPill('Matched', 'ok') : statusPill('Awaiting bank match', 'blue', { icon: 'clock' }));
  if (t.matchedFrom) p.push(statusPill('Matched', 'ok', { icon: 'link' }));
  if (t.amountChanged) p.push(statusPill('Amount changed', 'warn'));
  if (t.priority === L.ESSENTIAL) p.push(statusPill('Essential', 'ok'));
  return p;
}
const bankWord = t => t.source === 'manual' ? (t.expectMatch ? 'Card' : 'Cash') : t.pending ? 'Pending' : 'Posted';

// A purchase as a list row. In the inbox queue the row shows its suggestion
// and can be swiped to confirm it; elsewhere it shows its full statuses.
export function txnRow(S, t, { queue = false } = {}) {
  const c = S.categories.find(x => x.id === t.categoryId);
  const sug = !t.reviewed ? L.suggest(S, t) : null, sc = sug && S.categories.find(x => x.id === sug.categoryId);
  const { icon, emoji } = txnIcon(S, t);
  const data = { id: t.id, flip: queue ? t.id : null };
  if (!queue) {
    // Once reviewed, the budget shows as a solid chip with a check: the final label.
    const done = t.reviewed && (c ? catChip(c, { confirmed: true }) : t.transferKind === 'own' ? categoryChip('My accounts', 'gray', { confirmed: true }) : t.transferKind === 'income' ? categoryChip('Income', 'green', { confirmed: true }) : '');
    return row({ icon, emoji, title: t.name, sub: `${shortDate(t.date)} · ${accountLabel(S, t)}`, chip: done || null, amount: signed(t), amountTone: t.amountCents < 0 ? 'in' : null, pillList: statusPills(t), act: 'open', data });
  }
  let chip;
  if (t.transfer && !sug) chip = statusPill('Needs purpose', 'warn');
  else if (sc) chip = catChip(sc, { suggested: true });
  else if (sug?.transferKind === 'own') chip = categoryChip('My accounts', 'gray', { suggested: true });
  else if (sug?.transferKind === 'income') chip = categoryChip('Income', 'green', { suggested: true });
  else chip = statusPill(t.amountChanged ? 'Amount changed' : 'Needs review', t.amountChanged ? 'warn' : 'info');
  const canSwipe = sug && (sc || sug.transferKind === 'own' || sug.transferKind === 'income');
  return row({ icon, emoji, title: t.name, sub: `${shortDate(t.date)} · ${bankWord(t)}`, chip, amount: signed(t), amountTone: t.amountCents < 0 ? 'in' : null, chevron: false, act: 'open', data, swipe: { confirm: canSwipe ? `Confirm ${sc ? sc.name : sug.transferKind === 'own' ? 'my accounts' : 'income'}` : null, scan: t.amountCents > 0 && !t.transfer ? 'Scan receipt' : null } });
}
