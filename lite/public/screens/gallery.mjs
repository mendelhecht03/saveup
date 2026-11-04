// Every component with sample data, so the design system can be checked in one place.
import * as C from '../ui/components.mjs';
import { ART_KEYS, line } from '../ui/icons.mjs';

const section = (title, body) => `<section class="stack"><h2 class="section-label">${title}</h2>${body}</section>`;

export function galleryScreen() {
  return `${C.pageHeader({ back: 'More', backAct: 'go-more', title: 'Design system', sub: 'Sample data. Every screen is built from these pieces.' })}
  ${section('Buttons', C.card(`<div class="stack">${C.button('Confirm & next', { full: true, size: 'lg' })}<div class="btn-row">${C.button('Add purchase', { icon: 'plus' })}${C.button('Scan receipt', { icon: 'camera', variant: 'ghost' })}</div>
    <div class="chip-row">${C.button('Edit', { variant: 'secondary', size: 'sm' })}${C.button('Remove', { variant: 'danger', size: 'sm' })}${C.iconButton('plus', 'Add', { variant: 'primary' })}${C.link('Show all 8')}</div></div>`))}
  ${section('Status pills and chips', C.card(`<div class="chip-row">${C.statusPill('Posted', 'ok')}${C.statusPill('Pending', 'warn')}${C.statusPill('Reviewed', 'ok', { icon: 'check' })}${C.statusPill('Needs review', 'info')}${C.statusPill('Needs purpose', 'warn')}${C.statusPill('Awaiting bank match', 'blue', { icon: 'clock' })}</div>
    <div class="chip-row" style="margin-top:12px">${C.categoryChip('Groceries', 'green')}${C.categoryChip('Recreation', 'mint')}${C.categoryChip('Education', 'lavender')}${C.categoryChip('Personal Care', 'pink', { dropdown: true })}</div>
    <div class="chip-row" style="margin-top:12px">${C.categoryChip('Groceries', 'green', { suggested: true })}<small class="muted">Suggested, not confirmed</small></div>
    <div class="chip-row" style="margin-top:8px">${C.categoryChip('Groceries', 'green', { confirmed: true })}<small class="muted">Reviewed by you</small></div>`))}
  ${section('Budget bar', C.card(`<div class="stack">${C.budgetBar({ limit: 50000, spent: 10000, pending: 4000, planned: 30000 }, { size: 'lg', id: 'gallery-1' })}
    ${C.barLegend([{ kind: 'spent', pct: 20, cents: 10000, label: 'Spent' }, { kind: 'pending', pct: 8, cents: 4000, label: 'Pending' }, { kind: 'planned', pct: 60, cents: 30000, label: 'Planned' }, { kind: 'left', pct: 12, cents: 6000, label: 'Left' }])}
    ${C.budgetBar({ limit: 20000, spent: 21000 }, { id: 'gallery-2' })}<p class="bar-caption"><span>$210 / $200</span><span class="amount-over">105%</span></p></div>`))}
  ${section('List section', C.listSection({ title: '8 familiar suggestions', subtitle: 'These look like your usual purchases.', icon: 'check', iconTone: 'mint', rows: [
    C.row({ icon: 'groceries', title: 'Grocery Market', sub: 'Oct 26 · Posted', chip: C.categoryChip('Groceries', 'green', { suggested: true }), amount: '$52.18', chevron: false, swipe: { confirm: 'Confirm Groceries', scan: 'Scan receipt' }, data: { id: 'g1' } }),
    C.row({ icon: 'coffee', title: 'Cafe', sub: 'Oct 26 · Posted', chip: C.categoryChip('Recreation', 'mint'), amount: '$4.75', chevron: false }),
    C.row({ icon: 'transfer', title: 'Zelle Payment', sub: 'Oct 25 · Posted', chip: C.statusPill('Needs purpose', 'warn'), amount: '$200.00', chevron: false })
  ], footer: C.link('Show all 8') }))}
  ${section('Banners and notes', `${C.banner('$150 awaiting category review', 'Budget room is provisional.', { act: 'noop' })}${C.note('Pending spending already reduces what is left.')}`)}
  ${section('Form fields', C.card(`<div class="stack-lg">${C.moneyField('g-amount', 'Amount', { cents: 1200, big: true })}${C.textField('g-merchant', 'Merchant', { value: 'Corner Cafe' })}
    ${C.segmented('g-paid', [['cash', 'Cash'], ['card', 'Card']], { value: 'cash', legend: 'Paid with' })}
    ${C.selectField('g-repeat', 'Repeats', [['w', 'Every week'], ['m', 'Every month']])}
    ${C.choiceList('g-cat', [{ value: 'pc', label: 'Personal Care', sub: 'Toiletries, hygiene, self-care', icon: 'personal-care' }, { value: 'gr', label: 'Groceries', sub: 'Food and household items', icon: 'groceries' }], { value: 'pc', legend: 'Which budget?' })}
    ${C.stepSlider('g-priority', 'Priority', ['Low', 'Normal', 'High', 'Essential'], { value: 2, optional: true })}
    ${C.checkbox('g-learn', 'Use this category as a future suggestion', { checked: true, hint: 'You can change suggestions anytime.' })}
    ${C.textArea('g-note', 'Description', { value: 'Food and drinks for home', counter: true, max: 100, optional: true })}</div>`))}
  ${section('Empty state', C.emptyState({ icon: 'inbox-done', title: 'Everything here is reviewed', text: '5 older purchases are still waiting.', action: C.button('Review older purchases', { variant: 'secondary' }) }))}
  ${section('Toast', `<div class="toast-demo">${C.toast('Reconciled')}${C.toast('Could not reach Plaid.', { error: true })}</div>`)}
  ${section(`3D icons (${ART_KEYS.length}, placeholders)`, C.card(`<div class="icon-grid">${ART_KEYS.map(k => `<span class="icon-cell">${C.iconTile(k, { size: 'md' })}<small>${C.esc(k)}</small></span>`).join('')}</div>`))}
  ${section('Line icons (controls only)', C.card(`<div class="chip-row">${['inbox', 'budgets', 'planned', 'more', 'back', 'chevronRight', 'chevronDown', 'close', 'plus', 'camera', 'search', 'info', 'check', 'refresh', 'file', 'image', 'pencil', 'link', 'alert', 'clock', 'calendar', 'gear', 'trash'].map(n => line(n)).join('')}</div>`))}`;
}
