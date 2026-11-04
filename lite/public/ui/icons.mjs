// Two kinds of icons. Line icons are only for controls (nav, chevrons, back,
// close). Everything that shows content (budgets, purchases, empty states) uses
// a 3D "art" icon on a soft tile. Until the real 3D images exist, art icons are
// emoji placeholders; adding a key to REAL_ART switches it to /icons/3d/<key>.png.

const path = {
  inbox: '<path d="M4 13.5 6.2 6.6A2 2 0 0 1 8.1 5.2h7.8a2 2 0 0 1 1.9 1.4L20 13.5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20"/>',
  budgets: '<path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5z"/><path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15z"/>',
  planned: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16M8.5 14h2M13.5 14h2"/>',
  more: '<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  back: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  camera: '<path d="M4 8.5A2 2 0 0 1 6 6.5h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.6" r="3.4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m15.5 15.5 4 4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6" fill="currentColor"/>',
  check: '<path d="m5.5 12.5 4.2 4.2 8.8-9.4"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5v4h-4"/>',
  file: '<path d="M7 3.5h6.5L18 8v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13 3.5V8h5M9 12.5h6M9 16h6"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m5 17 4.5-4.5 3 3 2.5-2.5L19.5 17.5"/>',
  pencil: '<path d="m15 5.5 3.5 3.5L9 18.5H5.5V15z"/><path d="m13 7.5 3.5 3.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1-1"/>',
  alert: '<path d="M12 4.5 20.5 19h-17z"/><path d="M12 10v4.2"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  sparkle: '<path d="M12 4.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5z"/><path d="M18.5 15.5c.2 1.3.7 1.8 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.2 1.8-.7 2-2z"/>'
};

export function line(name, { size = 22, label } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="line-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${path[name] || ''}</svg>`;
}

// key: [placeholder emoji, tile tint, what the final 3D icon should show]
export const ART = {
  groceries: ['🧺', 'green', 'a woven grocery basket with fresh vegetables'],
  recreation: ['🎮', 'lavender', 'a rounded game controller'],
  'personal-care': ['🧴', 'pink', 'a pump lotion bottle'],
  housing: ['🏠', 'peach', 'a small cozy house'],
  household: ['🧽', 'yellow', 'a spray bottle and sponge'],
  travel: ['✈️', 'sky', 'a small airplane'],
  education: ['🎓', 'lavender', 'a graduation cap on a book'],
  clothing: ['👕', 'sky', 'a folded t-shirt'],
  dining: ['🍽️', 'peach', 'a plate with fork and knife'],
  coffee: ['☕', 'peach', 'a coffee cup with steam'],
  transportation: ['🚗', 'sky', 'a small rounded car'],
  gas: ['⛽', 'yellow', 'a fuel pump'],
  health: ['💊', 'pink', 'a medicine capsule'],
  gifts: ['🎁', 'pink', 'a wrapped gift box with a bow'],
  pets: ['🐾', 'yellow', 'a paw print on a pet bowl'],
  phone: ['📱', 'sky', 'a smartphone'],
  utilities: ['💡', 'yellow', 'a glowing light bulb'],
  other: ['💠', 'gray', 'three soft rounded dots'],
  store: ['🏪', 'sky', 'a small storefront with an awning'],
  shopping: ['🛍️', 'lavender', 'a shopping bag'],
  bank: ['🏦', 'sky', 'a bank building with columns'],
  card: ['💳', 'sky', 'a payment card'],
  cash: ['💵', 'green', 'a folded banknote and a coin'],
  transfer: ['🔁', 'slate', 'two arrows passing each other'],
  person: ['🙂', 'mint', 'a friendly person bust'],
  income: ['💰', 'green', 'a money bag'],
  refund: ['↩️', 'mint', 'a box with a return arrow'],
  subscription: ['🗓️', 'lavender', 'a calendar with a repeat arrow'],
  atm: ['🏧', 'green', 'an ATM with a banknote coming out'],
  receipt: ['🧾', 'gray', 'a paper receipt'],
  music: ['🎵', 'sky', 'a music note'],
  streaming: ['▶️', 'lavender', 'a play button screen'],
  cloud: ['☁️', 'sky', 'a soft cloud'],
  guitar: ['🎸', 'peach', 'an acoustic guitar'],
  goal: ['🐷', 'pink', 'a piggy bank'],
  iou: ['🤝', 'mint', 'two hands shaking'],
  returns: ['📦', 'peach', 'a parcel box with a return arrow'],
  'inbox-done': ['✅', 'mint', 'a check mark on a soft badge'],
  empty: ['🔍', 'gray', 'a magnifying glass'],
  'scan-receipt': ['📷', 'sky', 'a camera over a receipt']
};
export const REAL_ART = new Set();
export const ART_KEYS = Object.keys(ART);

// Budgets created before art keys existed only have an emoji; keep showing it.
export function artFor(key, fallbackEmoji) {
  const art = ART[key];
  if (!art) return { emoji: fallbackEmoji || ART.other[0], tint: 'gray', key: 'other' };
  return { emoji: art[0], tint: art[1], key, real: REAL_ART.has(key) };
}
