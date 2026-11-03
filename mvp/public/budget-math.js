// Shared by the browser and Node tests. Imported bank amounts remain integer cents.
export function isFullWeek(range) {
  if (!range.start || !range.end) return false;
  const start = new Date(range.start + 'T12:00:00Z'), end = new Date(range.end + 'T12:00:00Z');
  return start.getUTCDay() === 0 && (end - start) / 86400000 === 6;
}

// Divides an amount between the budgets of its receipt lines, in proportion to each budget's items.
// Tax, tip and any bank difference are shared the same way; the parts always add up to the amount exactly.
// Lines without their own category belong to the purchase's category (fallback).
export function splitByCategory(amount, items = [], fallback = '') {
  const totals = new Map();
  for (const item of items) totals.set(item.category || fallback, (totals.get(item.category || fallback) || 0) + item.amountCents);
  const weights = [...totals].filter(([, cents]) => cents > 0);
  const weight = weights.reduce((sum, [, cents]) => sum + cents, 0);
  if (weights.length < 2 || !weight) return [{ category: weights[0]?.[0] || fallback, amount }];
  const parts = weights.map(([category, cents]) => ({ category, amount: Math.floor(amount * cents / weight), rest: amount * cents % weight }));
  let left = amount - parts.reduce((sum, part) => sum + part.amount, 0);
  for (const part of [...parts].sort((a, b) => b.rest - a.rest)) { if (!left) break; part.amount += 1; left -= 1; }
  return parts.map(({ category, amount }) => ({ category, amount }));
}
const split = (row, items, fallback) => {
  const parts = splitByCategory(row.amount, items, fallback);
  return parts.length < 2 ? [{ ...row, category: parts[0].category }] : parts.map(part => ({ ...row, ...part, total: row.amount, split: true }));
};

// Receipts without a bank charge count too: "watching" ones as unverified, "cash" ones as settled.
// A matched receipt becomes "linked" and is counted only through its bank transaction.
export function receiptSpending(receipts = []) {
  return receipts.filter(r => r.status === 'watching' || r.status === 'cash').flatMap(r => split({ id: r.id, entryId: r.id, receipt: true, name: r.merchant, date: r.date,
    amount: r.totalCents, currency: 'USD', category: r.category, kind: 'purchase', reviewed: true, status: r.status === 'cash' ? 'cash' : 'unverified', account: r.status === 'cash' ? 'Logged by you' : 'Waiting for the bank' }, r.items, r.category));
}
export function budgetTotals(transactions, budgets, range, receipts = []) {
  const inRange = t => (!range.start || t.date >= range.start) && (!range.end || t.date <= range.end);
  const rows = transactions.filter(inRange);
  const confirmed = rows.filter(t => t.reviewed && t.currency === 'USD');
  const linked = new Map(receipts.filter(r => r.status === 'linked').map(r => [r.transactionId, r]));
  // A reviewed bank charge with an itemized receipt counts toward each line's budget, using the bank amount.
  const charges = confirmed.filter(t => t.kind === 'purchase' || t.classification === 'expense').flatMap(t => linked.has(t.id) ? split(t, linked.get(t.id).items, t.category) : [t]);
  const expenses = [...charges, ...receiptSpending(receipts).filter(inRange)];
  const sum = list => list.reduce((total, t) => total + t.amount, 0);
  const categories = budgets.map(budget => {
    const purchases = expenses.filter(t => t.category === budget.name);
    const posted = sum(purchases.filter(t => t.status === 'posted' || t.status === 'cash'));
    const pending = sum(purchases.filter(t => t.status === 'pending'));
    const unverified = sum(purchases.filter(t => t.status === 'unverified'));
    const spent = posted + pending + unverified;
    return { ...budget, posted, pending, unverified, spent, remaining: budget.limitCents - spent, percent: spent / budget.limitCents * 100,
      transactions: purchases };
  });
  return { categories, spent: sum(expenses), pending: sum(expenses.filter(t => t.status === 'pending')), unverified: sum(expenses.filter(t => t.status === 'unverified')),
    income: sum(confirmed.filter(t => t.classification === 'income')), unreviewed: rows.filter(t => !t.reviewed).length };
}
