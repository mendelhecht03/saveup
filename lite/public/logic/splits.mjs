// Splitting one purchase across budgets, and spreading tax across receipt lines.
// Every amount is integer cents and every split sums exactly to its total.

// Share `totalCents` across `weights` in proportion, so the parts always add up
// exactly. Leftover cents go to the largest remainders (ties: the earlier line).
export function shareCents(totalCents, weights) {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!weights.length) return [];
  if (sum === 0) return weights.map((_, i) => (i === 0 ? totalCents : 0));
  const sign = Math.sign(totalCents) || 1, abs = Math.abs(totalCents);
  const raw = weights.map(w => (abs * Math.max(0, w)) / sum);
  const parts = raw.map(Math.floor);
  let left = abs - parts.reduce((s, p) => s + p, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k][1]]++;
  return parts.map(p => p * sign);
}

// Each line's amount with its share of the tax, so a budget carries the real cost.
// An ADJUSTMENT line (the difference from the bank charge) takes no tax.
export const ADJUSTMENT = 'ADJUSTMENT';
export function withTax(lines, taxCents) {
  const shares = shareCents(taxCents, lines.map(l => (l.code === ADJUSTMENT ? 0 : l.amountCents)));
  return lines.map((l, i) => ({ ...l, totalCents: l.amountCents + shares[i] }));
}

// Group receipt lines by budget: [{ categoryId, amountCents }], largest first.
// Lines without a budget are grouped under categoryId null.
export function breakdown(lines, taxCents = 0) {
  const sums = new Map();
  for (const l of withTax(lines, taxCents)) sums.set(l.categoryId || null, (sums.get(l.categoryId || null) || 0) + l.totalCents);
  return [...sums].map(([categoryId, amountCents]) => ({ categoryId, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
}

// How much of a purchase each budget gets. A purchase with splits counts per
// split; otherwise its whole amount goes to its one budget.
export const portions = t => (t.splits?.length ? t.splits : t.categoryId ? [{ categoryId: t.categoryId, amountCents: t.amountCents }] : []);
