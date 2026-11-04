// Screens that are drawn but not wired up yet: real layouts with sample data,
// clearly marked "Preview". They show where SaveUp is going without pretending
// to work. Every piece comes from the component set.
import { pageHeader, card, listSection, row, button, statusPill, pills, banner, note, segmented, iconTile, budgetBar, barLegend, percentOf, money, moneyShort, esc } from '../ui/components.mjs';

const back = (title, sub) => pageHeader({ back: 'More', backAct: 'go-more', title, sub });
const preview = what => banner('Preview', `Sample data. ${what} isn’t connected to your purchases yet.`, { tone: 'info', icon: 'info' });
const off = label => button(label, { variant: 'secondary', full: true, disabled: true });

// ---- subscriptions (board 09, screen 26)
const SUBS = [
  { name: 'Music service', icon: 'music', cents: 1200, every: 'month', paid: 'Visa •••• 4242', last: 'Oct 12, 2026', status: 'confirmed' },
  { name: 'Cloud storage', icon: 'cloud', cents: 300, every: 'month', paid: 'Checking •••• 6789', last: 'Oct 5, 2026', status: 'confirmed' },
  { name: 'Video service', icon: 'streaming', cents: 1500, every: 'month', paid: 'Mastercard •••• 5555', last: 'Oct 8, 2026', status: 'detected' }
];
const PAST_SUBS = [{ name: 'Fitness app', icon: 'subscription', cents: 999, every: 'month', paid: 'Visa •••• 4242', last: 'Aug 2, 2026', status: 'ended' }];

export function subscriptionsScreen({ ui }) {
  const tab = ui.subsTab === 'past' ? 'past' : 'active';
  const list = tab === 'past' ? PAST_SUBS : SUBS;
  const confirmed = SUBS.filter(s => s.status === 'confirmed').reduce((a, s) => a + s.cents, 0);
  const suggested = SUBS.filter(s => s.status === 'detected').reduce((a, s) => a + s.cents, 0);
  const estimate = card(`<div class="stack"><small class="muted">Next month estimate</small><b class="hero-amount">${moneyShort(confirmed + suggested)}</b>
    ${budgetBar({ limit: confirmed + suggested, spent: confirmed, pending: suggested })}
    ${barLegend([{ kind: 'spent', label: 'Confirmed', cents: confirmed }, { kind: 'pending', label: 'Suggested, not confirmed', cents: suggested }], { layout: 'rows' })}</div>`);
  const sub = s => card(`<div class="stack"><div class="sub-head">${iconTile(s.icon, { size: 'md' })}<span class="grow"><b class="sub-name">${esc(s.name)}</b>
      <span>${money(s.cents)} / ${s.every}</span><small class="muted">${esc(s.paid)}</small>
      ${pills([s.status === 'confirmed' ? statusPill('Confirmed', 'ok') : s.status === 'ended' ? statusPill('Ended', 'info') : statusPill('Needs confirmation', 'warn', { icon: 'alert' })])}</span></div>
    <small class="muted">Last charge ${esc(s.last)}</small>
    ${s.status === 'ended' ? '' : s.status === 'detected' ? off('Confirm subscription') : off('Mark ended')}</div>`, { tag: 'article' });
  return `${back('Subscriptions')}${preview('Subscription tracking')}
    <div class="tabs">${segmented('subs-tab', [['active', 'Active'], ['past', 'Past']], { value: tab })}</div>
    ${tab === 'active' ? estimate : ''}${list.map(sub).join('')}
    ${note('SaveUp can’t cancel a service for you. Mark it ended once you have.', { tone: 'plain' })}`;
}

