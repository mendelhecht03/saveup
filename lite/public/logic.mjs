// Shared ledger rules. The server uses these to change data; the browser uses
// the read-only helpers to draw budgets. All money is integer cents, and a
// positive amount means money left the account (Plaid's convention).

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const INTERVALS = ['weekly', 'monthly', 'yearly'];
export const TRANSFER_KINDS = ['income', 'spending', 'own'];
const PRESETS = [
  ['🧴', 'Essentials', 'Everyday necessities like toiletries, cleaning and household basics', 5000, 'weekly'],
  ['🛒', 'Groceries', 'Food and drinks bought to eat at home', 7500, 'weekly'],
  ['🎡', 'Recreation', 'Eating out, entertainment, hobbies and fun', 4000, 'weekly'],
  ['✈️', 'Travel', 'Gas, transit, rideshares, parking and trips', 3000, 'weekly'],
  ['💆', 'Personal Care', 'Haircuts, cosmetics, pharmacy and health', 4000, 'monthly'],
  ['🏠', 'Housing', 'Rent, utilities and home repairs', 120000, 'monthly'],
  ['🎓', 'Education', 'Tuition, books and courses', 50000, 'yearly']
];

export function newState() {
  return {
    version: 1, items: [], accounts: {}, txns: [], plans: [], rules: {},
    categories: PRESETS.map(([emoji, name, description, limitCents, interval], i) => ({ id: `preset-${i}`, emoji, name, description, limitCents, interval }))
  };
}

// ---- dates (plain YYYY-MM-DD strings, computed in UTC so DST never shifts a day)
const toDate = s => new Date(`${s}T00:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function weekRange(today, offset = 0) {
  const start = addDays(today, -toDate(today).getUTCDay() + 7 * offset); // Sunday
  return { start, end: addDays(start, 6) };
}
export function periodRange(interval, today) {
  if (interval === 'weekly') return weekRange(today);
  const [y, m] = today.split('-').map(Number);
  if (interval === 'monthly') return { start: `${today.slice(0, 7)}-01`, end: iso(new Date(Date.UTC(y, m, 0))) };
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

// ---- classification
const TRANSFER_WORDS = /\b(zelle|venmo|paypal|cash ?app|transfer|xfer|wire)\b/i;
export const looksLikeTransfer = (name, pfc) => /^TRANSFER_(IN|OUT)$/.test(pfc || '') || TRANSFER_WORDS.test(name || '');
export const merchantKey = name => String(name || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(' ').slice(0, 3).join(' ');

// Pending money = bank says pending, or a hand-logged purchase still waiting for its bank match.
export const isPendingMoney = t => t.pending || (t.source === 'manual' && !t.verified);
export const countsAsSpending = t => t.reviewed && t.categoryId && (!t.transfer || t.transferKind === 'spending');

// A suggestion is only a hint. It never marks anything reviewed.
export function suggest(state, t) {
  const key = merchantKey(t.name);
  const rule = state.rules[`${key}|${t.amountCents}`] || state.rules[key];
  if (!rule) return null;
  if (rule.categoryId && !state.categories.some(c => c.id === rule.categoryId)) return null;
  return { ...rule, exact: Boolean(state.rules[`${key}|${t.amountCents}`]) };
}

export function budgetSummary(state, today) {
  return state.categories.map(c => {
    const { start, end } = periodRange(c.interval, today);
    const txns = state.txns.filter(t => countsAsSpending(t) && t.categoryId === c.id && t.date >= start && t.date <= end)
      .sort((a, b) => b.date.localeCompare(a.date));
    let spent = 0, pending = 0;
    for (const t of txns) isPendingMoney(t) ? pending += t.amountCents : spent += t.amountCents;
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

// ---- validation
const text = (value, label, max, required = true) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new InputError(`${label} is required.`);
  if (v.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)) throw new InputError(`${label} is too long or invalid.`);
  return v;
};
const cents = (value, label, { min = 0, allowNegative = false } = {}) => {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 100_000_000 || (!allowNegative && value < min)) throw new InputError(`${label} must be a valid amount.`);
  return value;
};
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || iso(toDate(value)) !== value) throw new InputError('Enter a valid date.');
  return value;
};
const findTxn = (state, id) => state.txns.find(t => t.id === id) || (() => { throw new InputError('Transaction not found.', 404); })();
const categoryOrNull = (state, id) => {
  if (id == null || id === '') return null;
  if (!state.categories.some(c => c.id === id)) throw new InputError('Pick an existing budget.');
  return id;
};

// ---- review
export function confirmTxn(state, { id, categoryId, transferKind, note, priority }) {
  const t = findTxn(state, id);
  const fields = { note: text(note, 'Comment', 500, false), priority: priority == null ? null : Number(priority) };
  if (fields.priority !== null && !(Number.isInteger(fields.priority) && fields.priority >= 1 && fields.priority <= 5)) throw new InputError('Priority must be 1–5.');
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
  Object.assign(t, fields, { reviewed: true, amountChanged: false });
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
}

// ---- budgets & plans
export function saveCategory(state, input, newId) {
  const fields = {
    emoji: text(input.emoji, 'Icon', 8), name: text(input.name, 'Name', 40),
    description: text(input.description, 'Description', 200), limitCents: cents(input.limitCents, 'Limit', { min: 1 })
  };
  if (!INTERVALS.includes(input.interval)) throw new InputError('Pick weekly, monthly or yearly.');
  fields.interval = input.interval;
  const existing = input.id && state.categories.find(c => c.id === input.id);
  if (input.id && !existing) throw new InputError('Budget not found.', 404);
  if (existing) return Object.assign(existing, fields);
  const c = { id: newId, ...fields };
  state.categories.push(c);
  return c;
}

// Deleting a budget sends its bank purchases back to the inbox rather than losing them.
export function deleteCategory(state, { id }) {
  if (!state.categories.some(c => c.id === id)) throw new InputError('Budget not found.', 404);
  if (state.txns.some(t => t.source === 'manual' && t.categoryId === id)) throw new InputError('Move or delete the hand-logged purchases in this budget first.');
  state.categories = state.categories.filter(c => c.id !== id);
  for (const t of state.txns) if (t.categoryId === id) Object.assign(t, { categoryId: null, reviewed: false });
  for (const p of state.plans) if (p.categoryId === id) p.categoryId = null;
  for (const [k, r] of Object.entries(state.rules)) if (r.categoryId === id) delete state.rules[k];
}

export function savePlan(state, input, newId) {
  const fields = {
    name: text(input.name, 'Item', 80), lowCents: cents(input.lowCents, 'Low estimate', { min: 1 }),
    highCents: cents(input.highCents, 'High estimate', { min: 1 }), categoryId: categoryOrNull(state, input.categoryId), essential: Boolean(input.essential)
  };
  if (fields.highCents < fields.lowCents) throw new InputError('The high estimate must be at least the low estimate.');
  const existing = input.id && state.plans.find(p => p.id === input.id);
  if (input.id && !existing) throw new InputError('Plan not found.', 404);
  if (existing) return Object.assign(existing, fields);
  const p = { id: newId, ...fields };
  state.plans.push(p);
  return p;
}

export function deletePlan(state, { id }) {
  state.plans = state.plans.filter(p => p.id !== id);
}

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
