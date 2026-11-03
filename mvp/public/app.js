import { budgetTotals, isFullWeek } from './budget-math.js';
const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (amount, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100); }
  catch { return `${(amount / 100).toFixed(2)} ${currency}`; }
};
const icon = name => `<img class="icon" src="/assets/${name}.svg" alt="">`;
const shortDate = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const dayDate = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const longDate = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const start = new Date(); start.setDate(start.getDate() - start.getDay());
const end = new Date(start); end.setDate(end.getDate() + 6);
// view: inbox | week | budget | budget-form | entry | banks. "selected" (a transaction id) shows its review on top of any view.
let range = { start: iso(start), end: iso(end) }, view = 'inbox', filter = 'needs', selected = null;
let data, busy = false, message = '', error = false, rangeOpen = false;
let entry = null, budgetName = null, budgetDraft = null;
const drafts = new Map();
const dollars = cents => (cents / 100).toFixed(2);
// Strict dollar text to integer cents; null when it is not a plain amount.
const toCents = (text, negative = false) => {
  const value = String(text ?? '').trim().replace(/^\$/, '');
  if (!(negative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};
const blankLine = () => ({ name: '', printed: '', amount: '', category: '' });
const receiptDraft = (r, extra = {}) => ({ id: r.id || '', imageId: r.imageId || '', merchant: r.merchant || '', date: r.date || '', notes: r.notes || '',
  items: (r.items?.length ? r.items : [{}]).map(i => i.name === undefined ? blankLine() : ({ name: i.name, printed: i.printed || '', amount: dollars(i.amountCents), category: i.category || '' })),
  tax: dollars(r.taxCents || 0), tip: dollars(r.tipCents || 0), printedTotal: r.totalCents || 0, ...extra });
const itemSummary = r => r.items.map(i => i.name).filter(Boolean).join(', ').slice(0, 200);
// The total is always items + tax + tip, so a purchase entered by hand can never disagree with itself.
function receiptSum(r) {
  // A price not typed yet counts as zero here; saving still asks for it.
  const lines = r.items.map(i => String(i.amount).trim() ? toCents(i.amount, true) : 0), tax = toCents(r.tax || '0'), tip = toCents(r.tip || '0');
  if (lines.includes(null) || tax === null || tip === null) return { ok: false, subtotal: null, total: null, text: 'Use amounts like 4.99. Discounts can be negative, like -1.00.' };
  const subtotal = lines.reduce((a, b) => a + b, 0), total = subtotal + tax + tip;
  if (total <= 0) return { ok: false, subtotal, total, text: '' };
  if (r.printedTotal && r.printedTotal !== total) return { ok: false, subtotal, total, text: `The scanned receipt says ${money(r.printedTotal)}. Check the lines, tax and tip.` };
  return { ok: true, subtotal, total, text: r.printedTotal ? 'Lines, tax and tip match the printed total.' : '' };
}
function receiptPayload(r) {
  const items = r.items.map(i => ({ name: i.name.trim(), printed: i.printed, amountCents: toCents(i.amount, true), category: i.category || '' }));
  if (items.some(i => !i.name) || items.some(i => i.amountCents === null)) throw new Error('Each item needs a name and a price like 4.99. Discounts can be negative.');
  const sum = receiptSum(r);
  if (sum.total === null) throw new Error('Enter tax and tip as amounts like 1.25, or 0.');
  if (sum.total <= 0) throw new Error('The total must be more than zero.');
  if (!String(r.merchant || '').trim()) throw new Error('Add the store or merchant name.');
  if (!r.date) throw new Error('Add the purchase date.');
  return { id: r.id || undefined, imageId: r.imageId || null, merchant: r.merchant.trim(), date: r.date, items, taxCents: toCents(r.tax || '0'), tipCents: toCents(r.tip || '0'), totalCents: sum.total };
}
const currentReceipt = () => selected ? drafts.get(selected)?.receipt : view === 'entry' ? entry?.receipt : null;

async function request(route, payload) {
  const options = payload === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': data.csrfToken }, body: JSON.stringify(payload) };
  const response = await fetch(route, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not complete that action.');
  return result;
}
async function action(route, payload = {}, success = '') {
  busy = true; message = ''; render();
  try { data = await request(route, payload); error = false; message = success; }
  catch (e) { error = true; message = e.message; }
  finally { busy = false; render(); window.scrollTo(0, 0); }
}
const fail = text => { error = true; message = text; render(); window.scrollTo(0, 0); };
const inRange = date => (!range.start || date >= range.start) && (!range.end || date <= range.end);
const weekly = () => data.transactions.filter(t => inRange(t.date));
const status = t => { const [style, label] = { posted: ['mint', 'Posted'], cash: ['gray', 'Recorded'], unverified: ['peach', 'Unverified'] }[t.status] || ['blue', 'Pending']; return `<span class="pill ${style}">${label}</span>`; };
const watching = () => data.receipts.filter(r => r.status === 'watching');
const backRow = (id, right = '') => `<div class="back-row"><button class="text-button back" id="${id}" type="button">${icon('arrow-left')} Back</button>${right}</div>`;
const categoryOptions = (current, placeholder = 'Choose a category') => `<option value="">${esc(placeholder)}</option>${data.categories.map(c => `<option ${current === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;

function transaction(t) {
  return `<button class="transaction ${t.kind === 'transfer' && !t.reviewed ? 'purpose' : ''}" data-open="${esc(t.id)}">
    <span class="row-icon">${icon(t.kind === 'transfer' ? 'transfer' : 'bag')}</span>
    <span class="merchant"><strong>${esc(t.merchant || t.name)}</strong><small>${shortDate(t.date)} · ${esc(t.account)}${t.receiptId ? ' · Receipt' : ''}</small><small class="${t.changed ? 'warning' : 'blue-text'}">${t.changed ? 'Amount changed · review again' : t.reviewed ? `Reviewed · ${esc(t.category || (t.classification === 'own' ? 'Own accounts' : t.classification))}` : t.kind === 'transfer' ? 'Purpose needed · excluded from totals' : 'Tap to review'}</small></span>
    <span class="amount"><strong>${t.direction === 'in' ? '+' : ''}${esc(money(t.amount, t.currency))}</strong>${status(t)}</span>
  </button>`;
}
function rangePicker() {
  const label = !range.start ? 'All imported dates' : isFullWeek(range) ? `${dayDate(range.start)} – ${dayDate(range.end)}` : `${shortDate(range.start)} – ${shortDate(range.end)}`;
  return `<details class="range" ${rangeOpen ? 'open' : ''}><summary><button type="button" class="icon-button" data-week="-1" aria-label="Previous week">${icon('left')}</button><strong>${label}</strong><span class="icon-button" aria-hidden="true">${icon('down')}</span></summary>
    <div class="date-inputs"><label>From<input id="from" type="date" value="${range.start}"></label><label>Through<input id="through" type="date" value="${range.end}"></label></div>
    <div class="range-actions"><button type="button" class="text-button" id="this-week-range">This week</button><button type="button" class="text-button" id="all-dates">All dates</button><button type="button" class="text-button" data-week="1">Next week ${icon('right')}</button></div></details>`;
}
function inbox() {
  const rows = weekly(), reviewed = rows.filter(t => t.reviewed).length;
  const pendingPurpose = rows.filter(t => !t.reviewed && t.kind === 'transfer').length;
  const visible = rows.filter(t => filter === 'all' || (filter === 'reviewed' ? t.reviewed : !t.reviewed));
  return `<div class="title"><h1>A little money check-in.</h1><p class="subtitle">You review. Your inbox keeps things organized.</p></div>
    ${rangePicker()}
    <section class="card"><div class="between"><span>This week’s review</span><strong>${reviewed} of ${rows.length} reviewed</strong></div><progress aria-label="Transactions reviewed" max="${Math.max(rows.length, 1)}" value="${reviewed}"></progress><div class="between"><small>Weeks start Sunday</small><small>${pendingPurpose} to classify</small></div></section>
    <div class="filters" aria-label="Review filter">${[['needs', 'Needs review'], ['all', 'All'], ['reviewed', 'Reviewed']].map(([id, label]) => `<button data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}</div>
    ${matchNotice()}
    <section class="queue card">${visible.length ? visible.map(transaction).join('') : `<div class="empty"><h2>${rows.length ? 'You’re caught up.' : 'A little space for your transactions.'}</h2><p>${data.items.length ? 'Try All dates if your bank history is outside this week.' : live() ? 'Connect your bank to bring in your purchases.' : 'Start with sample data, or connect a Sandbox bank.'}</p><button class="secondary" id="open-banks">${data.items.length ? 'Manage banks' : 'Get started'}</button></div>`}</section>
    ${loggedCard()}
    <input type="file" id="receipt-file" accept="image/*" hidden>
    <div class="stack"><button class="primary" id="add-purchase">${icon('plus-white')}Add purchase</button>
    <button class="secondary" id="scan-receipt" ${data.receiptsConfigured ? '' : 'disabled'}>${icon('scan-blue')}Scan a receipt</button>
    ${data.receiptsConfigured ? '' : '<p class="footnote center">Scanning needs an Anthropic API key (see docs/mvp-setup.md). You can still add purchases by hand.</p>'}</div>
    <p class="footnote">${!rows.length ? 'No transactions in this date range.' : rows.some(t => !t.reviewed) ? 'Budget totals are incomplete while transactions await review.' : 'All visible transactions have been reviewed.'} Posting and review are separate.</p>`;
}
function matchNotice() {
  const found = watching().filter(r => r.matches.length);
  if (!found.length) return '';
  return `<section class="card match-card"><div class="between"><h2>Bank charge found</h2>${icon('scan-blue')}</div><p>A charge showed up for ${found.length === 1 ? 'a purchase' : `${found.length} purchases`} you logged. Confirm it so the purchase counts once.</p>
    ${found.map(r => { const m = r.matches[0]; return `<button class="secondary" data-open-match="${esc(m.transactionId)}" data-receipt="${esc(r.id)}">Review ${esc(m.name)} · ${money(m.amount)}${m.exact ? '' : ` (logged ${money(r.totalCents)})`}</button>`; }).join('')}</section>`;
}
const budgetsOf = r => [...new Set(r.items.map(i => i.category || r.category))].join(', ');
function loggedRow(r) {
  const wait = r.status === 'watching';
  return `<button class="transaction" data-edit-entry="${esc(r.id)}"><span class="row-icon">${icon(r.imageId ? 'scan-blue' : 'bag')}</span>
    <span class="merchant"><strong>${esc(r.merchant)}</strong><small>${shortDate(r.date)} · ${esc(budgetsOf(r))}</small><small class="${wait && r.matches.length ? 'warning' : 'blue-text'}">${wait ? (r.matches.length ? 'Bank charge found · confirm it' : 'Watching for the bank charge') : 'Not expecting a bank charge'}</small></span>
    <span class="amount"><strong>${money(r.totalCents)}</strong>${status({ status: wait ? 'unverified' : 'cash' })}</span></button>`;
}
function loggedCard() {
  const list = data.receipts.filter(r => r.status === 'watching' || (r.status === 'cash' && inRange(r.date)));
  if (!list.length) return '';
  const waiting = list.filter(r => r.status === 'watching').length;
  return `<section class="card queue logged"><div class="between section-head"><h2>Logged by you</h2>${waiting ? `<span class="pill peach">${waiting} waiting</span>` : ''}</div>
    ${list.map(loggedRow).join('')}
    <p class="footnote">${waiting ? "Unverified purchases count toward your budgets until you confirm the matching bank charge. " : ""}Tap one to edit it.</p></section>`;
}
// The receipt itself, drawn as paper. Used for scanned receipts, purchases entered by hand, and receipts attached to a bank charge.
function receiptPaper(r, { bankAmount = null } = {}) {
  const sum = receiptSum(r);
  const same = 'Same as purchase';
  return `<section class="paper" aria-label="Receipt details">
    <div class="paper-head"><span class="paper-merchant"><input data-r="merchant" value="${esc(r.merchant)}" maxlength="200" autocomplete="off" placeholder="STORE NAME" aria-label="Store or merchant" required>${icon('pencil')}</span>
      <input class="paper-date" data-r="date" type="date" value="${esc(r.date)}" aria-label="Purchase date" required></div>
    ${r.notes ? `<p class="notice warning">Scan note: ${esc(r.notes)}</p>` : ''}
    <p class="paper-caption" id="receipt-count">${plural(r.items.length, 'item')} · names & categories are editable</p>
    ${r.items.map((item, i) => `<div class="paper-item">
      <div class="paper-item-top"><input class="item-name" data-item="${i}" data-key="name" aria-label="Item ${i + 1} name" value="${esc(item.name)}" maxlength="200" autocomplete="off" placeholder="Item name">
        <span class="item-price">${icon('pencil')}<input class="money-input" data-item="${i}" data-key="amount" aria-label="Item ${i + 1} price" inputmode="decimal" value="${esc(item.amount)}" placeholder="0.00"></span></div>
      ${item.printed && item.printed !== item.name ? `<small class="printed">Printed as “${esc(item.printed)}”</small>` : ''}
      <div class="paper-item-bottom"><span>Budget</span><select class="mini-select" data-item="${i}" data-key="category" aria-label="Item ${i + 1} budget">${categoryOptions(item.category, same)}</select>
        <button type="button" class="icon-button remove-line" data-remove-line="${i}" aria-label="Remove item ${i + 1}" ${r.items.length < 2 ? 'hidden' : ''}>×</button></div></div>`).join('')}
    <button type="button" class="text-button add-line" id="add-line">${icon('plus')} Add an item</button>
    <div class="paper-rule"></div>
    <div class="paper-row"><span>Subtotal</span><span id="receipt-subtotal">${sum.subtotal === null ? '—' : money(sum.subtotal)}</span></div>
    <label class="paper-row"><span>Tax</span><input class="money-input mini-money" data-r="tax" inputmode="decimal" value="${esc(r.tax)}" aria-label="Tax"></label>
    <label class="paper-row"><span>Tip</span><input class="money-input mini-money" data-r="tip" inputmode="decimal" value="${esc(r.tip)}" aria-label="Tip"></label>
    <div class="paper-row paper-total"><span>TOTAL</span><strong id="receipt-total">${sum.total === null ? '—' : money(sum.total)}</strong></div>
    <p class="footnote ${sum.ok ? 'blue-text' : 'warning'}" id="receipt-check" ${sum.text ? '' : 'hidden'}>${esc(sum.text)}</p>
    ${bankAmount !== null ? `<p class="footnote ${sum.total === bankAmount ? 'blue-text' : 'warning'}" id="receipt-bank">${bankNote(sum.total, bankAmount)}</p>` : ''}</section>`;
}
const bankNote = (total, bank) => total === bank ? 'Matches the bank charge exactly.' : `The bank charge is ${money(bank)}. Your budgets use the bank amount, shared across the items.`;
function openEntry({ category = '', receipt = null, duplicates = null, existing = null } = {}) {
  selected = null; view = 'entry'; message = '';
  if (existing) entry = { id: existing.id, receipt: receiptDraft(existing, { printedTotal: 0 }), duplicates: null, category: existing.category, description: existing.description || '', watch: existing.status === 'watching', checked: false, candidates: [] };
  else entry = { receipt: receipt || receiptDraft({ date: iso(new Date()) }), duplicates, category, description: receipt ? itemSummary(receipt) : '', watch: true, checked: false, candidates: duplicates?.transactions || [] };
  render(); window.scrollTo(0, 0);
}
function matchCard(candidates) {
  if (!candidates.length) return '';
  return `<section class="card match-card plain"><div class="between"><h2>Match to transaction</h2>${candidates[0].exact ? `<span class="pill mint">Exact ${money(candidates[0].amount)}</span>` : ''}</div>
    ${candidates.map(m => `<button type="button" class="match-option" data-attach="${esc(m.transactionId)}"><span class="match-check">${icon('check-blue')}</span><span class="merchant"><strong>${esc(m.name)} · ${shortDate(m.date)} · ${m.status === 'posted' ? 'Posted' : 'Pending'}</strong><small>${esc(m.account || '')}${m.exact ? '' : ` · differs by ${money(Math.abs(m.difference))}`}${m.reviewed ? ' · already reviewed' : ''}</small></span><span class="amount"><strong>${money(m.amount)}</strong></span></button>`).join('')}
    <p class="footnote">This charge is already in your inbox. Tap it to attach your items there. That confirms the match without duplicating the purchase.</p></section>`;
}
function entryView() {
  if (!entry) { view = 'inbox'; return inbox(); }
  const r = entry.receipt, scanned = Boolean(r.imageId), dupes = entry.duplicates?.receipts || [];
  return `${backRow('entry-back', scanned ? `<a class="text-button" href="/api/receipts/image?id=${esc(r.imageId)}" target="_blank" rel="noopener">Original image ${icon('open-blue')}</a>` : '')}
    <div class="title"><h1>${scanned ? 'A receipt, made clear.' : entry.id ? 'Edit your purchase.' : 'Log a purchase.'}</h1><p class="subtitle">${scanned ? 'Review draft · tap a field to correct it.' : 'What you bought, item by item. Each one can go to its own budget.'}</p></div>
    ${dupes.length ? `<p class="notice warning">You may have saved this already: ${dupes.map(d => `${esc(d.merchant)} · ${shortDate(d.date)} · ${money(d.totalCents)}`).join('; ')}. Saving it again would count it twice.</p>` : ''}
    <form id="entry-form">${receiptPaper(r)}
      <label class="field">Your category<select name="category" required>${categoryOptions(entry.category)}</select><small class="hint">Items set to “Same as purchase” go here.</small></label>
      <label class="field">What did you buy?<span class="input-icon"><input name="description" maxlength="2000" value="${esc(entry.description)}" autocomplete="off" placeholder="Add a description">${icon('pencil')}</span></label>
      <section class="card toggle-card"><label class="switch-row"><span><strong>Match with a bank charge</strong><small>Paid by card or bank? We’ll watch for the charge and ask you to confirm the match, so it counts once.</small></span><input type="checkbox" role="switch" name="watch" ${entry.watch ? 'checked' : ''}><i class="switch" aria-hidden="true"></i></label>
        <p class="footnote" id="watch-hint">${watchHint(entry.watch)}</p></section>
      ${entry.watch ? matchCard(entry.candidates) : ''}
      <button class="primary" type="submit">${icon('check')}<span id="entry-save">${saveLabel()}</span></button>
      <p class="footnote center">Saving counts it toward your budgets. Nothing is sent to your bank.</p>
      ${entry.id ? '<button class="text-button danger" type="button" id="entry-delete">Delete this purchase</button>' : `<button class="text-button" type="button" id="entry-discard">Discard</button>`}</form>`;
}
const watchHint = on => on ? 'Counts as unverified spending until the charge arrives.' : 'Cash, a gift card, or anything your bank won’t show. Counts as recorded spending now and never waits for a match.';
const saveLabel = () => entry.receipt.imageId ? 'Review & save receipt' : entry.watch ? 'Save & watch for the charge' : 'Save purchase';
function home() {
  const totals = budgetTotals(data.transactions, data.budgets, range, data.receipts);
  return `<div class="title"><h1>Your week, a little clearer.</h1><p class="subtitle">Confirmed choices, saved on this computer.</p></div>${rangePicker()}
    <section class="card"><span class="label">Reviewed spending · USD</span><div class="big-number">${money(totals.spent)}</div><p>${money(totals.pending)} is pending at the bank.${totals.unverified ? ` ${money(totals.unverified)} is waiting for a bank charge.` : ''}</p><div class="between"><span>Confirmed income</span><strong>${money(totals.income)}</strong></div></section>
    <div class="between section-head"><h2>Your weekly budgets</h2><button class="text-button" id="new-budget">${icon('plus')} New</button></div>
    ${isFullWeek(range) ? totals.categories.map(budgetTile).join('') : '<section class="card"><p>Choose one Sunday–Saturday week to compare spending with weekly limits. All-dates totals above are still available.</p><button class="secondary" id="this-week">Show this week’s budgets</button></section>'}
    <p class="footnote">${plural(totals.unreviewed, 'transaction')} still need review. Totals are incomplete until review is finished. Unresolved transfers and inflows do not count as income or spending.</p>`;
}
const percentText = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
function bar(b) {
  const posted = Math.min(100, b.posted / b.limitCents * 100), pending = Math.min(100 - posted, b.pending / b.limitCents * 100), unverified = Math.min(100 - posted - pending, b.unverified / b.limitCents * 100);
  return `<div class="budget-bar" role="meter" aria-label="${esc(b.name)} weekly budget" aria-valuemin="0" aria-valuemax="${b.limitCents}" aria-valuenow="${Math.min(b.spent, b.limitCents)}" aria-valuetext="${percentText(b.percent)}% used, ${b.remaining < 0 ? money(-b.remaining) + ' over budget' : money(b.remaining) + ' remaining'}"><span class="posted" style="width:${posted}%"></span><span class="pending" style="width:${pending}%"></span><span class="unverified" style="width:${unverified}%"></span></div>`;
}
function budgetTile(b) {
  const over = b.remaining < 0;
  return `<button class="card budget-tile" data-budget-open="${esc(b.name)}"><div class="between"><span class="merchant"><strong>${esc(b.name)}</strong><small>${esc(b.description)}</small></span><span class="amount"><strong class="${over ? 'warning' : ''}">${money(Math.abs(b.remaining))}</strong><small>${over ? 'over' : 'left'}</small></span></div>
    ${bar(b)}<div class="between"><small>${money(b.spent)} of ${money(b.limitCents)}</small><small class="${over ? 'warning' : ''}">${percentText(b.percent)}%</small></div></button>`;
}
function budgetDetail() {
  const totals = budgetTotals(data.transactions, data.budgets, range, data.receipts), b = totals.categories.find(c => c.name === budgetName);
  if (!b) { view = 'week'; return home(); }
  const over = b.remaining < 0, waiting = weekly().filter(t => !t.reviewed && t.kind === 'purchase').length;
  const rows = [...b.transactions].sort((x, y) => y.date.localeCompare(x.date));
  return `${backRow('budget-back', '<button class="text-button" type="button" id="edit-budget">Edit budget</button>')}
    <div class="title"><h1>${esc(b.name)}</h1><p class="subtitle">${esc(b.description)}</p></div>${rangePicker()}
    ${isFullWeek(range) ? `<section class="card budget-card"><div class="between top"><div><div class="big-number ${over ? 'warning' : ''}">${money(Math.abs(b.remaining))}</div><small>${over ? 'Over this week’s limit' : 'Remaining this week'}</small></div><div class="tile-icon">${icon('review-bag')}</div></div>
      <div class="between"><span>Spent or pending / ${money(b.limitCents)} limit</span><strong class="${over ? 'warning' : ''}">${percentText(b.percent)}%</strong></div>${bar(b)}
      <ul class="legend"><li><i class="dot posted"></i><span>Posted</span><strong>${money(b.posted)}</strong></li><li><i class="dot pending"></i><span>Pending card spending</span><strong>${money(b.pending)}</strong></li>${b.unverified ? `<li><i class="dot unverified"></i><span>Waiting for the bank</span><strong>${money(b.unverified)}</strong></li>` : ''}</ul>
      <small>${money(b.limitCents)} − ${money(b.posted)} posted − ${money(b.pending)} pending${b.unverified ? ` − ${money(b.unverified)} waiting` : ''} = ${over ? '−' : ''}${money(Math.abs(b.remaining))}.</small></section>` : '<section class="card"><p>Choose one Sunday–Saturday week to compare this budget with its weekly limit.</p><button class="secondary" id="this-week">Show this week</button></section>'}
    ${waiting ? `<p class="footnote">${plural(waiting, 'purchase')} this week still ${waiting === 1 ? 'needs' : 'need'} your inbox review before ${waiting === 1 ? 'it counts' : 'they count'} anywhere.</p>` : ''}
    <div class="between section-head"><h2>Purchases ${isFullWeek(range) ? 'this week' : 'in these dates'}</h2><span class="blue-text strong">${plural(rows.length, 'purchase')}</span></div>
    <section class="card queue">${rows.length ? rows.map(t => `<button class="transaction" ${t.entryId ? `data-edit-entry="${esc(t.entryId)}"` : `data-open="${esc(t.id)}"`}><span class="row-icon">${icon('bag')}</span><span class="merchant"><strong>${esc(t.merchant || t.name)}</strong><small>${shortDate(t.date)} · ${esc(t.account)}${t.split ? ` · part of ${money(t.total)}` : ''}</small></span><span class="amount"><strong>${money(t.amount)}</strong>${status(t)}</span></button>`).join('') : '<p class="footnote">No reviewed spending in this budget yet.</p>'}</section>
    <button class="primary" id="budget-add">${icon('plus-white')}Add purchase</button>`;
}
const PRESETS = { Essentials: 'Groceries, toiletries and everyday basics', Recreation: 'Fun, outings and hobbies', Travel: 'Trips, transit and getaways', 'Personal Care': 'Haircuts, toiletries and self-care', Housing: 'Rent, utilities and home supplies', Education: 'Classes, books and courses', Groceries: 'Everyday food, a little room to breathe', Dining: 'Restaurants, coffee and takeout', Transport: 'Gas, fares and parking', Gifts: 'Presents and celebrations' };
function budgetForm() {
  const f = budgetDraft, existing = new Set(data.categories.map(c => c.toLowerCase()));
  const presets = Object.keys(PRESETS).filter(name => !existing.has(name.toLowerCase())).slice(0, 6);
  return `${backRow('budget-form-back')}<div class="title"><h1>${f.editing ? 'Adjust your budget.' : 'Give your money a job.'}</h1><p class="subtitle">Make a budget that fits your rhythm.</p></div>
    ${f.editing ? '' : `<div class="group"><h2 class="section-title">Start with a category</h2>${presets.length ? `<div class="chips">${presets.map(name => `<button type="button" class="chip" data-preset="${esc(name)}" aria-pressed="${f.name === name}">${esc(name)}</button>`).join('')}</div>` : ''}
      <button type="button" class="custom-group" id="custom-group" aria-pressed="${f.custom}">${icon('check-blue')}Create my own group</button></div>`}
    <form id="budget-form"><label class="field">Category name<input name="name" maxlength="60" value="${esc(f.name)}" ${f.editing ? 'readonly' : ''} required autocomplete="off"></label>
      <label class="field">Description · required for new groups<textarea name="description" maxlength="300" rows="2" required>${esc(f.description)}</textarea><small class="hint">A clear purpose makes review decisions easier.</small></label>
      <label class="field">Budget limit<span class="input-prefix"><span>$</span><input name="limit" inputmode="decimal" value="${esc(f.limit)}" placeholder="0.00" required autocomplete="off"></span></label>
      <section class="card rhythm"><h2>Your ${f.editing ? '' : 'new '}rhythm</h2><div class="between"><span id="rhythm-name">${esc(f.name || 'New budget')}</span><strong id="rhythm-limit">${rhythmLimit(f.limit)}</strong></div><small>Each week runs Sunday–Saturday. A fresh limit begins each week.</small></section>
      <button class="primary" type="submit">${icon(f.editing ? 'check' : 'plus-white')}${f.editing ? 'Save budget' : 'Create budget'}</button></form>`;
}
const rhythmLimit = text => { const cents = toCents(text); return cents ? `${money(cents)} / week` : '$— / week'; };
const live = () => data.environment === 'production';
function liveBanks() {
  const linked = data.items.filter(i => i.provider === 'plaid');
  return `<div class="title"><h1>Your banks.</h1><p class="subtitle">Real accounts, connected through Plaid.</p></div>
    <section class="card"><span class="pill mint">Live bank data</span><h2>${linked.length ? 'Add another bank' : 'Connect your bank'}</h2><p>${data.configured ? 'Plaid Link opens your bank’s own sign-in. SaveUp never sees your bank password; it keeps an encrypted Plaid key on this computer.' : 'Production credentials are not configured yet. Add them to mvp/.env.local, then restart the app.'}</p>
    <button class="primary" id="link" ${!data.configured ? 'disabled' : ''}>Connect with Plaid</button>
    <p class="footnote">Connect from your computer’s browser. Some banks, like Chase, open a sign-in window that phone previews can’t complete yet.</p></section>
    ${linked.map(item => `<section class="card"><div class="between"><h2>${esc(item.name)}</h2><span class="pill mint">Live</span></div><p>${item.synced ? `Last imported: ${new Date(item.synced).toLocaleString()}` : 'Waiting for first import'}</p>${item.error ? `<p class="warning">${item.error === 'ITEM_LOGIN_REQUIRED' ? 'Your bank needs you to sign in again. Reconnecting isn’t built yet.' : esc(item.error) + ' · retry importing when ready.'}</p>` : ''}</section>`).join('')}
    <button class="primary" id="sync" ${!linked.length ? 'disabled' : ''}>Import latest transactions</button>
    <p class="footnote">Banks usually update once or a few times a day. A new connection can take a few minutes to prepare its history; import again if it looks empty.</p>`;
}
function banks() {
  if (live()) return liveBanks();
  return `<div class="title"><h1>A place to start.</h1><p class="subtitle">Test the whole flow with fictional bank activity.</p></div>
    <section class="card"><span class="pill blue">${data.configured ? 'Sandbox MVP' : 'Sample-data MVP'} · no credentials needed</span><h2>Try sample data</h2><p>Load a small sample bank, review a pending purchase, then simulate it posting at a different amount.</p>
    <button class="primary" id="sample">${data.items.some(i => i.id === 'sample-bank') ? 'Sample bank loaded' : 'Load sample bank'}</button>
    ${data.items.some(i => i.id === 'sample-bank') ? '<button class="secondary" id="post-demo">Simulate $30 → $32 posting</button>' : ''}</section>
    <section class="card"><span class="pill mint">Plaid Sandbox · test banks only</span><h2>Connect through Plaid</h2><p>${data.configured ? 'Use Plaid Link to choose a test institution, or create a Sandbox test bank directly.' : 'Sandbox credentials are not configured yet. Sample data works now; the local setup guide explains how to enable Plaid.'}</p>
    <button class="primary" id="link" ${!data.configured ? 'disabled' : ''}>Connect with Plaid Link</button><button class="secondary" id="test-bank" ${!data.configured ? 'disabled' : ''}>Create Sandbox test bank</button>
    ${data.configured ? '<p class="footnote">In Link, choose First Platypus Bank. Use the Sandbox login user_good / pass_good.</p>' : ''}</section>
    ${data.items.map(item => `<section class="card"><div class="between"><h2>${esc(item.name)}</h2><span class="pill ${item.provider === 'fixture' ? 'blue' : 'mint'}">${item.provider === 'fixture' ? 'Sample' : 'Sandbox'}</span></div><p>${item.synced ? `Last imported: ${new Date(item.synced).toLocaleString()}` : 'Waiting for first import'}</p>${item.error ? `<p class="warning">${esc(item.error)} · retry importing when ready.</p>` : ''}</section>`).join('')}
    <button class="primary" id="sync" ${!data.items.some(i => i.provider === 'plaid') ? 'disabled' : ''}>Import latest Sandbox updates</button><button class="secondary" id="refresh-bank" ${!data.items.some(i => i.provider === 'plaid') ? 'disabled' : ''}>Ask Sandbox for new transactions</button>
    <p class="footnote">New bank data may take a moment. After requesting new transactions, import again. This milestone is local and single-user; no real-bank connections are enabled.</p>`;
}
// A hint from your own reviewed history. It may prefill the category, but only your confirmation saves anything.
function suggestion(t) {
  const name = (t.merchant || t.name).toLowerCase();
  const history = data.transactions.filter(x => x.id !== t.id && x.reviewed && x.kind === 'purchase' && x.category && (x.merchant || x.name).toLowerCase() === name);
  if (!history.length) return null;
  const counts = new Map(); for (const x of history) counts.set(x.category, (counts.get(x.category) || 0) + 1);
  const category = [...counts].sort((a, b) => b[1] - a[1])[0][0], amounts = history.map(x => x.amount);
  const low = Math.min(...amounts), high = Math.max(...amounts);
  return { category, text: `You’ve placed similar ${t.merchant || t.name} purchases ${low === high ? `of ${money(low)}` : `around ${money(low)}–${money(high)}`} in ${category}. Keep it or choose another category.` };
}
const PRIORITY = ['', 'Nice to have', 'Low', 'Medium', 'High', 'Need it soon'];
const priorityLabel = p => p ? `${p} of 5 · ${PRIORITY[p]}` : 'Optional';
function review() {
  const t = data.transactions.find(t => t.id === selected);
  if (!t) { selected = null; return render.view(); }
  const d = drafts.get(t.id);
  const transfer = t.kind === 'transfer';
  const left = weekly().filter(row => !row.reviewed).length;
  const amount = `${t.direction === 'in' ? '+' : ''}${esc(money(t.amount, t.currency))}`;
  const choices = [
    t.direction === 'in' ? ['income', 'Income', 'Pay, freelance work or other earnings'] : ['expense', 'An expense', 'Money you paid for something you bought'],
    ['own', 'Own-account transfer', 'Moving money between your accounts']
  ];
  const matches = transfer || d.receipt ? [] : watching().filter(r => r.matches.some(m => m.transactionId === t.id));
  const hint = transfer ? null : suggestion(t);
  const summary = transfer
    ? `<section class="card purpose-card ${t.reviewed ? 'settled' : ''}"><div class="between"><span class="purpose-label">${t.reviewed ? 'Purpose confirmed' : 'Purpose unverified'}</span>${icon('transfer')}</div><div class="big-number">${amount}</div><h2>${esc(t.name)}</h2><small>${shortDate(t.date)} · ${esc(t.account)} · ${t.status === 'posted' ? 'Posted' : 'Pending'}</small></section>
      ${t.reviewed ? '' : `<p class="notice warning with-icon">${icon('shield')}<span>Zelle, PayPal and bank transfers stay outside income and spending until confirmed—in either direction.</span></p>`}`
    : `<section class="card summary-card"><div class="between top"><div class="summary-main"><span class="title-edit"><input name="merchant" value="${esc(d.merchant)}" maxlength="200" autocomplete="off" aria-label="Merchant name" ${d.receipt ? 'readonly' : ''}>${d.receipt ? '' : icon('pencil')}</span><div class="big-number">${amount}</div></div><div class="tile-icon">${icon('review-bag')}</div></div>
      <div class="between"><span>Date</span><span class="value">${longDate(t.date)}</span></div><div class="between"><span class="account">${esc(t.account)}</span>${status(t)}</div></section>`;
  return `${backRow('back')}<div class="title"><h1>${transfer ? 'What’s this money for?' : 'One small purchase.'}</h1><p class="subtitle">${t.reviewed ? 'Edit your review' : transfer ? 'A quick check keeps your numbers honest.' : `Review purchase · ${left} left to review`}</p></div>
    <form id="review-form">${summary}${t.changed ? '<p class="notice warning">The amount changed after your last review. Check it again before confirming.</p>' : ''}
    ${matches.map(r => `<section class="card match-card plain"><div class="between"><h2>Is this your purchase?</h2><span class="pill ${r.totalCents === t.amount ? 'mint' : 'peach'}">${r.totalCents === t.amount ? `Exact ${money(r.totalCents)}` : `Differs by ${money(Math.abs(r.totalCents - t.amount))}`}</span></div><p>You logged ${esc(r.merchant)} · ${shortDate(r.date)} · ${money(r.totalCents)}. It already counts as unverified spending.</p><button class="secondary" type="button" data-use-receipt="${esc(r.id)}">Use what I logged</button></section>`).join('')}
    ${transfer ? `<fieldset><legend class="visually-hidden">What was this for?</legend><div class="choices">${choices.map(([value, label, hint]) => `<label class="choice"><input type="radio" name="classification" value="${value}" ${d.classification === value ? 'checked' : ''} required><span><strong>${label}</strong><small>${hint}</small></span></label>`).join('')}</div></fieldset><p class="footnote">${t.direction === 'in' ? 'A refund or repayment? Leave it for later; linking those to earlier purchases comes next.' : 'Own-account transfers do not count as new spending.'}</p>` : ''}
    <label class="field">${transfer ? 'Explanation' : 'What did you buy?'}<span class="input-icon"><input name="description" maxlength="2000" value="${esc(d.description)}" autocomplete="off" placeholder="${transfer ? 'Add a short note' : 'Add a description'}">${icon('pencil')}</span></label>
    <label class="field" id="category-field" ${transfer && d.classification !== 'expense' ? 'hidden' : ''}>Your category<select name="category">${categoryOptions(d.category)}</select></label>
    ${hint ? `<section class="hint-card">${icon('guide')}<span><strong>A suggestion, not a decision</strong><small>${esc(hint.text)}</small></span></section>` : ''}
    ${transfer ? '' : `<section class="card priority" role="radiogroup" aria-labelledby="priority-title"><div class="between"><span id="priority-title">Priority</span><strong id="priority-label">${priorityLabel(Number(d.priority) || 0)}</strong></div>
      <div class="segments">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="priority" value="${n}" ${Number(d.priority) === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div><div class="between"><small>Nice to have</small><small>Need it soon</small></div></section>`}
    <label class="field">Comment<textarea name="note" rows="3" maxlength="2000" placeholder="Anything to remember about this?">${esc(d.note)}</textarea></label>
    ${transfer ? '' : d.receipt ? `${receiptPaper(d.receipt, { bankAmount: t.amount })}${d.receipt.id ? '' : '<button class="text-button" type="button" id="drop-receipt">Remove this receipt</button>'}`
      : `<input type="file" id="receipt-file" accept="image/*" hidden><button type="button" class="row-card" id="add-receipt" aria-expanded="${Boolean(d.receiptMenu)}"><span class="row-card-icon">${icon('receipt')}</span><span class="merchant"><strong>Add a receipt</strong><small>${data.receiptsConfigured ? 'Scan a photo or enter the items by hand' : 'Enter the items by hand'}</small></span>${icon('plus')}</button>
        ${d.receiptMenu ? `<div class="split-buttons">${data.receiptsConfigured ? `<button type="button" class="secondary" id="scan-for-review">${icon('scan-blue')}Scan photo</button>` : ''}<button type="button" class="secondary" id="type-receipt">${icon('pencil-blue')}Enter by hand</button></div>` : ''}`}
    ${t.currency !== 'USD' ? '<p class="footnote">Only USD can be reviewed in this first milestone.</p>' : ''}
    <button class="primary" type="submit" ${t.currency !== 'USD' ? 'disabled' : ''}>${icon('check')}<span id="confirm-label">${esc(confirmLabel(t, d))}</span></button>
    <p class="footnote center">Your confirmation completes this inbox review. Choosing a category alone does not approve it.</p>
    <button class="text-button" type="button" id="later">Leave for later</button></form>`;
}
function confirmLabel(t, d) {
  const category = d.category ? `Confirm ${d.category}` : '';
  if (t.kind !== 'transfer') return category || 'Confirm & save review';
  return { own: 'Confirm own-account transfer', income: 'Confirm income', expense: category || 'Confirm expense' }[d.classification] || 'Confirm purpose';
}
render.view = () => ({ banks, week: home, budget: budgetDetail, 'budget-form': budgetForm, entry: entryView }[view] || inbox)();
const section = () => selected ? 'inbox' : ['week', 'budget', 'budget-form'].includes(view) ? 'week' : view === 'banks' ? 'banks' : 'inbox';
function render() {
  if (!data) return;
  app.innerHTML = `<div class="shell"><header><a class="brand" href="#" id="brand">${icon('mark')}<span>pocket</span></a>${live() ? '<span class="pill mint">Live</span>' : ''}<span class="avatar" aria-label="Local profile">ME</span></header>
    <main>${message ? `<div role="${error ? 'alert' : 'status'}" class="notice ${error ? 'warning' : ''}">${esc(message)}</div>` : ''}${selected ? review() : render.view()}</main>
    <nav aria-label="Main navigation">${[['week', 'home', 'Home'], ['inbox', 'inbox', 'Inbox'], ['banks', 'more', 'More']].map(([id, image, label]) => `<button data-view="${id}" aria-current="${section() === id ? 'page' : 'false'}">${icon(image)}<span>${label}</span></button>`).join('')}</nav></div>`;
  const all = (selector, fn) => app.querySelectorAll(selector).forEach(element => fn(element));
  const bind = (id, fn) => { const element = document.getElementById(id); if (element) element.onclick = fn; };
  const go = next => { view = next; selected = null; message = ''; render(); window.scrollTo(0, 0); };
  all('[data-view]', button => button.onclick = () => go(button.dataset.view));
  all('[data-filter]', button => button.onclick = () => { filter = button.dataset.filter; render(); });
  all('[data-open]', button => button.onclick = () => openTransaction(button.dataset.open));
  all('[data-open-match]', button => button.onclick = () => openTransaction(button.dataset.openMatch, data.receipts.find(r => r.id === button.dataset.receipt)));
  all('[data-use-receipt]', button => button.onclick = () => { useReceipt(drafts.get(selected), data.receipts.find(r => r.id === button.dataset.useReceipt)); render(); });
  all('[data-edit-entry]', button => button.onclick = () => openEntry({ existing: data.receipts.find(r => r.id === button.dataset.editEntry) }));
  all('[data-budget-open]', button => button.onclick = () => { budgetName = button.dataset.budgetOpen; go('budget'); });
  all('[data-attach]', button => button.onclick = () => {
    const receipt = entry.receipt, extra = { category: entry.category, description: entry.description }, keepId = entry.id;
    entry = null; view = 'inbox'; openTransaction(button.dataset.attach);
    const d = drafts.get(selected); d.receipt = { ...receipt, id: keepId || '' }; d.merchant = receipt.merchant; d.category ||= extra.category; d.description ||= extra.description || itemSummary(receipt);
    message = 'Items attached to the bank charge. Check them, then confirm.'; render();
  });
  bindReceipts();
  const picker = app.querySelector('details.range');
  if (picker) picker.ontoggle = () => { rangeOpen = picker.open; };
  all('[data-week]', button => button.onclick = event => {
    event.preventDefault();
    const first = new Date((range.start || iso(start)) + 'T12:00:00'); first.setDate(first.getDate() + 7 * Number(button.dataset.week));
    const last = new Date(first); last.setDate(last.getDate() + 6); range = { start: iso(first), end: iso(last) }; render();
  });
  bind('all-dates', () => { range = { start: '', end: '' }; render(); });
  for (const id of ['this-week', 'this-week-range']) bind(id, () => { range = { start: iso(start), end: iso(end) }; render(); });
  for (const id of ['from', 'through']) {
    const input = document.getElementById(id);
    if (input) input.onchange = () => { const from = document.getElementById('from').value, through = document.getElementById('through').value; if (from && through && from <= through) { range = { start: from, end: through }; render(); } };
  }
  // Budgets
  bind('budget-back', () => go('week'));
  bind('budget-form-back', () => go(budgetDraft?.editing ? 'budget' : 'week'));
  bind('new-budget', () => { budgetDraft = { name: '', description: '', limit: '', custom: true, editing: false }; go('budget-form'); });
  bind('edit-budget', () => { const b = data.budgets.find(b => b.name === budgetName); budgetDraft = { name: b.name, description: b.description, limit: dollars(b.limitCents), custom: false, editing: true }; go('budget-form'); });
  bind('budget-add', () => openEntry({ category: budgetName }));
  all('[data-preset]', button => button.onclick = () => { Object.assign(budgetDraft, { name: button.dataset.preset, description: PRESETS[button.dataset.preset], custom: false }); render(); });
  bind('custom-group', () => { Object.assign(budgetDraft, { name: '', description: '', custom: true }); render(); document.querySelector('#budget-form [name=name]')?.focus(); });
  const budgetFormElement = document.getElementById('budget-form');
  if (budgetFormElement) {
    budgetFormElement.oninput = () => {
      Object.assign(budgetDraft, Object.fromEntries(new FormData(budgetFormElement)));
      document.getElementById('rhythm-name').textContent = budgetDraft.name || 'New budget';
      document.getElementById('rhythm-limit').textContent = rhythmLimit(budgetDraft.limit);
    };
    budgetFormElement.onsubmit = async event => {
      event.preventDefault();
      const limitCents = toCents(budgetDraft.limit);
      if (!limitCents) return fail('Enter a positive weekly limit with at most two decimal places, like 120 or 45.50.');
      const name = budgetDraft.name.trim(), editing = budgetDraft.editing;
      if (!editing && data.categories.some(c => c.toLowerCase() === name.toLowerCase())) return fail(`You already have a ${name} budget. Open it from Home to change its limit.`);
      await action('/api/budget', { name, limitCents, description: budgetDraft.description }, editing ? 'Budget saved.' : 'Weekly budget created.');
      if (!error) { budgetName = data.budgets.find(b => b.name.toLowerCase() === name.toLowerCase())?.name || name; budgetDraft = null; view = 'budget'; render(); }
    };
  }
  // Purchases entered by hand or scanned
  bind('add-purchase', () => openEntry());
  bind('entry-back', () => { entry = null; go('inbox'); });
  bind('entry-discard', () => { if (confirm('Discard this purchase? Nothing has been saved.')) { entry = null; go('inbox'); } });
  bind('entry-delete', () => { if (confirm('Delete this purchase? It will stop counting toward your budgets.')) { const id = entry.id; entry = null; view = 'inbox'; action('/api/receipts/remove', { id }, 'Purchase deleted.'); } });
  const entryForm = document.getElementById('entry-form');
  if (entryForm) {
    entryForm.onchange = entryForm.oninput = event => {
      if (event.target.closest('.paper')) return;
      const values = Object.fromEntries(new FormData(entryForm)), watch = Boolean(values.watch);
      const flipped = watch !== entry.watch;
      Object.assign(entry, { category: values.category, description: values.description, watch });
      if (flipped) return render();
      document.getElementById('entry-save').textContent = saveLabel();
    };
    entryForm.onsubmit = async event => {
      event.preventDefault();
      let receipt;
      try { receipt = receiptPayload(entry.receipt); } catch (problem) { return fail(problem.message); }
      if (!entry.category) return fail('Choose a category for this purchase.');
      // Before watching for a charge, check whether it already arrived.
      if (entry.watch && !entry.checked) {
        busy = true; render();
        try { const found = await request('/api/receipts/check', { receipt, id: entry.id }); entry.checked = true; entry.candidates = found.transactions; entry.duplicates = { ...(entry.duplicates || {}), receipts: found.receipts }; }
        catch (problem) { busy = false; return fail(problem.message); }
        busy = false;
        if (entry.candidates.length || entry.duplicates.receipts.length) { error = false; message = entry.candidates.length ? 'This charge may already be in your inbox. Attach to it, or save again to keep watching.' : 'Check the note below, then save again if this is a different purchase.'; render(); window.scrollTo(0, 0); return; }
      }
      const watch = entry.watch, editing = Boolean(entry.id);
      await action('/api/receipts/save', { ...(editing ? { id: entry.id } : {}), receipt, category: entry.category, description: entry.description, watch },
        watch ? 'Saved. We’ll watch for the bank charge and ask you to confirm the match.' : editing ? 'Purchase updated.' : 'Purchase saved to your budgets.');
      if (!error) { entry = null; view = 'inbox'; render(); }
    };
  }
  // Banks
  for (const id of ['brand', 'open-banks']) bind(id, e => { e.preventDefault(); go(id === 'brand' ? 'inbox' : 'banks'); });
  bind('sample', async () => { await action('/api/demo/connect', {}, 'Sample bank ready.'); if (!error) { view = 'inbox'; range = { start: '2026-11-01', end: '2026-11-07' }; render(); } });
  bind('post-demo', () => action('/api/demo/post', {}, 'The $30 pending charge was replaced by one $32 posted charge. Review it again.'));
  bind('sync', () => action('/api/sync', {}, 'Import finished. Check each bank’s status for any errors.'));
  bind('refresh-bank', () => action('/api/plaid/refresh', {}, 'Request finished. Wait a moment, then import the latest updates.'));
  bind('test-bank', () => action('/api/plaid/test-item', {}, 'Sandbox bank connected. If no transactions appear yet, import again in a moment.'));
  bind('link', openLink);
  // Review
  for (const id of ['back', 'later']) bind(id, () => { selected = null; render(); window.scrollTo(0, 0); });
  bind('drop-receipt', () => { delete drafts.get(selected).receipt; render(); });
  bind('add-receipt', () => { const d = drafts.get(selected); d.receiptMenu = !d.receiptMenu; render(); });
  bind('type-receipt', () => { const d = drafts.get(selected), t = data.transactions.find(t => t.id === selected); d.receipt = receiptDraft({ merchant: d.merchant, date: t.date }); render(); });
  const fileInput = document.getElementById('receipt-file');
  for (const id of ['scan-receipt', 'scan-for-review']) bind(id, () => fileInput.click());
  if (fileInput) fileInput.onchange = () => { const file = fileInput.files[0]; fileInput.value = ''; if (file) scanReceipt(file); };
  const form = document.getElementById('review-form');
  if (form) {
    form.oninput = event => {
      if (event.target.closest('.paper')) return;
      const values = Object.fromEntries(new FormData(form)), d = drafts.get(selected); Object.assign(d, values);
      const t = data.transactions.find(t => t.id === selected);
      document.getElementById('category-field').hidden = t.kind === 'transfer' && values.classification !== 'expense';
      document.getElementById('confirm-label').textContent = confirmLabel(t, d);
      const label = document.getElementById('priority-label'); if (label) label.textContent = priorityLabel(Number(d.priority) || 0);
    };
    form.onsubmit = async e => {
      e.preventDefault(); const id = selected; const draft = { ...drafts.get(id), ...Object.fromEntries(new FormData(form)), id };
      delete draft.receiptMenu;
      if (draft.receipt) {
        try { draft.receipt = receiptPayload(draft.receipt); draft.merchant = draft.receipt.merchant; } catch (problem) { return fail(problem.message); }
      }
      await action('/api/review', draft, draft.receipt ? 'Reviewed with its receipt. Saved on this computer.' : 'Reviewed. Saved on this computer.');
      if (!error) { drafts.delete(id); selected = null; render(); }
    };
  }
  if (busy) all('button,input,textarea,select', element => element.disabled = true);
}

function openTransaction(id, receipt) {
  selected = id; const t = data.transactions.find(t => t.id === id);
  const linked = t.receiptId && data.receipts.find(r => r.id === t.receiptId);
  const hint = t.kind === 'purchase' && !t.reviewed && !t.category ? suggestion(t) : null;
  drafts.set(id, { classification: t.classification || '', category: t.category || hint?.category || '', description: t.description || '', note: t.note || '', merchant: t.merchant || t.name, priority: t.priority ? String(t.priority) : '',
    ...(linked ? { receipt: receiptDraft(linked) } : {}), ...drafts.get(id), revision: t.revision });
  if (receipt) useReceipt(drafts.get(id), receipt);
  message = ''; render(); window.scrollTo(0, 0);
}
function useReceipt(d, receipt) {
  d.receipt = receiptDraft(receipt, { printedTotal: 0 }); d.merchant = receipt.merchant;
  d.category ||= receipt.category || ''; d.description ||= receipt.description || itemSummary(d.receipt);
}
function bindReceipts() {
  const r = currentReceipt();
  if (!r) return;
  const refresh = () => {
    const sum = receiptSum(r), set = (id, text) => { const element = document.getElementById(id); if (element) element.textContent = text; };
    set('receipt-subtotal', sum.subtotal === null ? '—' : money(sum.subtotal)); set('receipt-total', sum.total === null ? '—' : money(sum.total));
    const line = document.getElementById('receipt-check');
    line.textContent = sum.text; line.hidden = !sum.text; line.className = `footnote ${sum.ok ? 'blue-text' : 'warning'}`;
    const bank = document.getElementById('receipt-bank'), t = selected && data.transactions.find(t => t.id === selected);
    if (bank && t) { bank.textContent = bankNote(sum.total, t.amount); bank.className = `footnote ${sum.total === t.amount ? 'blue-text' : 'warning'}`; }
    if (entry && !selected) { entry.checked = false; }
  };
  all('[data-r]', input => input.oninput = () => { r[input.dataset.r] = input.value; refresh(); });
  all('[data-item]', input => input.oninput = input.onchange = () => { r.items[Number(input.dataset.item)][input.dataset.key] = input.value; refresh(); });
  all('[data-remove-line]', button => button.onclick = () => { r.items.splice(Number(button.dataset.removeLine), 1); render(); });
  const add = document.getElementById('add-line');
  if (add) add.onclick = () => { r.items.push(blankLine()); render(); app.querySelector(`[data-item="${r.items.length - 1}"]`)?.focus(); };
  function all(selector, fn) { app.querySelectorAll(selector).forEach(element => fn(element)); }
}
// Resize in the browser: Claude reads up to 2576px on the long edge, and smaller uploads are faster from a phone.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 2576 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error();
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    return { image: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
  } catch { throw new Error('That photo could not be opened. Try a JPEG or PNG.'); }
  finally { URL.revokeObjectURL(url); }
}
async function scanReceipt(file) {
  const forTransaction = selected;
  busy = true; error = false; message = 'Reading your receipt… this can take up to a minute.'; render(); window.scrollTo(0, 0);
  let result;
  try { result = await request('/api/receipts/scan', await shrink(file)); }
  catch (e) { busy = false; error = true; message = e.message; render(); return; }
  busy = false;
  const parsed = result.parsed, already = result.duplicates.receipts;
  if (forTransaction) {
    const d = drafts.get(forTransaction), t = data.transactions.find(t => t.id === forTransaction);
    const reuse = already.find(r => r.status === 'watching' || r.transactionId === forTransaction);
    const elsewhere = already.find(r => r.status === 'linked' && r.transactionId !== forTransaction);
    d.receipt = receiptDraft({ ...parsed, imageId: result.imageId }, { id: reuse?.id || (t.receiptId && d.receipt?.id) || '' });
    d.merchant = parsed.merchant || d.merchant; d.description ||= itemSummary(d.receipt); d.receiptMenu = false;
    error = Boolean(elsewhere);
    message = elsewhere ? 'This receipt looks like one already attached to another purchase. Check before confirming.' : reuse?.status === 'watching' ? 'You logged this purchase earlier. Confirming here matches it to this charge.' : 'Receipt read. Check each line, then confirm.';
    render(); window.scrollTo(0, 0);
  } else {
    openEntry({ receipt: receiptDraft({ ...parsed, imageId: result.imageId }), duplicates: result.duplicates });
    entry.checked = true; message = 'Receipt read. Check each line before saving.'; render();
  }
}
async function openLink() {
  busy = true; message = live() ? 'Opening Plaid…' : 'Opening Plaid Sandbox…'; error = false; render();
  try {
    if (!window.Plaid) await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error(live() ? 'Plaid Link could not load. Check your connection and try again.' : 'Plaid Link could not load. Try the Sandbox test-bank button.')); }; document.head.append(script);
    });
    const { linkToken } = await request('/api/plaid/link-token', {});
    let completed = false;
    const handler = window.Plaid.create({ token: linkToken,
      onSuccess: async (publicToken, metadata) => { completed = true; handler.destroy(); await action('/api/plaid/exchange', { publicToken, institutionName: metadata?.institution?.name }, live() ? 'Bank connected. If your history is still preparing, import again in a few minutes.' : 'Sandbox connected. Import again in a moment if history is still preparing.'); },
      onExit: () => { if (completed) return; handler.destroy(); busy = false; message = 'Connection closed. You can try again.'; render(); }
    });
    handler.open();
  } catch (e) { busy = false; error = true; message = e.message; render(); }
}
try { data = await request('/api/state'); render(); }
catch { app.innerHTML = '<main><h1>Could not open your inbox.</h1><p>Start the local MVP server and reload this page.</p></main>'; }