// ---- IOUs: who owes whom, from transfers you marked as a loan or a shared bill
const IOUS = [
  { person: 'David Cohen', cents: -4500, what: 'Dinner at Cava, split two ways', date: 'Oct 29', status: 'paid back', via: 'Zelle from David · $45.00' },
  { person: 'Josh Levy', cents: 6000, what: 'Concert tickets', date: 'Oct 22', status: 'open' },
  { person: 'Sarah', cents: -2250, what: 'Groceries for the trip', date: 'Oct 18', status: 'open' }
];
export function iousScreen() {
  const open = IOUS.filter(i => i.status === 'open');
  const owedToYou = open.filter(i => i.cents < 0).reduce((a, i) => a - i.cents, 0);
  const youOwe = open.filter(i => i.cents > 0).reduce((a, i) => a + i.cents, 0);
  const rowFor = i => row({ icon: 'person', title: i.person, sub: `${i.what} · ${i.date}`, amount: i.cents < 0 ? `+${money(-i.cents)}` : money(i.cents), amountTone: i.cents < 0 ? 'in' : null,
    pillList: [i.status === 'open' ? statusPill(i.cents < 0 ? 'Owes you' : 'You owe', i.cents < 0 ? 'blue' : 'warn') : statusPill('Paid back', 'ok', { icon: 'check' })], chevron: false, tag: 'div' });
  return `${back('IOUs')}${preview('IOU tracking')}
    <div class="two">${card(`<small class="muted">Owed to you</small><b class="hero-amount amount-in">${money(owedToYou)}</b>`)}${card(`<small class="muted">You owe</small><b class="hero-amount">${money(youOwe)}</b>`)}</div>
    ${listSection({ title: 'Open', rows: open.map(rowFor) })}
    ${listSection({ title: 'Settled', rows: IOUS.filter(i => i.status !== 'open').map(rowFor), footer: '<small class="muted">The Zelle from David was linked as a payback, so it isn’t counted as income.</small>' })}
    ${off('Add an IOU')}
    ${note('A payback cancels out what you fronted. It never counts as income.', { tone: 'plain' })}`;
}

// ---- goals (board 08, screens 22–23)
export function goalsScreen() {
  const target = 30000, saved = 6000;
  return `${pageHeader({ back: 'Planned', backAct: 'go-planned', title: 'Goals' })}${preview('Saving toward a goal')}
    ${card(`<div class="goal-head">${iconTile('guitar', { size: 'lg' })}<span class="grow"><b class="plan-name">Guitar</b>
      <span><b>${moneyShort(saved)}</b> set aside of ${moneyShort(target)}</span>
      ${budgetBar({ limit: target, spent: saved })}<small class="muted">${percentOf(saved, target)}% · ${moneyShort(target - saved)} to target</small></span></div>`)}
    ${card(`<div class="stack"><b class="section-label">Put this week’s $20 toward a goal?</b>
      <p class="muted">Groceries, Oct 18 – 24: $100 budget, $80 spent, $20 left.</p>
      ${row({ icon: 'guitar', title: 'Guitar', sub: 'Previous $40 · new total $60', chevron: false, tag: 'div' })}
      ${off('Put $20 toward Guitar')}<small class="muted center">Reallocates your plan. No bank transfer.</small></div>`)}
    ${listSection({ title: 'Allocation history', rows: [
      row({ icon: 'groceries', title: 'From Groceries', sub: 'Oct 24, 2026', amount: '+$20', amountTone: 'in', chevron: false, tag: 'div' }),
      row({ icon: 'groceries', title: 'Earlier allocation', sub: 'Oct 17, 2026', amount: '+$40', amountTone: 'in', chevron: false, tag: 'div' })] })}
    ${note('These are budget reallocations, not bank transfers. When you buy the guitar, the purchase replaces the plan and anything unused is released.')}`;
}

