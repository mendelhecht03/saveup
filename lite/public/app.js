import * as L from './logic.mjs';

let S = null, csrf = '', sheet = null, busy = '', toast = null, weekOffset = 0, search = '', editPlans = false;
const openBudgets = new Set();
let tab = (() => { try { return localStorage.getItem('lite-tab') || 'inbox'; } catch { return 'inbox'; } })();

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amount = t => t.amountCents < 0 ? `+${money(-t.amountCents)}` : money(t.amountCents);
const toCents = v => { const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) && String(v).trim() ? Math.round(n * 100) : NaN; };
const shortDate = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDate = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const cat = id => S.categories.find(c => c.id === id);
const account = t => t.source === 'manual' ? 'Logged by hand' : (S.accounts[t.accountId] ? `${S.accounts[t.accountId].name}${S.accounts[t.accountId].mask ? ` ••${S.accounts[t.accountId].mask}` : ''}` : 'Bank');
const byDate = (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name);

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
  busy = wait; render();
  try { await fn(); if (done) say(done); } catch (e) { say(e.message, true); } finally { busy = ''; render(); }
}
function say(message, error = false) {
  toast = { message, error };
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { toast = null; render(); }, 3500);
}

// ---------- shared pieces
function statusPills(t) {
  const p = [];
  if (t.pending) p.push('<span class="pill pending">Pending</span>');
  if (t.source === 'manual') p.push(t.verified ? '<span class="pill">Cash</span>' : '<span class="pill pending">Unverified · waiting for bank</span>');
  if (t.transfer && !t.reviewed) p.push('<span class="pill warn">Transfer · not counted yet</span>');
  if (t.amountChanged) p.push('<span class="pill warn">Amount changed</span>');
  if (t.matchedFrom) p.push('<span class="pill ok">Matched</span>');
  return p.join('');
}
function row(t) {
  const c = cat(t.categoryId), sug = !t.reviewed && L.suggest(S, t), sc = sug && cat(sug.categoryId);
  const icon = t.transfer ? '🔁' : (c || sc)?.emoji || (t.source === 'manual' ? '✍️' : '🏦');
  let sub = c ? c.name : t.transfer ? (t.transferKind === 'own' ? 'Between my accounts' : t.transferKind === 'income' ? 'Income' : 'Transfer · needs a purpose') : sc ? `${sc.name}?` : 'Needs a budget';
  if (t.reviewed && t.note) sub += ` · ${t.note}`;
  return `<button class="row" data-act="open" data-id="${esc(t.id)}">
    <span class="icon">${icon}</span>
    <span class="grow"><b>${esc(t.name)}</b><small>${shortDate(t.date)} · ${esc(sub)}</small>${statusPills(t) ? `<span class="pills">${statusPills(t)}</span>` : ''}</span>
    <span class="amt ${t.amountCents < 0 ? 'in' : ''}">${amount(t)}</span></button>`;
}
const catChips = (selected, name = 'cat') => `<div class="chips">${S.categories.map(c => `<label class="chip"><input type="radio" name="${name}" value="${esc(c.id)}" ${c.id === selected ? 'checked' : ''}><span>${c.emoji} ${esc(c.name)}</span></label>`).join('')}</div>`;

// ---------- tabs
function inboxView() {
  const today = L.todayISO(), { start, end } = L.weekRange(today, weekOffset);
  const week = S.txns.filter(t => t.date >= start && t.date <= end).sort(byDate);
  const open = week.filter(t => !t.reviewed), done = week.filter(t => t.reviewed);
  const older = S.txns.filter(t => !t.reviewed && t.date < start).sort(byDate);
  const label = weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : `${shortDate(start)} – ${shortDate(end)}`;
  return `
    <header class="top"><p class="eyebrow">${shortDate(start)} – ${shortDate(end)}</p><h1>Inbox</h1></header>
    <div class="weeknav"><button class="round" data-act="week" data-d="-1" aria-label="Previous week">‹</button><span>${label}</span><button class="round" data-act="week" data-d="1" ${weekOffset >= 0 ? 'disabled' : ''} aria-label="Next week">›</button></div>
    <section class="card hero"><div><b class="big">${open.length}</b><span>to review</span></div><div><b class="big">${money(L.weekSpending(S, today, weekOffset))}</b><span>spent</span></div></section>
    ${!S.items.length && !S.txns.length ? `<section class="card empty"><span class="icon big">🏦</span><p>Connect a test bank to fill your inbox.</p><button class="btn primary" data-act="tab" data-tab="banks">Connect a bank</button></section>` : ''}
    ${open.length ? `<section class="list">${open.map(row).join('')}</section>` : S.txns.length ? '<section class="card empty"><span class="icon big">🎉</span><p>All caught up for this week.</p></section>' : ''}
    ${older.length ? `<button class="card banner" data-act="jump" data-date="${older[0].date}">⏳ ${older.length} older purchase${older.length > 1 ? 's' : ''} still need${older.length > 1 ? '' : 's'} review <span>›</span></button>` : ''}
    ${done.length ? `<details class="done"><summary>Reviewed this week (${done.length})</summary><section class="list">${done.map(row).join('')}</section></details>` : ''}
    <div class="actions"><button class="btn primary" data-act="manual">＋ Log a purchase</button></div>`;
}

