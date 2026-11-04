// Saved-data shape, presets and the error type every rule throws.
export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const INTERVALS = ['weekly', 'monthly', 'yearly'];
export const TRANSFER_KINDS = ['income', 'spending', 'own'];
// "Essential" is a priority tag on a purchase, not a budget, so one purchase never
// has to choose between Groceries and Essentials.
export const PRIORITIES = ['Low', 'Normal', 'High', 'Essential'];
export const ESSENTIAL = PRIORITIES.length;
const PRESETS = [
  ['🛒', 'Groceries', 'Food and drinks bought to eat at home', 7500, 'weekly'],
  ['🎡', 'Recreation', 'Eating out, entertainment, hobbies and fun', 4000, 'weekly'],
  ['✈️', 'Travel', 'Gas, transit, rideshares, parking and trips', 3000, 'weekly'],
  ['💆', 'Personal Care', 'Haircuts, cosmetics, pharmacy and health', 4000, 'monthly'],
  ['🏠', 'Housing', 'Rent, utilities and home repairs', 120000, 'monthly'],
  ['🎓', 'Education', 'Tuition, books and courses', 50000, 'yearly']
];

export function newState() {
  return {
    version: 3, items: [], accounts: {}, txns: [], plans: [], rules: {}, receipts: [], itemNames: {},
    categories: PRESETS.map(([emoji, name, description, limitCents, interval], i) => ({ id: `preset-${i + 1}`, emoji, name, description, limitCents, interval }))
  };
}

// Bring older saved data up to date. Safe to run on every load.
export function upgradeState(state) {
  const old = state.categories.find(c => c.id === 'preset-0' && c.name === 'Essentials');
  if (old) Object.assign(old, { emoji: '🧽', name: 'Household', description: 'Cleaning supplies, toiletries and home basics' });
  for (const t of state.txns) if (t.priority > ESSENTIAL) t.priority = ESSENTIAL;
  state.receipts ||= [];
  state.itemNames ||= {};
  state.version = 3;
  return state;
}
