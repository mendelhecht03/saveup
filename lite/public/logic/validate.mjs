import { InputError } from './state.mjs';
const toDate = s => new Date(`${s}T00:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);
// ---- validation
export const text = (value, label, max, required = true) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new InputError(`${label} is required.`);
  if (v.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(v)) throw new InputError(`${label} is too long or invalid.`);
  return v;
};
export const cents = (value, label, { min = 0, allowNegative = false } = {}) => {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 100_000_000 || (!allowNegative && value < min)) throw new InputError(`${label} must be a valid amount.`);
  return value;
};
export const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || iso(toDate(value)) !== value) throw new InputError('Enter a valid date.');
  return value;
};
export const findTxn = (state, id) => state.txns.find(t => t.id === id) || (() => { throw new InputError('Transaction not found.', 404); })();
export const categoryOrNull = (state, id) => {
  if (id == null || id === '') return null;
  if (!state.categories.some(c => c.id === id)) throw new InputError('Pick an existing budget.');
  return id;
};
