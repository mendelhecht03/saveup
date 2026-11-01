// Shared by the browser and Node tests. Imported bank amounts remain integer cents.
export function isFullWeek(range) {
  if (!range.start || !range.end) return false;
  const start = new Date(range.start + 'T12:00:00Z'), end = new Date(range.end + 'T12:00:00Z');
  return start.getUTCDay() === 0 && (end - start) / 86400000 === 6;
}

export function budgetTotals(transactions, budgets, range) {
  const rows = transactions.filter(t => (!range.start || t.date >= range.start) && (!range.end || t.date <= range.end));
  const confirmed = rows.filter(t => t.reviewed && t.currency === 'USD');
  const expenses = confirmed.filter(t => t.kind === 'purchase' || t.classification === 'expense');
  const sum = list => list.reduce((total, t) => total + t.amount, 0);
  const categories = budgets.map(budget => {
    const purchases = expenses.filter(t => t.category === budget.name);
    const posted = sum(purchases.filter(t => t.status === 'posted'));
    const pending = sum(purchases.filter(t => t.status === 'pending'));
    const spent = posted + pending;
    return { ...budget, posted, pending, spent, remaining: budget.limitCents - spent, percent: spent / budget.limitCents * 100,
      transactions: purchases };
  });
  return { categories, spent: sum(expenses), pending: sum(expenses.filter(t => t.status === 'pending')),
    income: sum(confirmed.filter(t => t.classification === 'income')), unreviewed: rows.filter(t => !t.reviewed).length };
}
