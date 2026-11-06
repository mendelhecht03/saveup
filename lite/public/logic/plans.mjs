// Creating and editing budgets and planned purchases.
import { InputError, INTERVALS } from './state.mjs';
import { text, cents, categoryOrNull } from './validate.mjs';
// ---- budgets & plans
export function saveCategory(state, input, newId) {
  const fields = {
    emoji: text(input.emoji, 'Icon', 8), name: text(input.name, 'Name', 40),
    description: text(input.description, 'Description', 200), limitCents: cents(input.limitCents, 'Limit', { min: 1 })
  };
  if (!INTERVALS.includes(input.interval)) throw new InputError('Pick weekly, monthly or yearly.');
  fields.interval = input.interval;
  fields.group = text(input.group, 'Group', 30, false);
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
