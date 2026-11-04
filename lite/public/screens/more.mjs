// More: accounts, history, the Sandbox test lab and the design-system gallery.
import { pageHeader, listSection, row, button, statusPill, emptyState, card, banner, searchField, textField, moneyField, selectField, segmented, esc, note, money } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { txnRow, byDate, longDate, accountLabel } from './shared.mjs';

const ago = iso => {
  if (!iso) return 'Not synced yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return `Updated ${m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`}`;
};

export function moreScreen({ S, ai }) {
  const banks = S.items.map(i => row({ icon: 'bank', title: i.name, sub: i.error ? 'Connection needs attention' : ago(i.lastSync), pillList: i.error ? [statusPill('Needs attention', 'danger')] : [], act: 'go', data: { id: i.id, to: 'more/accounts' } }));
  const menu = [
    ['History', 'Search every purchase', 'receipt', 'more/history'],
    ['Test lab', 'Send fake charges through Plaid Sandbox', 'store', 'more/lab'],
    ['Design system', 'Every SaveUp component in one place', 'other', 'more/gallery']
  ].map(([title, sub, icon, to]) => row({ icon, title, sub, act: 'go', data: { to } }));
  return `${pageHeader({ title: 'More' })}
    ${listSection({ title: 'Accounts', action: button('Manage', { variant: 'secondary', size: 'sm', act: 'go', data: { to: 'more/accounts' } }), rows: banks.length ? banks : [row({ icon: 'bank', title: 'Connect a bank', sub: 'Secure connection through Plaid', act: 'go', data: { to: 'more/accounts' } })] })}
    ${listSection({ rows: menu })}
    ${listSection({ rows: [row({ icon: 'other', title: 'AI suggestions', sub: ai ? 'Suggests a budget for new purchases. You still confirm each one.' : 'Off. Add ANTHROPIC_API_KEY to lite/.env.local and restart.',
      pillList: [ai ? statusPill('On', 'ok') : statusPill('Off', 'info')], chevron: Boolean(ai), act: ai ? 'ai-suggest' : null, tag: ai ? 'button' : 'div' })] })}
    ${note('Plaid Sandbox only: fictional banks, no real money.', { tone: 'plain' })}`;
}

export function accountsScreen({ S, configured }) {
  const banks = S.items.map(i => {
    const accounts = Object.values(S.accounts).filter(a => a.itemId === i.id);
    return listSection({ title: i.name, subtitle: ago(i.lastSync), icon: 'refresh', action: button('Remove', { variant: 'danger', size: 'sm', act: 'remove-item', data: { id: i.id } }),
      rows: accounts.map(a => row({ icon: /card|credit/i.test(a.name) ? 'card' : /saving/i.test(a.name) ? 'goal' : 'bank', title: a.name, sub: a.mask ? `•••• ${a.mask}` : '', chevron: false, tag: 'div' })),
      footer: i.error ? `<p class="note note-warn">${line('alert', { size: 18 })}<span>${esc(i.error)}</span></p>` : '' });
  }).join('');
  return `${pageHeader({ back: 'More', backAct: 'go-more', title: 'Accounts', action: S.items.length ? button('Sync', { variant: 'secondary', size: 'sm', icon: 'refresh', act: 'sync' }) : '' })}
    ${!configured ? banner('Plaid keys are missing', 'Add Sandbox keys to lite/.env.local and restart the app.') : ''}
    ${banks || emptyState({ icon: 'bank', title: 'No banks connected', text: 'Connect a Plaid Sandbox bank to bring in test purchases.' })}
    ${card(`<div class="stack">${button('Add instant test bank', { act: 'instant', full: true })}${button('Connect with Plaid Link', { variant: 'ghost', act: 'link', full: true })}
      <p class="muted"><small>Link test login: <b>user_transactions_dynamic</b> with any password. Pull down on any screen to refresh. Banks also sync on their own at least once a day.</small></p></div>`)}`;
}

export function historyHits(S, search) {
  const q = search.trim().toLowerCase();
  return S.txns.filter(t => !q || [t.name, t.note, S.categories.find(c => c.id === t.categoryId)?.name, money(Math.abs(t.amountCents)), accountLabel(S, t)]
    .some(v => String(v || '').toLowerCase().includes(q))).sort(byDate);
}
export const historyScreen = ({ S, ui }) => `${pageHeader({ back: 'More', backAct: 'go-more', title: 'History' })}
    ${searchField('search', { value: ui.search, placeholder: 'Merchant, budget, note or amount' })}
    <div id="history-list">${historyList(S, historyHits(S, ui.search))}</div>`;
export function historyList(S, hits) {
  if (!hits.length) return emptyState({ icon: 'empty', title: S.txns.length ? 'No matches' : 'No purchases yet', text: S.txns.length ? 'Try a merchant, a budget or an amount.' : '' });
  const days = new Map();
  for (const t of hits.slice(0, 300)) days.set(t.date, [...(days.get(t.date) || []), t]);
  return [...days].map(([d, ts]) => listSection({ title: longDate(d), rows: ts.map(t => txnRow(S, t)) })).join('');
}

const PRESETS = [["Kahan's", 253], ['Zelle to Sam', 4000], ['Zelle from Mom', -10000], ['Shell gas', 3820], ['Trader Joes', 6417]];
export function labScreen({ S }) {
  return `${pageHeader({ back: 'More', backAct: 'go-more', title: 'Test lab', sub: 'Send a fake charge through Plaid Sandbox, then watch it land in your inbox.' })}
    ${!S.items.length ? emptyState({ icon: 'bank', title: 'Add a test bank first', action: button('Go to accounts', { act: 'go', data: { to: 'more/accounts' } }) }) : card(`<form data-form="charge" class="stack-lg">
      <div class="chip-row">${PRESETS.map(([d, c]) => `<button type="button" class="chip tint-sky" data-act="preset" data-d="${esc(d)}" data-a="${c}">${esc(d)} ${c < 0 ? '+' : ''}${money(Math.abs(c))}</button>`).join('')}</div>
      ${selectField('itemId', 'Bank', S.items.map(i => [i.id, i.name]))}
      ${textField('description', 'Description', { required: true, max: 60, placeholder: "e.g. Kahan's" })}
      ${moneyField('amount', 'Amount')}
      ${segmented('dir', [['out', 'Money out'], ['in', 'Money in']], { value: 'out', legend: 'Direction' })}
      ${textField('daysAgo', 'Days ago', { value: '0', type: 'number', max: 2, inputmode: 'numeric' })}
      ${button('Send to Plaid', { type: 'submit', full: true })}
      <p class="muted"><small>Only works for the <b>user_transactions_dynamic</b> test user. Plaid rate-limits it.</small></p></form>`)}`;
}
