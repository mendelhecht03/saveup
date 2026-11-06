// SaveUp app shell: loads state from the server, routes between screens, and
// wires taps, forms, swipes and pull-to-refresh. Screens are plain functions in
// screens/*.mjs; every piece of UI comes from ui/components.mjs.
import * as L from './logic.mjs';
import { bottomNav, sheet as sheetFrame, toast as toastView, esc, note, emptyState, button } from './ui/components.mjs';
import { capture, play, closeSheet, floodOpen, floodClose, enableSwipe, enablePullToRefresh } from './ui/motion.mjs';
import { inboxScreen } from './screens/inbox.mjs';
import { budgetsScreen } from './screens/budgets.mjs';
import { plannedScreen } from './screens/planned.mjs';
import { moreScreen, accountsScreen, historyScreen, historyList, historyHits, labScreen } from './screens/more.mjs';
import { galleryScreen } from './screens/gallery.mjs';
import { subscriptionsScreen, iousScreen, goalsScreen, cashScreen, returnsScreen, settingsScreen } from './screens/preview.mjs';
import { whatIfSheet, whatIfResult } from './screens/week.mjs';
import { reviewSheet, categorySheet, planSheet, iconEmoji, PRIORITY_STOPS } from './screens/sheets.mjs';
import { receiptStartSheet, receiptScreen, matchCard } from './screens/receipt.mjs';
import { quickAddSheet, refreshQuickAdd } from './screens/quickadd.mjs';
import { byDate } from './screens/shared.mjs';

let S = null, csrf = '', configured = true, ai = false, reader = false, readerName = '', samples = [], busy = '', sheet = null, toastTimer = 0;
const ui = { weekOffset: 0, showAll: false, openBudgets: new Set(), editPlans: false, search: '', receiptStep: 'items', receiptView: 'copy', subsTab: 'active' };
const $ = s => document.querySelector(s);
const toCents = v => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(v).trim() ? Math.round(n * 100) : NaN; };

// ---- routing: #/inbox, #/budgets, #/planned, #/more, #/more/history ...
// #/receipt/<id> is the one route with a parameter.
const ROUTES = { inbox: inboxScreen, budgets: budgetsScreen, planned: plannedScreen, more: moreScreen, 'more/accounts': accountsScreen, 'more/history': historyScreen, 'more/lab': labScreen, 'more/gallery': galleryScreen, receipt: receiptScreen,
  'more/subscriptions': subscriptionsScreen, 'more/ious': iousScreen, 'more/cash': cashScreen, 'more/returns': returnsScreen, 'more/settings': settingsScreen, 'planned/goals': goalsScreen };
