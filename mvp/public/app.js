import { budgetTotals, isFullWeek } from './budget-math.js';
const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (amount, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100); }
  catch { return `${(amount / 100).toFixed(2)} ${currency}`; }
};
const icon = name => `<img class="icon" src="/assets/${name}.svg" alt="">`;
const shortDate = value => new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const start = new Date(); start.setDate(start.getDate() - start.getDay());
const end = new Date(start); end.setDate(end.getDate() + 6);
let range = { start: iso(start), end: iso(end) }, view = 'inbox', filter = 'needs', selected = null;
let data, busy = false, message = '', error = false;
const drafts = new Map();

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
const weekly = () => data.transactions.filter(t => (!range.start || t.date >= range.start) && (!range.end || t.date <= range.end));
const status = t => `<span class="pill ${t.status === 'posted' ? 'mint' : 'blue'}">${t.status === 'posted' ? 'Posted' : 'Pending'}</span>`;
function transaction(t) {
  return `<button class="transaction ${t.kind === 'transfer' && !t.reviewed ? 'purpose' : ''}" data-open="${esc(t.id)}">
    <span class="merchant-icon">${icon(t.kind === 'transfer' ? 'transfer' : 'bag')}</span>
    <span class="merchant"><strong>${esc(t.name)}</strong><small>${shortDate(t.date)} · ${esc(t.account)}</small><small class="${t.changed ? 'warning' : 'blue-text'}">${t.changed ? 'Amount changed · review again' : t.reviewed ? `Reviewed · ${esc(t.category || (t.classification === 'own' ? 'Own accounts' : t.classification))}` : t.kind === 'transfer' ? 'Purpose needed · excluded from totals' : 'Tap to review'}</small></span>
    <span class="amount"><strong>${t.direction === 'in' ? '+' : ''}${esc(money(t.amount, t.currency))}</strong>${status(t)}</span>
  </button>`;
}
function rangePicker() {
  return `<section class="range"><button class="icon-button" data-week="-1" aria-label="Previous week">${icon('left')}</button><strong>${range.start ? shortDate(range.start) + ' – ' + shortDate(range.end) : 'All imported dates'}</strong><button class="text-button" id="all-dates">All dates</button></section>
    <details class="date-details"><summary>Change date range</summary><div class="date-inputs"><label>From<input id="from" type="date" value="${range.start}"></label><label>Through<input id="through" type="date" value="${range.end}"></label><button class="text-button" data-week="1">Next week →</button></div></details>`;
}
function inbox() {
  const rows = weekly(), reviewed = rows.filter(t => t.reviewed).length;
  const pendingPurpose = rows.filter(t => !t.reviewed && t.kind === 'transfer').length;
  const visible = rows.filter(t => filter === 'all' || (filter === 'reviewed' ? t.reviewed : !t.reviewed));
  return `<h1>A little money check-in.</h1><p class="subtitle">You review. Your inbox keeps things organized.</p>
    ${rangePicker()}
    <section class="card"><div class="between"><span>This week’s review</span><strong>${reviewed} of ${rows.length} reviewed</strong></div><progress aria-label="Transactions reviewed" max="${Math.max(rows.length, 1)}" value="${reviewed}"></progress><div class="between"><small>Weeks start Sunday</small><small>${pendingPurpose} to classify</small></div></section>
    <div class="filters" aria-label="Review filter">${[['needs', 'Needs review'], ['all', 'All'], ['reviewed', 'Reviewed']].map(([id, label]) => `<button data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}</div>
    <section class="queue card">${visible.length ? visible.map(transaction).join('') : `<div class="empty"><h2>${rows.length ? 'You’re caught up.' : 'A little space for your transactions.'}</h2><p>${data.items.length ? 'Try All dates if your bank history is outside this week.' : 'Start with sample data, or connect a Sandbox bank.'}</p><button class="primary" id="open-banks">${data.items.length ? 'Manage banks' : 'Get started'}</button></div>`}</section>
    <p class="footnote">${!rows.length ? 'No transactions in this date range.' : rows.some(t => !t.reviewed) ? 'Budget totals are incomplete while transactions await review.' : 'All visible transactions have been reviewed.'} Posting and review are separate.</p>`;
}
function overview() {
  const totals = budgetTotals(data.transactions, data.budgets, range);
  const fullWeek = isFullWeek(range);
  return `<h1>Your week, a little clearer.</h1><p class="subtitle">Confirmed choices, saved on this computer.</p>${rangePicker()}
    <section class="card"><span>Reviewed spending · USD</span><div class="big-number">${money(totals.spent)}</div><p>${money(totals.pending)} is pending at the bank.</p><div class="between"><span>Confirmed income</span><strong>${money(totals.income)}</strong></div></section>
    <div><h2>Your weekly budgets</h2><p class="footnote">Starting limits are examples. Edit them to fit your week. Blue is posted; striped is pending.</p></div>
    ${fullWeek ? totals.categories.map(budgetCard).join('') : '<section class="card"><p>Choose one Sunday–Saturday week to compare spending with weekly limits. All-dates totals above are still available.</p><button class="secondary" id="this-week">Show this week’s budgets</button></section>'}
    <details class="card"><summary>Create a budget</summary><form id="new-budget-form"><label class="field">Budget name<input name="name" maxlength="60" required></label><label class="field">Weekly limit ($)<input name="limit" type="number" inputmode="decimal" min="0.01" step="0.01" required></label><label class="field">What does it cover?<input name="description" maxlength="300" required></label><button class="primary" type="submit">Create weekly budget</button></form></details>
    <p class="footnote">${totals.unreviewed} transactions still need review. Totals are incomplete until review is finished. Unresolved transfers and inflows do not count as income or spending.</p>`;
}
function budgetCard(budget) {
  const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(budget.percent);
  const postedWidth = Math.min(100, budget.posted / budget.limitCents * 100);
  const pendingWidth = Math.min(100 - postedWidth, budget.pending / budget.limitCents * 100);
  return `<section class="card budget-card"><div class="between"><h2>${esc(budget.name)}</h2><strong class="${budget.remaining < 0 ? 'warning' : ''}">${percent}%</strong></div><small>${esc(budget.description)}</small>
    <div class="between"><span>${money(budget.spent)} spent</span><strong>of ${money(budget.limitCents)}</strong></div>
    <div class="budget-bar" role="meter" aria-label="${esc(budget.name)} weekly budget" aria-valuemin="0" aria-valuemax="${budget.limitCents}" aria-valuenow="${Math.min(budget.spent, budget.limitCents)}" aria-valuetext="${percent}% used, ${budget.remaining < 0 ? money(-budget.remaining) + ' over budget' : money(budget.remaining) + ' remaining'}"><span class="posted" style="width:${postedWidth}%"></span><span class="pending" style="width:${pendingWidth}%"></span></div>
    <div class="between"><small>${money(budget.posted)} posted · ${money(budget.pending)} pending</small><strong class="${budget.remaining < 0 ? 'warning' : ''}">${budget.remaining < 0 ? money(-budget.remaining) + ' over' : money(budget.remaining) + ' left'}</strong></div>
    <details><summary>Edit weekly limit</summary><form data-budget="${esc(budget.name)}"><label class="field">Weekly limit ($)<input name="limit" aria-label="${esc(budget.name)} weekly limit" type="number" inputmode="decimal" min="0.01" step="0.01" value="${(budget.limitCents / 100).toFixed(2)}" required></label><button class="secondary" type="submit">Save limit</button></form></details>
    <details><summary>View ${budget.transactions.length} reviewed purchases</summary>${budget.transactions.length ? budget.transactions.map(t => `<div class="between category-row"><span>${esc(t.name)} <small>${t.status}</small></span><strong>${money(t.amount)}</strong></div>`).join('') : '<p class="footnote">No reviewed spending in this category this week.</p>'}</details></section>`;
}
function banks() {
  return `<h1>A place to start.</h1><p class="subtitle">Test the whole flow with fictional bank activity.</p>
    <section class="card"><span class="pill blue">No credentials needed</span><h2>Try sample data</h2><p>Load a small sample bank, review a pending purchase, then simulate it posting at a different amount.</p>
    <button class="primary" id="sample">${data.items.some(i => i.id === 'sample-bank') ? 'Sample bank loaded' : 'Load sample bank'}</button>
    ${data.items.some(i => i.id === 'sample-bank') ? '<button class="secondary" id="post-demo">Simulate $30 → $32 posting</button>' : ''}</section>
    <section class="card"><span class="pill mint">Plaid Sandbox · test banks only</span><h2>Connect through Plaid</h2><p>${data.configured ? 'Use Plaid Link to choose a test institution, or create a Sandbox test bank directly.' : 'Sandbox credentials are not configured yet. Sample data works now; the local setup guide explains how to enable Plaid.'}</p>
    <button class="primary" id="link" ${!data.configured ? 'disabled' : ''}>Connect with Plaid Link</button><button class="secondary" id="test-bank" ${!data.configured ? 'disabled' : ''}>Create Sandbox test bank</button>
    ${data.configured ? '<p class="footnote">In Link, choose First Platypus Bank. Use the Sandbox login user_good / pass_good.</p>' : ''}</section>
    ${data.items.map(item => `<section class="card"><div class="between"><h2>${esc(item.name)}</h2><span class="pill ${item.provider === 'fixture' ? 'blue' : 'mint'}">${item.provider === 'fixture' ? 'Sample' : 'Sandbox'}</span></div><p>${item.synced ? `Last imported: ${new Date(item.synced).toLocaleString()}` : 'Waiting for first import'}</p>${item.error ? `<p class="warning">${esc(item.error)} · retry importing when ready.</p>` : ''}</section>`).join('')}
    <button class="primary" id="sync" ${!data.items.some(i => i.provider === 'plaid') ? 'disabled' : ''}>Import latest Sandbox updates</button><button class="secondary" id="refresh-bank" ${!data.items.some(i => i.provider === 'plaid') ? 'disabled' : ''}>Ask Sandbox for new transactions</button>
    <p class="footnote">New bank data may take a moment. After requesting new transactions, import again. This milestone is local and single-user; no real-bank connections are enabled.</p>`;
}
function review() {
  const t = data.transactions.find(t => t.id === selected);
  if (!t) { selected = null; return inbox(); }
  const d = drafts.get(t.id);
  const transfer = t.kind === 'transfer';
  return `<button class="text-button back" id="back">${icon('left')} Back to inbox</button><h1>${transfer ? 'Give this money a purpose.' : 'One small purchase.'}</h1><p class="subtitle">${t.reviewed ? 'Edit your review' : 'Your confirmation completes this review.'}</p>
    <section class="card"><div class="between"><div><h2>${esc(t.name)}</h2><div class="big-number">${t.direction === 'in' ? '+' : ''}${esc(money(t.amount, t.currency))}</div></div><div class="purchase-icon">${icon(transfer ? 'transfer' : 'review-bag')}</div></div><div class="between"><span>${shortDate(t.date)}</span>${status(t)}</div><small>${esc(t.account)}</small>${t.changed ? '<p class="warning">The amount changed after your last review. Check it again before confirming.</p>' : ''}</section>
    <form id="review-form">
    ${transfer ? `<fieldset><legend>What was this for?</legend><div class="choices">${[['own', 'Between my own accounts'], [t.direction === 'in' ? 'income' : 'expense', t.direction === 'in' ? 'Income' : 'An expense']].map(([value, label]) => `<label class="choice"><input type="radio" name="classification" value="${value}" ${d.classification === value ? 'checked' : ''} required>${label}</label>`).join('')}</div></fieldset><p class="footnote">${t.direction === 'in' ? 'A refund or repayment? Leave it for later; linking those to earlier purchases comes next.' : 'Own-account transfers do not count as new spending.'}</p>` : ''}
    <label class="field">What did you buy? / Description<input name="description" maxlength="2000" value="${esc(d.description)}" autocomplete="off"></label>
    <label class="field" id="category-field" ${transfer && d.classification !== 'expense' ? 'hidden' : ''}>Your category<select name="category"><option value="">Choose a category</option>${data.categories.map(c => `<option ${d.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field">Comment<textarea name="note" rows="3" maxlength="2000">${esc(d.note)}</textarea></label>
    <p class="footnote">${t.currency !== 'USD' ? 'Only USD can be reviewed in this first milestone.' : 'The amount comes from your bank. Choosing a category alone does not approve it.'}</p>
    <button class="primary" type="submit" ${t.currency !== 'USD' ? 'disabled' : ''}>Confirm & save review</button><button class="secondary" type="button" id="later">Leave for later</button></form>`;
}
function render() {
  if (!data) return;
  app.innerHTML = `<div class="shell"><header><a class="brand" href="#" id="brand">${icon('mark')}<span>pocket</span></a><span class="pill blue">${data.configured ? 'Sandbox MVP' : 'Sample-data MVP'}</span><span class="avatar" aria-label="Local profile">ME</span></header>
    <main>${message ? `<div role="${error ? 'alert' : 'status'}" class="notice ${error ? 'warning' : ''}">${esc(message)}</div>` : ''}${selected ? review() : view === 'banks' ? banks() : view === 'week' ? overview() : inbox()}</main>
    <nav aria-label="Main navigation">${[['week', 'home', 'My week'], ['inbox', 'inbox', 'Inbox'], ['banks', 'more', 'Banks']].map(([id, image, label]) => `<button data-view="${id}" aria-current="${view === id && !selected ? 'page' : 'false'}">${icon(image)}<span>${label}</span></button>`).join('')}</nav></div>`;
  app.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { view = button.dataset.view; selected = null; message = ''; render(); window.scrollTo(0, 0); });
  app.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; render(); });
  app.querySelectorAll('[data-open]').forEach(button => button.onclick = () => {
    selected = button.dataset.open; const t = data.transactions.find(t => t.id === selected);
    const draft = drafts.get(selected);
    drafts.set(selected, { classification: t.classification || '', category: t.category || '', description: t.description || '', note: t.note || '', ...draft, revision: t.revision });
    message = ''; render(); window.scrollTo(0, 0);
  });
  app.querySelectorAll('[data-week]').forEach(button => button.onclick = () => {
    const first = new Date((range.start || iso(start)) + 'T12:00:00'); first.setDate(first.getDate() + 7 * Number(button.dataset.week));
    const last = new Date(first); last.setDate(last.getDate() + 6); range = { start: iso(first), end: iso(last) }; render();
  });
  const bind = (id, fn) => { const element = document.getElementById(id); if (element) element.onclick = fn; };
  bind('all-dates', () => { range = { start: '', end: '' }; render(); });
  bind('this-week', () => { range = { start: iso(start), end: iso(end) }; render(); });
  const saveBudget = async (event, name) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const limit = Number(values.limit);
    const limitCents = Math.round(limit * 100);
    if (!Number.isFinite(limit) || !Number.isSafeInteger(limitCents) || limitCents <= 0 || Math.abs(limit * 100 - limitCents) > 0.00001) {
      error = true; message = 'Enter a positive weekly limit with at most two decimal places.'; render(); window.scrollTo(0, 0); return;
    }
    await action('/api/budget', { name: name || values.name, limitCents, ...(values.description === undefined ? {} : { description: values.description }) }, 'Weekly budget saved.');
  };
  app.querySelectorAll('form[data-budget]').forEach(form => form.onsubmit = event => saveBudget(event, form.dataset.budget));
  const newBudgetForm = document.getElementById('new-budget-form');
  if (newBudgetForm) newBudgetForm.onsubmit = event => saveBudget(event);
  for (const id of ['from', 'through']) {
    const input = document.getElementById(id);
    if (input) input.onchange = () => { const from = document.getElementById('from').value, through = document.getElementById('through').value; if (from && through && from <= through) { range = { start: from, end: through }; render(); } };
  }
  for (const id of ['back', 'later']) bind(id, () => { selected = null; render(); });
  for (const id of ['brand', 'open-banks']) bind(id, e => { e.preventDefault(); view = id === 'brand' ? 'inbox' : 'banks'; selected = null; render(); });
  bind('sample', async () => { await action('/api/demo/connect', {}, 'Sample bank ready.'); if (!error) { view = 'inbox'; range = { start: '2026-11-01', end: '2026-11-07' }; render(); } });
  bind('post-demo', () => action('/api/demo/post', {}, 'The $30 pending charge was replaced by one $32 posted charge. Review it again.'));
  bind('sync', () => action('/api/sync', {}, 'Import finished. Check each bank’s status for any errors.'));
  bind('refresh-bank', () => action('/api/plaid/refresh', {}, 'Request finished. Wait a moment, then import the latest updates.'));
  bind('test-bank', () => action('/api/plaid/test-item', {}, 'Sandbox bank connected. If no transactions appear yet, import again in a moment.'));
  bind('link', openLink);
  const form = document.getElementById('review-form');
  if (form) {
    form.oninput = () => {
      const values = Object.fromEntries(new FormData(form)); Object.assign(drafts.get(selected), values);
      document.getElementById('category-field').hidden = data.transactions.find(t => t.id === selected).kind === 'transfer' && values.classification !== 'expense';
    };
    form.onsubmit = async e => {
      e.preventDefault(); const id = selected; const draft = { ...drafts.get(id), ...Object.fromEntries(new FormData(form)), id };
      await action('/api/review', draft, 'Reviewed. Saved on this computer.');
      if (!error) { drafts.delete(id); selected = null; render(); }
    };
  }
  if (busy) app.querySelectorAll('button,input,textarea,select').forEach(element => element.disabled = true);
}

async function openLink() {
  busy = true; message = 'Opening Plaid Sandbox…'; error = false; render();
  try {
    if (!window.Plaid) await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('Plaid Link could not load. Try the Sandbox test-bank button.')); }; document.head.append(script);
    });
    const { linkToken } = await request('/api/plaid/link-token', {});
    let completed = false;
    const handler = window.Plaid.create({ token: linkToken,
      onSuccess: async publicToken => { completed = true; handler.destroy(); await action('/api/plaid/exchange', { publicToken }, 'Sandbox connected. Import again in a moment if history is still preparing.'); },
      onExit: () => { if (completed) return; handler.destroy(); busy = false; message = 'Connection closed. You can try again.'; render(); }
    });
    handler.open();
  } catch (e) { busy = false; error = true; message = e.message; render(); }
}
try { data = await request('/api/state'); render(); }
catch { app.innerHTML = '<main><h1>Could not open your inbox.</h1><p>Start the local MVP server and reload this page.</p></main>'; }