// ---- cash withdrawal split: an ATM withdrawal becomes the cash purchases it paid for
export function cashScreen() {
  const parts = [['dining', 'Corner Cafe', 'Recreation', 1200], ['groceries', 'Farmers market', 'Groceries', 3000], ['gifts', 'Birthday card', 'Personal Care', 650]];
  const used = parts.reduce((a, p) => a + p[3], 0), total = 10000;
  return `${back('Cash withdrawals')}${preview('Splitting cash')}
    ${card(`<div class="review-head">${iconTile('atm', { size: 'md', round: true })}<span class="grow"><b class="review-name">ATM withdrawal</b><small class="muted">Oct 28 · Checking •••• 0721</small>${pills([statusPill('Posted', 'ok'), statusPill('Between my accounts', 'info')])}</span><b class="review-amount">$100.00</b></div>`)}
    <p class="muted">Taking cash out isn’t spending. Spending happens when you use the cash, so add what it paid for.</p>
    ${listSection({ title: 'Spent from this cash', rows: parts.map(([icon, name, budget, c]) => row({ icon, title: name, sub: budget, amount: money(c), chevron: false, tag: 'div' })),
      footer: `<span class="split-total"><b>Still in your wallet</b><b>${money(total - used)}</b></span>` })}
    ${off('Add a cash purchase')}`;
}

// ---- returns
export function returnsScreen() {
  return `${back('Returns')}${preview('Return tracking')}
    ${listSection({ title: 'Waiting for a refund', rows: [
      row({ icon: 'returns', title: 'SanDisk 1TB SSD', sub: 'Best Buy · returned Nov 1', amount: '$79.99', pillList: [statusPill('Refund pending', 'warn', { icon: 'clock' })], chevron: false, tag: 'div' })] })}
    ${listSection({ title: 'Return window open', rows: [
      row({ icon: 'clothing', title: 'All in Motion leggings', sub: 'Target · return by Nov 29', amount: '$25.00', pillList: [statusPill('26 days left', 'blue')], chevron: false, tag: 'div' })] })}
    ${listSection({ title: 'Refunded', rows: [
      row({ icon: 'refund', title: 'Goodfellow socks', sub: 'Target · refund matched Oct 31', amount: '+$15.00', amountTone: 'in', pillList: [statusPill('Matched', 'ok', { icon: 'link' })], chevron: false, tag: 'div' })] })}
    ${note('A refund goes back to the budget the item came from, so it isn’t counted as income.', { tone: 'plain' })}`;
}

// ---- settings (board 09, screen 27). Accounts and budgets link to the real screens.
export function settingsScreen({ S }) {
  const soon = (icon, title, sub) => row({ icon, title, sub, pillList: [statusPill('Preview', 'info')], chevron: false, tag: 'div' });
  return `${back('Settings')}
    ${listSection({ title: 'Your setup', rows: [
      row({ icon: 'bank', title: 'Accounts', sub: `${S.items.length} bank${S.items.length === 1 ? '' : 's'} connected`, act: 'go', data: { to: 'more/accounts' } }),
      row({ icon: 'other', title: 'Spending categories', sub: `${S.categories.length} budgets`, act: 'go', data: { to: 'budgets' } }),
      row({ icon: 'subscription', title: 'Review week', sub: 'Starts Sunday', chevron: false, tag: 'div' })] })}
    ${listSection({ title: 'Coming later', rows: [
      soon('other', 'Suggestions & remembered rules', `${Object.keys(S.rules).length} remembered choices`),
      soon('other', 'Priority tags', 'Low, Normal, High, Essential'),
      soon('other', 'Notifications', 'Weekly review reminder'),
      soon('bank', 'Data & connections', 'Export or delete your data')] })}
    <p class="muted center"><small>Assistant access · Future concept</small></p>`;
}

export const PREVIEW_MENU = [
  ['Subscriptions', 'Recurring charges together', 'subscription', 'more/subscriptions'],
  ['IOUs', 'Who owes whom', 'iou', 'more/ious'],
  ['Cash withdrawals', 'Split ATM cash into what it paid for', 'atm', 'more/cash'],
  ['Returns', 'Refunds you’re waiting for', 'returns', 'more/returns']
];