function budgetsView() {
  const today = L.todayISO();
  const period = c => c.interval === 'weekly' ? 'This week' : c.interval === 'monthly' ? new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'long' }) : today.slice(0, 4);
  return `
    <header class="top split"><div><p class="eyebrow">Your limits</p><h1>Budgets</h1></div><button class="btn small" data-act="category">＋ New</button></header>
    ${L.budgetSummary(S, today).map(b => {
      const open = openBudgets.has(b.id), over = b.total > b.limitCents;
      const posted = Math.min(100, Math.max(0, b.spent) * 100 / b.limitCents);
      const pend = Math.min(100 - posted, Math.max(0, b.pending) * 100 / b.limitCents);
      const left = b.limitCents - b.total;
      return `<article class="card budget ${open ? 'open' : ''}">
        <button class="budget-head" data-act="toggle-budget" data-id="${esc(b.id)}" aria-expanded="${open}">
          <span class="icon">${b.emoji}</span>
          <span class="grow"><b>${esc(b.name)}</b><small>${period(b)} · ${over ? `<em class="over">${money(-left)} over</em>` : `${money(left)} left`}</small></span>
          <span class="pct ${over ? 'over' : ''}">${b.pct}%</span><span class="chev">›</span>
        </button>
        <div class="bar ${over ? 'over' : ''}"><i class="posted" style="width:${posted}%"></i><i class="pend" style="width:${pend}%"></i></div>
        <p class="caption">${money(b.spent)} spent${b.pending ? ` · <span class="pend-text">${money(b.pending)} pending</span>` : ''} of ${money(b.limitCents)}${b.plannedHigh ? ` · ${money(b.plannedLow)}–${money(b.plannedHigh)} planned` : ''}</p>
        ${open ? `<div class="expand"><p class="muted">${esc(b.description)}</p>${b.txns.length ? `<div class="list flat">${b.txns.map(row).join('')}</div>` : '<p class="muted">Nothing here this period yet.</p>'}<button class="btn ghost small" data-act="category" data-id="${esc(b.id)}">Edit budget</button></div>` : ''}
      </article>`;
    }).join('')}`;
}

function historyList() {
  const q = search.trim().toLowerCase();
  const hits = S.txns.filter(t => !q || [t.name, t.note, cat(t.categoryId)?.name, money(Math.abs(t.amountCents)), account(t)].some(v => String(v || '').toLowerCase().includes(q))).sort(byDate);
  if (!hits.length) return `<p class="muted center">${S.txns.length ? 'No matches.' : 'No transactions yet.'}</p>`;
  let html = '', last = '';
  for (const t of hits) {
    if (t.date !== last) { html += `<h3 class="day">${longDate(t.date)}</h3>`; last = t.date; }
    html += row(t);
  }
  return `<section class="list">${html}</section>`;
}
const historyView = () => `
  <header class="top"><p class="eyebrow">Everything</p><h1>History</h1></header>
  <input class="search" id="search" type="search" placeholder="Search merchant, budget, note, amount" value="${esc(search)}">
  <div id="history-list">${historyList()}</div>`;