const route = () => { const r = location.hash.replace(/^#\/?/, ''); return ROUTES[r] || /^receipt\/[\w-]+$/.test(r) ? r : 'inbox'; };
const screenFor = r => ROUTES[r.startsWith('receipt/') ? 'receipt' : r];
const go = to => { if (route() !== to) location.hash = `/${to}`; else render(); };
addEventListener('hashchange', () => { if (sheet) shut(); scrollTo(0, 0); render({ enter: true }); });

const OFFLINE = 'Make sure your PC is on and the app is running on it, then try again.';
async function api(path, body) {
  const post = body !== undefined;
  const r = await fetch(path, { method: post ? 'POST' : 'GET', headers: post ? { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': csrf } : {}, body: post ? JSON.stringify(body) : undefined })
    .catch(() => { throw new Error(OFFLINE); });
  const data = await r.json().catch(() => ({ error: 'Unexpected response. Is the server running?' }));
  if (data.state) S = data.state;
  if (data.csrf) csrf = data.csrf;
  if (!r.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// Run an action with an optional "busy" overlay, then redraw. Errors become a toast.
async function act(fn, { wait = '', done = '' } = {}) {
  if (wait) { busy = wait; renderBusy(); }
  try { await fn(); if (done) say(done); } catch (e) { say(e.message, true); } finally { busy = ''; renderBusy(); render(); }
}
function say(message, error = false) {
  $('#toast-root').innerHTML = toastView(message, { error });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast-root').innerHTML = ''; }, 3200);
}
const renderBusy = () => { $('#busy-root').innerHTML = busy ? `<div class="busy"><div class="card"><span class="spinner"></span>${esc(busy)}</div></div>` : ''; };

// ---- drawing
function weekBadge() {
  const { start, end } = L.weekRange(L.todayISO());
  return S.txns.filter(t => !t.reviewed && t.date >= start && t.date <= end).length;
}
function render({ enter = false, firstBars = false } = {}) {
  if (!S) return;
  const prev = capture();
  const r = route(), tab = r.startsWith('receipt/') ? 'inbox' : r.split('/')[0];
  const focused = document.activeElement?.id === 'search';
  $('#screen-root').innerHTML = `<main class="screen${enter ? ' screen-enter' : ''}">${screenFor(r)({ S, ui, today: L.todayISO(), configured, ai, route: r })}</main>`;
  // Floating buttons live outside the page, so its slide-in can't move them.
  const fab = $('#screen-root #fab'), wasCollapsed = $('#fab-root #fab')?.classList.contains('is-collapsed');
  if (fab) fab.classList.toggle('is-collapsed', Boolean(wasCollapsed) && scrollY >= 40);
  $('#fab-root').replaceChildren(...(fab ? [fab] : []));
  $('#nav-root').innerHTML = bottomNav(tab, { badge: weekBadge() });
  if (focused) { const s = $('#search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  play(prev, document, { firstBars: firstBars || enter });
}
// Keeps the full-screen Add purchase card the size of the visible screen, so its
// toolbar stays just above the iPhone keyboard instead of hiding behind it.
function fitComposer() {
  const c = $('.composer'), vv = window.visualViewport;
  if (c && vv) { c.style.height = `${vv.height}px`; c.style.top = `${vv.offsetTop}px`; }
}
window.visualViewport?.addEventListener('resize', fitComposer);
function pickBudget(form, open) {
  form.classList.toggle('is-picking', open);
  form.querySelector('.qa-picker').hidden = !open;
  form.querySelector('.composer-fields').hidden = open;
  form.querySelector('[data-act="qa-cat"]').setAttribute('aria-expanded', String(open));
}

// Floating Add purchase / Scan receipt, like Splitwise's Add expense: they shrink to
// icons while you scroll down the list and grow their labels back when you scroll
// up or reach the top.
let lastScroll = 0;
addEventListener('scroll', () => {
  const fab = document.getElementById('fab'), y = scrollY;
  if (fab) {
    if (y < 40 || y < lastScroll - 6) fab.classList.remove('is-collapsed');
    else if (y > lastScroll + 6) fab.classList.add('is-collapsed');
  }
  lastScroll = y;
}, { passive: true });
window.visualViewport?.addEventListener('scroll', fitComposer);

function openSheet(next) {
  sheet = next;
  if (sheet.type === 'manual') {
    // Splitwise-style: full screen, keyboard straight onto "Where?". Focusing inside
    // the tap that opened it is what lets iPhone show the keyboard.
    $('#sheet-root').innerHTML = quickAddSheet(S, L.todayISO());
    document.body.classList.add('is-locked');
    $('.composer [name="merchant"]').focus({ preventScroll: true });
    fitComposer();
    floodOpen(sheet.from);
    return;
  }
  const t = sheet.type === 'txn' && S.txns.find(x => x.id === sheet.id);
  if (sheet.type === 'txn' && !t) return shut();
  const views = {
    txn: () => [reviewSheet(S, t), t.reviewed ? 'Purchase' : 'Review purchase'],
    category: () => { const c = S.categories.find(x => x.id === sheet.id); return [categorySheet(S, c), c ? `${c.name} budget` : 'New budget']; },
    plan: () => { const p = S.plans.find(x => x.id === sheet.id); return [planSheet(S, p), p ? 'Edit plan' : 'Plan a purchase']; },
    scan: () => [receiptStartSheet(S, S.txns.find(x => x.id === sheet.id), { reader, readerName, samples }), 'Add receipt'],
    whatif: () => { const p = S.plans.find(x => x.id === sheet.id); return [whatIfSheet(S, p, L.todayISO()), `What if the ${p.name.toLowerCase()} costs…`]; },
    match: () => { const m = L.openMatches(S).find(x => x.bank.id === sheet.id); return m ? [matchCard(S, m, { open: true }), 'Match purchase'] : [note('This match was already handled.'), 'Match purchase']; }
  };
  const [body, title] = views[sheet.type]();
  $('#sheet-root').innerHTML = sheetFrame(body, { title });
  document.body.classList.add('is-locked');
  $('#sheet-root .sheet-body').scrollTop = 0;
}
function shut(after) {
  sheet = null;
  const done = () => { $('#sheet-root').innerHTML = ''; document.body.classList.remove('is-locked'); after?.(); };
  // Add purchase shrinks back into its button; the keyboard starts dropping right away.
  if ($('.composer')) { document.activeElement?.blur(); return floodClose(done, () => $('#fab-root [data-act="manual"]')); }
  closeSheet(done);
}

// Reconcile one purchase: close the sheet, slide its row away, and let the rest move up.
async function reconcile(body, { row } = {}) {
  try { await api('/api/txn/confirm', body); } catch (e) { say(e.message, true); render(); return false; }
  const leaving = row || document.querySelector(`#queue [data-flip="${CSS.escape(body.id)}"]`);
  if (leaving) { leaving.classList.add('row-leaving'); await new Promise(r => setTimeout(r, 220)); }
  say('Reconciled');
  render();
  return true;
}
const nextInQueue = afterId => {
  const { start, end } = L.weekRange(L.todayISO(), ui.weekOffset);
  const open = S.txns.filter(t => !t.reviewed && t.date >= start && t.date <= end).sort(byDate);
  const i = open.findIndex(t => t.id === afterId);
  return open[i + 1] || open.find(t => t.id !== afterId);
};

// ---- taps
const weeksBetween = (a, b) => Math.round((Date.parse(L.weekRange(a).start) - Date.parse(L.weekRange(b).start)) / (7 * 864e5));
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act: a, id } = el.dataset;
  const handlers = {
    tab: () => go(el.dataset.tab),
    go: () => go(el.dataset.to),
    'go-more': () => go('more'),
    week: () => { ui.weekOffset = Math.min(0, ui.weekOffset + Number(el.dataset.d)); ui.showAll = false; render(); },
    jump: () => { ui.weekOffset = weeksBetween(el.dataset.date, L.todayISO()); go('inbox'); render(); },
    'show-all': () => { ui.showAll = !ui.showAll; render(); },
    open: () => openSheet({ type: 'txn', id }),
    manual: () => openSheet({ type: 'manual', from: el }),
    // Camera buttons go straight to the camera; "Add receipt" keeps the sheet with
    // the other ways in (choose a file, a sample receipt, or split by hand).
    scan: () => takeReceiptPhoto(id || null),
    'scan-options': () => openSheet({ type: 'scan', id: id || null }),
    'go-inbox': () => go('inbox'),
    'qa-paid': () => { const f = el.form; f.paid.value = f.paid.value === 'card' ? 'cash' : 'card'; refreshQuickAdd(S, f, L.todayISO()); },
    // The budget list takes the fields' place and the keyboard drops so it all fits.
    'qa-cat': () => { const f = el.form, open = !f.classList.contains('is-picking'); pickBudget(f, open); if (open) document.activeElement?.blur(); else (f.amount.value ? f.merchant : f.amount).focus(); },
    'qa-pick': () => { const f = el.form; f.cat.value = el.dataset.id; f.dataset.picked = '1'; pickBudget(f, false); refreshQuickAdd(S, f, L.todayISO()); if (!f.amount.value) f.amount.focus(); },
    'qa-note': () => { const f = el.form, n = f.querySelector('.composer-note'); pickBudget(f, false); n.hidden = false; n.querySelector('textarea').focus(); },
    reload: () => location.reload(),
    'go-planned': () => go('planned'),
    whatif: () => openSheet({ type: 'whatif', id }),
    'receipt-open': () => shut(() => openReceipt(id)),
    'receipt-digital': () => act(async () => { const { receiptId } = await api('/api/receipt/digital', { sampleId: el.dataset.sample, txnId: el.dataset.txn || null }); shut(() => openReceipt(receiptId)); }),
    'receipt-manual': () => act(async () => { const { receiptId } = await api('/api/receipt/manual', { txnId: el.dataset.txn || null }); shut(() => openReceipt(receiptId)); }),
    'receipt-add-line': () => editReceipt(lines => [...lines, { code: 'ITEM', name: 'New item', amountCents: 0, categoryId: null }]),
    'receipt-remove-line': () => editReceipt(lines => lines.filter((_, i) => i !== Number(el.dataset.line))),
    'receipt-next': () => editReceipt(lines => lines, () => { ui.receiptStep = 'split'; scrollTo(0, 0); }),
    'receipt-back': () => { ui.receiptStep = 'items'; render(); },
    'receipt-difference': () => act(() => api('/api/receipt/difference', { id, categoryId: $('[name="diff-cat"]')?.value || null }), { done: 'Difference assigned' }),
    'receipt-attach': () => act(() => api('/api/receipt/attach', { id, txnId: el.dataset.txn }), { done: 'Attached to that purchase' }),
    'receipt-confirm': () => act(async () => { await api('/api/receipt/confirm', { id }); go('inbox'); }, { done: 'Split saved' }),
    'receipt-delete': () => confirm('Remove this receipt? The purchase stays.') && act(async () => { await api('/api/receipt/delete', { id }); go('inbox'); }, { done: 'Receipt removed' }),
    'match-link': () => shut(() => act(() => api('/api/match/link', { bankId: el.dataset.bank, manualId: el.dataset.manual }), { done: 'Linked. It counts once.' })),
    'match-reject': () => shut(() => act(() => api('/api/match/reject', { bankId: el.dataset.bank, manualId: el.dataset.manual }), { done: 'Kept separate' })),
    'match-open': () => openSheet({ type: 'match', id: el.dataset.bank }),
    'ai-suggest': () => act(() => api('/api/ai/suggest', {}), { wait: 'Asking for suggestions…', done: 'Suggestions updated' }),
    category: () => openSheet({ type: 'category', id }),
    plan: () => openSheet({ type: 'plan', id }),
    close: () => shut(),
    skip: () => { const next = nextInQueue(id); shut(() => next && next.id !== id && openSheet({ type: 'txn', id: next.id })); },
    'toggle-budget': () => { ui.openBudgets.has(id) ? ui.openBudgets.delete(id) : ui.openBudgets.add(id); render({ firstBars: true }); },
    'edit-plans': () => { ui.editPlans = !ui.editPlans; render(); },
    'delete-plan': () => act(() => api('/api/plan/delete', { id }), { done: 'Plan deleted' }),
    unreview: () => shut(() => act(() => api('/api/txn/unreview', { id }), { done: 'Back in the inbox' })),
    'delete-txn': () => confirm('Delete this purchase?') && shut(() => act(() => api('/api/txn/delete', { id }), { done: 'Purchase deleted' })),
    'delete-category': () => confirm('Delete this budget? Its bank purchases go back to the inbox.') && shut(() => act(() => api('/api/category/delete', { id }), { done: 'Budget deleted' })),
    'remove-item': () => confirm('Remove this bank and its transactions?') && act(() => api('/api/items/remove', { itemId: id }), { done: 'Bank removed' }),
    sync: () => act(() => api('/api/sync', {}), { wait: 'Syncing with Plaid…', done: 'Up to date' }),
    link: () => openLink(),
    preset: () => { const f = $('form[data-form="charge"]'); f.description.value = el.dataset.d; f.amount.value = (Math.abs(el.dataset.a) / 100).toFixed(2); f.querySelector(`[name="dir"][value="${el.dataset.a < 0 ? 'in' : 'out'}"]`).checked = true; }
  };
  handlers[a]?.();
});

document.addEventListener('change', e => {
  if (e.target.name === 'kind') { const cats = $('.sheet .cats'); if (cats) cats.hidden = e.target.value !== 'spending'; }
  if (e.target.name === 'subs-tab') { ui.subsTab = e.target.value; render(); }
  if (e.target.closest?.('.composer')) refreshQuickAdd(S, e.target.form, L.todayISO());
  if (e.target.name === 'receipt-view') { editReceipt(lines => lines, () => { ui.receiptView = e.target.value; }); }
  if (e.target.matches('[data-upload]') && e.target.files?.[0]) uploadReceipt(e.target.files[0], e.target.dataset.upload || null);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.closest('.composer')) refreshQuickAdd(S, t.form, L.todayISO());
  if (t.id === 'search') { ui.search = t.value; $('#history-list').innerHTML = historyList(S, historyHits(S, ui.search)); }
  if (t.type === 'range') t.style.setProperty('--fill', `${((t.value - t.min) * 100 / (t.max - t.min)).toFixed(2)}%`);
  if (t.name === 'whatif') { const out = $('#whatif-out'); if (out) out.innerHTML = whatIfResult(S, S.plans.find(p => p.id === t.dataset.plan), Number(t.value), L.todayISO()); }
  const counter = t.name && document.querySelector(`[data-counter="${CSS.escape(t.name)}"]`);
  if (counter) counter.textContent = `${t.value.length}/${t.maxLength}`;
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, v = Object.fromEntries(new FormData(f)), id = f.dataset.id || undefined;
  const saved = (path, body, done) => act(async () => { await api(path, body); shut(); }, { done });
  const forms = {
    confirm: async () => {
      const body = { id, categoryId: v.cat || null, transferKind: v.kind || null, note: v.note, priority: Math.min(Number(v.priority) || 2, PRIORITY_STOPS.length) };
      const wasOpen = !S.txns.find(t => t.id === id)?.reviewed, next = wasOpen && nextInQueue(id);
      try { await api('/api/txn/confirm', body); } catch (err) { return say(err.message, true); }
      say(wasOpen ? 'Reconciled' : 'Saved');
      shut(() => { render(); if (next) openSheet({ type: 'txn', id: next.id }); });
    },
    manual: () => saved('/api/txn/manual', { merchant: v.merchant, amountCents: toCents(v.amount), date: v.date, categoryId: v.cat || null, note: v.note, expectMatch: v.paid === 'card' }, 'Purchase added'),
    category: () => saved('/api/category/save', { id, emoji: iconEmoji(v.icon), name: v.name, description: v.description, limitCents: toCents(v.limit), interval: v.interval }, 'Budget saved'),
    plan: () => saved('/api/plan/save', { id, name: v.name, lowCents: toCents(v.low), highCents: toCents(v.high), categoryId: v.categoryId || null, essential: Boolean(v.essential) }, 'Plan saved'),
    charge: () => act(() => api('/api/sandbox/charge', { itemId: v.itemId, description: v.description, amountCents: toCents(v.amount) * (v.dir === 'in' ? -1 : 1), daysAgo: Number(v.daysAgo) || 0 }), { wait: 'Sending to Plaid and waiting for it to post…', done: 'Charge arrived. Check your inbox.' })
  };
  forms[f.dataset.form]?.();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheet) shut();
  // In Add purchase, Return on "Where?" moves to the amount instead of submitting.
  if (e.key === 'Enter' && e.target.name === 'merchant' && e.target.closest('.composer')) { e.preventDefault(); e.target.form.amount.focus(); }
});

// ---- receipts
function openReceipt(id) { ui.receiptStep = 'items'; ui.receiptView = 'copy'; location.hash = `/receipt/${id}`; }

// Read the editable copy back into data. Codes and "unsure" flags come from the saved lines.
function receiptForm() {
  const f = $('form[data-form="receipt"]');
  if (!f) return null;
  const saved = S.receipts.find(r => r.id === f.dataset.id);
  const lines = [...f.querySelectorAll('.rline')].map((li, i) => {
    const old = saved.lines[Number(li.dataset.line)] || {};
    const amountCents = toCents(li.querySelector('[name="amount"]').value);
    return { code: old.code || 'ITEM', name: li.querySelector('[name="name"]').value, amountCents: Number.isNaN(amountCents) ? 0 : amountCents,
      categoryId: li.querySelector('[name="cat"]').value || null, unsure: Boolean(old.unsure) && old.categoryId === (li.querySelector('[name="cat"]').value || null) };
  });
  const num = v => { const c = toCents(v); return Number.isNaN(c) ? 0 : c; };
  return { id: saved.id, merchant: f.merchant.value, date: f.date.value || undefined, taxCents: num(f.tax.value), totalCents: num(f.total.value), lines };
}
// Save the editable copy with a change applied to its lines, then redraw.
async function editReceipt(change, after) {
  const body = receiptForm();
  if (!body) { after?.(); return render(); }
  body.lines = change(body.lines);
  try { await api('/api/receipt/save', body); after?.(); } catch (e) { say(e.message, true); }
  render();
}

// Opens the phone's camera at once (a file picker on a computer). It must run
// inside the tap or swipe that asked for it, or the browser blocks it.
function takeReceiptPhoto(txnId) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', className: 'visually-hidden' });
  input.setAttribute('capture', 'environment');
  input.addEventListener('change', () => { if (input.files?.[0]) uploadReceipt(input.files[0], txnId); input.remove(); });
  input.addEventListener('cancel', () => input.remove());
  document.body.append(input);
  input.click();
}

// Phone photos are large: shrink to at most 1600px as JPEG before sending.
async function uploadReceipt(file, txnId) {
  busy = reader ? 'Reading your receipt…' : 'Saving your photo…'; renderBusy();
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    const res = await fetch(`/api/receipt/upload${txnId ? `?txnId=${encodeURIComponent(txnId)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-SaveUp-CSRF': csrf }, body: blob });
    const data = await res.json().catch(() => ({ error: 'Unexpected response.' }));
    if (data.state) S = data.state;
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    shut(() => openReceipt(data.receiptId));
  } catch (e) { say(e.message === 'The source image could not be decoded.' ? 'That file isn’t a photo SaveUp can read.' : e.message, true); }
  finally { busy = ''; renderBusy(); }
}

async function openLink() {
  if (!window.Plaid) return say('Plaid Link is still loading. Try again in a moment.', true);
  try {
    const { linkToken } = await api('/api/link-token', {});
    window.Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, meta) => act(() => api('/api/exchange', { publicToken, institution: meta?.institution?.name }), { wait: 'Connecting and loading purchases…', done: 'Bank connected' }),
      onExit: err => { if (err) say(err.display_message || err.error_message || 'Link closed.', true); }
    }).open();
  } catch (e) { say(e.message, true); }
}

// ---- gestures
enableSwipe(document, {
  onConfirm: async row => {
    const t = S.txns.find(x => x.id === row.dataset.id), sug = t && L.suggest(S, t);
    if (!t || !sug || !row.closest('#queue')) { say('Sample row only'); return render(); }
    await reconcile({ id: t.id, categoryId: sug.categoryId, transferKind: sug.transferKind || null, note: t.note, priority: t.priority }, { row });
  },
  onScan: row => {
    if (!row.closest('#queue')) return say('Sample row only');
    takeReceiptPhoto(row.dataset.id);
  }
});
enablePullToRefresh($('#ptr'), {
  canStart: () => !sheet && !busy && S?.items.length > 0,
  onRefresh: async () => { try { await api('/api/sync', {}); say('Up to date'); } catch (e) { say(e.message, true); } render(); }
});

$('#app').innerHTML = '<div id="screen-root"></div><div id="fab-root"></div><div id="nav-root"></div>';
$('#overlay').innerHTML = '<div id="sheet-root"></div><div id="busy-root"></div><div id="toast-root"></div>';
// Installable app: the service worker lets SaveUp open from the home screen.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// The home-screen shortcut "Scan a receipt" opens #/inbox?scan.
if (location.hash.endsWith('?scan')) { history.replaceState(null, '', '#/inbox'); setTimeout(() => openSheet({ type: 'scan', id: null }), 400); }

api('/api/state').then(d => { configured = d.configured; ai = d.ai; reader = d.reader; readerName = d.readerName || ''; samples = d.samples || []; render({ firstBars: true, enter: true }); })
  .catch(e => { $('#screen-root').innerHTML = `<main class="screen">${emptyState({ icon: 'cloud', title: 'SaveUp isn’t reachable', text: e.message, action: button('Try again', { act: 'reload' }) })}</main>`; });
