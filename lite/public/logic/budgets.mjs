// What each budget has spent, has pending, and has left this period.
import { periodRange, weekRange } from './dates.mjs';
import { portions } from './splits.mjs';

// Pending money = bank says pending, or a hand-logged purchase still waiting for its bank match.
export const isPendingMoney = t => t.pending || (t.source === 'manual' && !t.verified);
export const countsAsSpending = t => t.reviewed && portions(t).length > 0 && (!t.transfer || t.transferKind === 'spending');

export function budgetSummary(state, today) {
  return state.categories.map(c => {
    const { start, end } = periodRange(c.interval, today);
    // A split purchase appears in each of its budgets with only that budget's share (`shareCents`).
    const txns = state.txns.filter(t => countsAsSpending(t) && t.date >= start && t.date <= end)
      .flatMap(t => portions(t).filter(p => p.categoryId === c.id).map(p => ({ ...t, shareCents: p.amountCents })))
      .sort((a, b) => b.date.localeCompare(a.date));
    let spent = 0, pending = 0;
    for (const t of txns) isPendingMoney(t) ? pending += t.shareCents : spent += t.shareCents;
    const plans = state.plans.filter(p => p.categoryId === c.id);
    return {
      ...c, start, end, txns, spent, pending, total: spent + pending,
      pct: c.limitCents > 0 ? Math.round((spent + pending) * 100 / c.limitCents) : 0,
      plannedLow: plans.reduce((s, p) => s + p.lowCents, 0), plannedHigh: plans.reduce((s, p) => s + p.highCents, 0)
    };
  });
}

export function weekSpending(state, today, offset = 0) {
  const { start, end } = weekRange(today, offset);
  return state.txns.filter(t => countsAsSpending(t) && t.date >= start && t.date <= end).reduce((s, t) => s + t.amountCents, 0);
}