function plansView() {
  const low = S.plans.reduce((s, p) => s + p.lowCents, 0), high = S.plans.reduce((s, p) => s + p.highCents, 0);
  return `
    <header class="top split"><div><p class="eyebrow">Saving up for</p><h1>Plans</h1></div>
      <span class="row-btns">${S.plans.length ? `<button class="btn small ghost" data-act="edit-plans">${editPlans ? 'Done' : 'Edit'}</button>` : ''}<button class="btn small" data-act="plan">＋ New</button></span></header>
    ${S.plans.length ? `<section class="card hero"><div><b class="big">${money(low)}–${money(high)}</b><span>planned in total</span></div></section>` : '<section class="card empty"><span class="icon big">🧥</span><p>Log something you plan to buy, with a low and high estimate.</p></section>'}
    <section class="list">${S.plans.map(p => `
      <div class="row plan">
        <button class="grow plain" data-act="plan" data-id="${esc(p.id)}"><b>${esc(p.name)}</b><small>${cat(p.categoryId) ? `${cat(p.categoryId).emoji} ${esc(cat(p.categoryId).name)}` : 'No budget'}${p.essential ? ' · <span class="pill ok">Essential</span>' : ''}</small></button>
        <span class="amt">${money(p.lowCents)}–${money(p.highCents)}</span>
        ${editPlans ? `<button class="round danger" data-act="delete-plan" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">✕</button>` : ''}
      </div>`).join('')}</section>`;
}

