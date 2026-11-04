// SaveUp app shell: loads state from the server, routes between screens, and
// wires taps, forms, swipes and pull-to-refresh. Screens are plain functions in
// screens/*.mjs; every piece of UI comes from ui/components.mjs.
import * as L from './logic.mjs';
import { bottomNav, sheet as sheetFrame, toast as toastView, esc } from './ui/components.mjs';
import { capture, play, closeSheet, enableSwipe, enablePullToRefresh } from './ui/motion.mjs';
import { inboxScreen } from './screens/inbox.mjs';
import { budgetsScreen } from './screens/budgets.mjs';
import { plannedScreen } from './screens/planned.mjs';
import { moreScreen, accountsScreen, historyScreen, historyList, historyHits, labScreen } from './screens/more.mjs';
import { galleryScreen } from './screens/gallery.mjs';
import { reviewSheet, manualSheet, categorySheet, planSheet, scanSheet, iconEmoji, PRIORITY_STOPS } from './screens/sheets.mjs';
import { byDate } from './screens/shared.mjs';

let S = null, csrf = '', configured = true, busy = '', sheet = null, toastTimer = 0;
const ui = { weekOffset: 0, showAll: false, openBudgets: new Set(), editPlans: false, search: '' };
const $ = s => document.querySelector(s);
const toCents = v => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(v).trim() ? Math.round(n * 100) : NaN; };

// ---- routing: #/inbox, #/budgets, #/planned, #/more, #/more/history ...
const ROUTES = { inbox: inboxScreen, budgets: budgetsScreen, planned: plannedScreen, more: moreScreen, 'more/accounts': accountsScreen, 'more/history': historyScreen, 'more/lab': labScreen, 'more/gallery': galleryScreen };
const route = () => { const r = location.hash.replace(/^#\/?/, ''); return ROUTES[r] ? r : 'inbox'; };
const go = to => { if (route() !== to) location.hash = `/${to}`; else render(); };
addEventListener('hashchange', () => { if (sheet) shut(); scrollTo(0, 0); render({ enter: true }); });

async function api(path, body) {
  const post = body !== undefined;
  const r = await fetch(path, { method: post ? 'POST' : 'GET', headers: post ? { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': csrf } : {}, body: post ? JSON.stringify(body) : undefined });
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
  const r = route(), tab = r.split('/')[0];
  const focused = document.activeElement?.id === 'search';
  $('#screen-root').innerHTML = `<main class="screen${enter ? ' screen-enter' : ''}">${ROUTES[r]({ S, ui, today: L.todayISO(), configured })}</main>`;
  $('#nav-root').innerHTML = bottomNav(tab, { badge: weekBadge() });
  if (focused) { const s = $('#search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  play(prev, document, { firstBars: firstBars || enter });
}
function openSheet(next) {
  sheet = next;
  const t = sheet.type === 'txn' && S.txns.find(x => x.id === sheet.id);
  if (sheet.type === 'txn' && !t) return shut();
  const views = {
    txn: () => [reviewSheet(S, t), t.reviewed ? 'Purchase' : 'Review purchase'],
    manual: () => [manualSheet(S, L.todayISO()), 'Add purchase'],
    category: () => { const c = S.categories.find(x => x.id === sheet.id); return [categorySheet(S, c), c ? `${c.name} budget` : 'New budget']; },
    plan: () => { const p = S.plans.find(x => x.id === sheet.id); return [planSheet(S, p), p ? 'Edit plan' : 'Plan a purchase']; },
    scan: () => [scanSheet(S.txns.find(x => x.id === sheet.id)), 'Scan receipt']
  };
  const [body, title] = views[sheet.type]();
  $('#sheet-root').innerHTML = sheetFrame(body, { title });
  document.body.classList.add('is-locked');
  $('#sheet-root .sheet-body').scrollTop = 0;
}
function shut(after) {
  sheet = null;
  closeSheet(() => { $('#sheet-root').innerHTML = ''; document.body.classList.remove('is-locked'); after?.(); });
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
    manual: () => openSheet({ type: 'manual' }),
    scan: () => openSheet({ type: 'scan' }),
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
    instant: () => act(() => api('/api/sandbox/instant', {}), { wait: 'Creating a test bank and loading purchases…', done: 'Test bank connected' }),
    link: () => openLink(),
    preset: () => { const f = $('form[data-form="charge"]'); f.description.value = el.dataset.d; f.amount.value = (Math.abs(el.dataset.a) / 100).toFixed(2); f.querySelector(`[name="dir"][value="${el.dataset.a < 0 ? 'in' : 'out'}"]`).checked = true; }
  };
  handlers[a]?.();
});

document.addEventListener('change', e => {
  if (e.target.name === 'kind') { const cats = $('.sheet .cats'); if (cats) cats.hidden = e.target.value !== 'spending'; }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') { ui.search = t.value; $('#history-list').innerHTML = historyList(S, historyHits(S, ui.search)); }
  if (t.type === 'range') t.style.setProperty('--fill', `${((t.value - t.min) * 100 / (t.max - t.min)).toFixed(2)}%`);
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
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) shut(); });

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
    openSheet({ type: 'scan', id: row.dataset.id });
  }
});
enablePullToRefresh($('#ptr'), {
  canStart: () => !sheet && !busy && S?.items.length > 0,
  onRefresh: async () => { try { await api('/api/sync', {}); say('Up to date'); } catch (e) { say(e.message, true); } render(); }
});

$('#app').innerHTML = '<div id="screen-root"></div><div id="nav-root"></div>';
$('#overlay').innerHTML = '<div id="sheet-root"></div><div id="busy-root"></div><div id="toast-root"></div>';
api('/api/state').then(d => { configured = d.configured; render({ firstBars: true, enter: true }); })
  .catch(e => { $('#screen-root').innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