function banksView(configured) {
  const ago = iso => { if (!iso) return 'never'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  return `
    <header class="top split"><div><p class="eyebrow">Plaid Sandbox</p><h1>Banks</h1></div>${S.items.length ? '<button class="btn small" data-act="sync">↻ Sync</button>' : ''}</header>
    ${!configured ? '<section class="card notice">Plaid keys are missing. Add Sandbox keys to <code>lite/.env.local</code> and restart.</section>' : ''}
    ${S.items.map(i => `<article class="card bank">
      <div class="split"><div><b>🏦 ${esc(i.name)}</b><small class="muted">Synced ${ago(i.lastSync)}</small></div><button class="btn small ghost danger" data-act="remove-item" data-id="${esc(i.id)}">Remove</button></div>
      ${i.error ? `<p class="notice">${esc(i.error)}</p>` : ''}
      <ul class="accounts">${Object.values(S.accounts).filter(a => a.itemId === i.id).map(a => `<li>${esc(a.name)} <span class="muted">••${esc(a.mask)}</span></li>`).join('')}</ul>
    </article>`).join('')}
    <section class="card stack">
      <button class="btn primary" data-act="instant">⚡ Add instant test bank</button>
      <button class="btn ghost" data-act="link">Connect with Plaid Link</button>
      <p class="muted small">Link test login: <b>user_transactions_dynamic</b> / any password (or user_good / pass_good). Only the dynamic user accepts fake charges below.</p>
    </section>
    ${S.items.length ? `<section class="card stack lab">
      <h2>🧪 Test lab</h2><p class="muted small">Send a fake charge through Plaid Sandbox, then watch it land in your inbox.</p>
      <div class="chips">${[["Kahan's", 2.53], ['Zelle to Sam', 40], ['Zelle from Mom', -100], ['Shell gas', 38.2], ['Trader Joes', 64.17]].map(([d, a]) => `<button class="chip-btn" data-act="preset" data-d="${esc(d)}" data-a="${a}">${esc(d)} ${a < 0 ? '+' : ''}$${Math.abs(a).toFixed(2)}</button>`).join('')}</div>
      <form data-form="charge" class="stack">
        <label>Bank<select name="itemId">${S.items.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}</select></label>
        <label>Description<input name="description" required maxlength="60" placeholder="e.g. Kahan's"></label>
        <div class="two"><label>Amount<input name="amount" required inputmode="decimal" placeholder="2.53"></label>
          <label>Direction<select name="dir"><option value="out">Money out</option><option value="in">Money in</option></select></label></div>
        <label>Days ago<input name="daysAgo" type="number" min="0" max="13" value="0"></label>
        <button class="btn primary">Send to Plaid</button>
      </form></section>` : ''}`;
}

// ---------- sheets
function txnSheet(t) {
  const sug = !t.reviewed && L.suggest(S, t);
  const selected = t.categoryId || sug?.categoryId || '', kind = t.transferKind || sug?.transferKind || '';
  return `<form data-form="confirm" data-id="${esc(t.id)}" class="stack">
    <p class="sheet-amt ${t.amountCents < 0 ? 'in' : ''}">${amount(t)}</p>
    <h2 class="center">${esc(t.name)}</h2>
    <p class="muted center">${longDate(t.date)} · ${esc(account(t))}</p>
    <div class="pills center">${statusPills(t)}</div>
    ${t.amountChanged ? '<p class="notice">The final amount changed, so this needs another look.</p>' : ''}
    ${t.matchedFrom ? `<p class="notice ok">Matched to “${esc(t.matchedFrom)}”, which you logged by hand.</p>` : ''}
    ${sug ? `<p class="hint">💡 Suggested from ${sug.exact ? 'an identical past purchase' : 'this merchant'}. Check it, then confirm.</p>` : ''}
    ${t.transfer ? `<fieldset><legend>What was this transfer?</legend><div class="seg">
      <label><input type="radio" name="kind" value="income" ${kind === 'income' ? 'checked' : ''} ${t.amountCents > 0 ? 'disabled' : ''}><span>Income</span></label>
      <label><input type="radio" name="kind" value="spending" ${kind === 'spending' ? 'checked' : ''} ${t.amountCents < 0 ? 'disabled' : ''}><span>Spending</span></label>
      <label><input type="radio" name="kind" value="own" ${kind === 'own' ? 'checked' : ''}><span>My accounts</span></label></div>
      <small class="muted">Transfers don't count anywhere until you say what they were.</small></fieldset>` : ''}
    <fieldset class="cats" ${t.transfer && kind !== 'spending' ? 'hidden' : ''}><legend>Budget</legend>${catChips(selected)}</fieldset>
    <label>Comment<textarea name="note" rows="2" maxlength="500" placeholder="e.g. speeding ticket, gift for Sam">${esc(t.note)}</textarea></label>
    <label>How essential was it?<input type="range" name="priority" min="1" max="5" value="${t.priority || 3}"><span class="range-labels"><span>Want</span><span>Need</span></span></label>
    <button class="btn primary">${t.reviewed ? 'Save changes' : 'Confirm'}</button>
    ${t.reviewed && t.source !== 'manual' ? `<button type="button" class="btn ghost" data-act="unreview" data-id="${esc(t.id)}">Move back to inbox</button>` : ''}
    ${t.source === 'manual' ? `<button type="button" class="btn ghost danger" data-act="delete-txn" data-id="${esc(t.id)}">Delete purchase</button>` : ''}
  </form>`;
}
const manualSheet = () => `<form data-form="manual" class="stack">
  <h2>Log a purchase</h2>
  <label>Merchant<input name="merchant" required maxlength="100" placeholder="e.g. Target"></label>
  <div class="two"><label>Amount<input name="amount" required inputmode="decimal" placeholder="0.00"></label><label>Date<input name="date" type="date" required value="${L.todayISO()}"></label></div>
  <fieldset><legend>Budget</legend>${catChips('')}</fieldset>
  <label>What did you buy?<textarea name="note" rows="2" maxlength="500" placeholder="e.g. shampoo, chocolate bar"></textarea></label>
  <label class="toggle"><input type="checkbox" name="expectMatch" checked><span>Paid by card. Match it when the bank charge arrives.</span></label>
  <p class="muted small">Matched purchases stay “unverified” until a bank charge with the exact same amount shows up. Turn this off for cash.</p>
  <button class="btn primary">Save purchase</button></form>`;
const EMOJI = ['🧴', '🛒', '🎡', '✈️', '💆', '🏠', '🎓', '🍔', '☕', '🎁', '🐶', '💊', '👕', '🚗', '📱', '💡'];
function categorySheet(c) {
  const e = c?.emoji || '🛒';
  return `<form data-form="category" data-id="${esc(c?.id || '')}" class="stack">
    <h2>${c ? 'Edit budget' : 'New budget'}</h2>
    <div class="chips emoji">${EMOJI.map(x => `<label class="chip"><input type="radio" name="emoji" value="${x}" ${x === e ? 'checked' : ''}><span>${x}</span></label>`).join('')}</div>
    <label>Name<input name="name" required maxlength="40" value="${esc(c?.name)}" placeholder="e.g. Coffee"></label>
    <label>Description<textarea name="description" required rows="2" maxlength="200" placeholder="What belongs here? Helps SaveUp suggest it.">${esc(c?.description)}</textarea></label>
    <div class="two"><label>Limit<input name="limit" required inputmode="decimal" value="${c ? (c.limitCents / 100).toFixed(2) : ''}" placeholder="50.00"></label>
      <label>Every<select name="interval">${L.INTERVALS.map(i => `<option value="${i}" ${(c?.interval || 'weekly') === i ? 'selected' : ''}>${i.replace('ly', '')}</option>`).join('')}</select></label></div>
    <button class="btn primary">Save budget</button>
    ${c ? `<button type="button" class="btn ghost danger" data-act="delete-category" data-id="${esc(c.id)}">Delete budget</button>` : ''}</form>`;
}
function planSheet(p) {
  return `<form data-form="plan" data-id="${esc(p?.id || '')}" class="stack">
    <h2>${p ? 'Edit plan' : 'Plan a purchase'}</h2>
    <label>Item<input name="name" required maxlength="80" value="${esc(p?.name)}" placeholder="e.g. Winter coat"></label>
    <div class="two"><label>Low<input name="low" required inputmode="decimal" value="${p ? (p.lowCents / 100).toFixed(2) : ''}" placeholder="100"></label>
      <label>High<input name="high" required inputmode="decimal" value="${p ? (p.highCents / 100).toFixed(2) : ''}" placeholder="150"></label></div>
    <label>Budget<select name="categoryId"><option value="">None</option>${S.categories.map(c => `<option value="${esc(c.id)}" ${p?.categoryId === c.id ? 'selected' : ''}>${c.emoji} ${esc(c.name)}</option>`).join('')}</select></label>
    <label class="toggle"><input type="checkbox" name="essential" ${p?.essential ? 'checked' : ''}><span>Essential</span></label>
    <button class="btn primary">Save plan</button></form>`;
}
function sheetHTML() {
  if (!sheet) return '';
  const body = sheet.type === 'txn' ? txnSheet(S.txns.find(t => t.id === sheet.id) || (sheet = null, {})) : sheet.type === 'manual' ? manualSheet()
    : sheet.type === 'category' ? categorySheet(cat(sheet.id)) : planSheet(S.plans.find(p => p.id === sheet.id));
  if (!sheet) return '';
  return `<div class="backdrop" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><button class="round close" data-act="close" aria-label="Close">✕</button>${body}</div>`;
}

let configured = true;
function render() {
  if (!S) return;
  const views = { inbox: inboxView, budgets: budgetsView, history: historyView, plans: plansView, banks: () => banksView(configured) };
  // Badge = this week's to-dos only; years of Sandbox history would otherwise show "300+".
  const week = L.weekRange(L.todayISO());
  const open = S.txns.filter(t => !t.reviewed && t.date >= week.start && t.date <= week.end).length;
  const tabs = [['inbox', '📥', 'Inbox'], ['budgets', '🎯', 'Budgets'], ['history', '🧾', 'History'], ['plans', '🧥', 'Plans'], ['banks', '🏦', 'Banks']];
  const focused = document.activeElement?.id === 'search';
  $('#app').innerHTML = `<main>${views[tab]()}</main>
    <nav class="tabs">${tabs.map(([id, icon, label]) => `<button class="${tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}"><span>${icon}${id === 'inbox' && open ? `<i class="badge">${open}</i>` : ''}</span>${label}</button>`).join('')}</nav>
    ${sheetHTML()}
    ${busy ? `<div class="busy"><div class="card"><span class="spin"></span>${esc(busy)}</div></div>` : ''}
    ${toast ? `<div class="toast ${toast.error ? 'error' : ''}" role="status">${esc(toast.message)}</div>` : ''}`;
  document.body.classList.toggle('locked', Boolean(sheet));
  if (focused) { const s = $('#search'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}

// ---------- events
const weeksBetween = (a, b) => Math.round((Date.parse(L.weekRange(a).start) - Date.parse(L.weekRange(b).start)) / (7 * 864e5));
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act: a, id } = el.dataset;
  const handlers = {
    tab: () => { tab = el.dataset.tab; sheet = null; try { localStorage.setItem('lite-tab', tab); } catch { /* private mode */ } scrollTo(0, 0); },
    week: () => { weekOffset = Math.min(0, weekOffset + Number(el.dataset.d)); },
    jump: () => { weekOffset = weeksBetween(el.dataset.date, L.todayISO()); },
    open: () => { sheet = { type: 'txn', id }; },
    manual: () => { sheet = { type: 'manual' }; },
    category: () => { sheet = { type: 'category', id }; },
    plan: () => { sheet = { type: 'plan', id }; },
    close: () => { sheet = null; },
    'toggle-budget': () => { openBudgets.has(id) ? openBudgets.delete(id) : openBudgets.add(id); },
    'edit-plans': () => { editPlans = !editPlans; },
    'delete-plan': () => act(() => api('/api/plan/delete', { id })),
    unreview: () => act(async () => { await api('/api/txn/unreview', { id }); sheet = null; }, { done: 'Back in the inbox' }),
    'delete-txn': () => confirm('Delete this purchase?') && act(async () => { await api('/api/txn/delete', { id }); sheet = null; }),
    'delete-category': () => confirm('Delete this budget? Its bank purchases go back to the inbox.') && act(async () => { await api('/api/category/delete', { id }); sheet = null; }),
    'remove-item': () => confirm('Remove this bank and its transactions?') && act(() => api('/api/items/remove', { itemId: id }), { done: 'Bank removed' }),
    sync: () => act(() => api('/api/sync', {}), { wait: 'Syncing with Plaid…', done: 'Up to date' }),
    instant: () => act(() => api('/api/sandbox/instant', {}), { wait: 'Creating a test bank and loading transactions…', done: 'Test bank connected' }),
    link: () => openLink(),
    preset: () => { const f = $('form[data-form="charge"]'); f.description.value = el.dataset.d; f.amount.value = Math.abs(el.dataset.a); f.dir.value = el.dataset.a < 0 ? 'in' : 'out'; return false; }
  };
  // false = handled without a redraw (keeps typed form values); a Promise redraws itself.
  const result = handlers[a]?.();
  if (result !== false && !(result instanceof Promise)) render();
});
document.addEventListener('change', e => {
  if (e.target.name === 'kind') $('.sheet .cats').hidden = e.target.value !== 'spending';
});
document.addEventListener('input', e => {
  if (e.target.id === 'search') { search = e.target.value; $('#history-list').innerHTML = historyList(); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, v = Object.fromEntries(new FormData(f)), id = f.dataset.id || undefined;
  const forms = {
    confirm: () => act(async () => { await api('/api/txn/confirm', { id, categoryId: v.cat || null, transferKind: v.kind || null, note: v.note, priority: Number(v.priority) }); sheet = null; }, { done: 'Confirmed ✓' }),
    manual: () => act(async () => { await api('/api/txn/manual', { merchant: v.merchant, amountCents: toCents(v.amount), date: v.date, categoryId: v.cat || null, note: v.note, expectMatch: Boolean(v.expectMatch) }); sheet = null; }, { done: 'Purchase logged' }),
    category: () => act(async () => { await api('/api/category/save', { id, emoji: v.emoji, name: v.name, description: v.description, limitCents: toCents(v.limit), interval: v.interval }); sheet = null; }, { done: 'Budget saved' }),
    plan: () => act(async () => { await api('/api/plan/save', { id, name: v.name, lowCents: toCents(v.low), highCents: toCents(v.high), categoryId: v.categoryId || null, essential: Boolean(v.essential) }); sheet = null; }, { done: 'Plan saved' }),
    charge: () => act(() => api('/api/sandbox/charge', { itemId: v.itemId, description: v.description, amountCents: toCents(v.amount) * (v.dir === 'in' ? -1 : 1), daysAgo: Number(v.daysAgo) }), { wait: 'Sending to Plaid and waiting for it to post…', done: 'Charge arrived. Check your inbox.' })
  };
  forms[f.dataset.form]?.();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) { sheet = null; render(); } });

async function openLink() {
  if (!window.Plaid) return say('Plaid Link is still loading. Try again in a moment.', true);
  try {
    const { linkToken } = await api('/api/link-token', {});
    window.Plaid.create({
      token: linkToken,
      onSuccess: (publicToken, meta) => act(() => api('/api/exchange', { publicToken, institution: meta?.institution?.name }), { wait: 'Connecting and loading transactions…', done: 'Bank connected' }),
      onExit: err => { if (err) say(err.display_message || err.error_message || 'Link closed.', true); }
    }).open();
  } catch (e) { say(e.message, true); render(); }
}

// Pull down at the top of the page to sync.
let pullStart = null;
const ptr = $('#ptr');
addEventListener('touchstart', e => { pullStart = scrollY <= 0 && !sheet && S?.items.length ? e.touches[0].clientY : null; }, { passive: true });
addEventListener('touchmove', e => {
  if (pullStart === null) return;
  const d = e.touches[0].clientY - pullStart;
  ptr.style.transform = `translateY(${Math.min(d, 90) - 60}px)`;
  ptr.textContent = d > 80 ? '↻ Release to sync' : '↓ Pull to refresh';
}, { passive: true });
addEventListener('touchend', e => {
  if (pullStart === null) return;
  const d = e.changedTouches[0].clientY - pullStart;
  pullStart = null; ptr.style.transform = '';
  if (d > 80) act(() => api('/api/sync', {}), { wait: 'Syncing with Plaid…', done: 'Up to date' });
});

api('/api/state').then(d => { configured = d.configured; render(); }).catch(e => { $('#app').innerHTML = `<p class="loading">${esc(e.message)}</p>`; });
