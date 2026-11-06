// Add purchase, Splitwise style: a full-screen card that slides up with the
// keyboard already on "Where?", two big lines (store and amount) centered on the
// screen, "Paid by card", and a toolbar resting on the keyboard with the date,
// budget, receipt and note. Round Cancel and Save buttons sit at the top.
// The budget guesses itself from the store as you type, shown as a suggestion until you save.
import * as L from '../logic.mjs';
import { iconTile, esc } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { catArt } from './shared.mjs';

const words = s => String(s || '').toLowerCase().match(/[a-z]{4,}/g) || [];

// Best budget for a store name: your own past choice for that store first, then a
// budget whose name or description shares a word with it. Null when unsure.
export function guessBudget(S, merchant) {
  const name = String(merchant || '').trim();
  if (name.length < 2) return null;
  const rule = L.suggest(S, { name, amountCents: 0, transfer: false, source: 'manual', reviewed: false });
  if (rule?.categoryId) return S.categories.find(c => c.id === rule.categoryId) || null;
  const typed = new Set(words(name));
  return S.categories.find(c => words(`${c.name} ${c.description}`).some(w => typed.has(w))) || null;
}

const dayLabel = (iso, today) => iso === today ? 'today' : iso === L.addDays(today, -1) ? 'yesterday'
  : new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function quickAddSheet(S, today) {
  const cats = S.categories.map(c => `<button type="button" class="qa-cat" data-act="qa-pick" data-id="${esc(c.id)}">${iconTile(catArt(c), { emoji: c.emoji, size: 'sm', round: true })}<span>${esc(c.name)}</span></button>`).join('');
  return `<form data-form="manual" class="composer" role="dialog" aria-modal="true" aria-label="Add purchase" novalidate>    <header class="composer-bar">
      <button type="button" class="composer-round" data-act="close" aria-label="Cancel">${line('close', { size: 22 })}</button>
      <b>Add purchase</b>
      <button type="submit" class="composer-save" disabled aria-label="Save">${line('check', { size: 24 })}</button>
    </header>
    <div class="composer-body">
      <div class="composer-fields">
        <label class="composer-line"><span class="composer-icon" data-qa-icon>${iconTile('store', { size: 'md' })}</span>
          <input name="merchant" placeholder="Where?" autocomplete="off" autocapitalize="words" enterkeyhint="next" maxlength="100" aria-label="Where did you buy it?"></label>
        <label class="composer-line composer-amount"><span class="composer-icon composer-dollar" aria-hidden="true">$</span>
          <input name="amount" placeholder="0.00" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label="Amount"></label>
        <p class="composer-sentence">Paid by <button type="button" class="qa-chip" data-act="qa-paid" aria-label="Paid with card. Tap for cash."><span data-qa-paid>card</span></button></p>
        <p class="composer-hint" data-qa-hint>Waits for the bank charge, then counts once.</p>
        <label class="composer-note" hidden><textarea name="note" rows="2" maxlength="500" placeholder="Add a note"></textarea></label>
      </div>
      <div class="qa-picker" hidden><b class="qa-picker-title">Which budget?</b><div class="qa-cats">${cats}</div></div>
      <input type="hidden" name="paid" value="card"><input type="hidden" name="cat" value="">
    </div>
    <footer class="composer-tools">
      <label class="qa-tool qa-date">${line('calendar', { size: 22 })}<span data-qa-day>${dayLabel(today, today)}</span><input type="date" name="date" value="${esc(today)}" max="${esc(today)}" aria-label="Date"></label>
      <button type="button" class="qa-tool qa-budget is-empty" data-act="qa-cat" aria-expanded="false"><span class="qa-budget-icon" data-qa-icon-sm>${line('budgets', { size: 22 })}</span><span data-qa-cat>Pick a budget</span></button>
      <button type="button" class="qa-icon-tool" data-act="scan" aria-label="Scan a receipt instead">${line('camera', { size: 24 })}</button>
      <button type="button" class="qa-icon-tool" data-act="qa-note" aria-label="Add a note">${line('pencil', { size: 24 })}</button>
    </footer>
  </form>`;
}

// Live updates as the person types or taps: the icon and budget follow the store
// until a budget is picked by hand; Save lights up once store, amount and budget are set.
export function refreshQuickAdd(S, form, today) {
  const amount = Number(String(form.amount.value).replace(/[$,\s]/g, ''));
  const picked = form.dataset.picked === '1';
  if (!picked) {
    const c = guessBudget(S, form.merchant.value);
    form.cat.value = c?.id || '';
    form.dataset.guess = c ? '1' : '';
  }
  const c = S.categories.find(x => x.id === form.cat.value);
  const chip = form.querySelector('[data-act="qa-cat"]');
  form.querySelector('[data-qa-cat]').textContent = c ? c.name : 'Pick a budget';
  chip.classList.toggle('is-empty', !c);
  chip.classList.toggle('is-guess', Boolean(c) && !picked);
  form.querySelector('[data-qa-icon]').innerHTML = iconTile(c ? catArt(c) : 'store', { emoji: c?.emoji, size: 'md' });
  form.querySelector('[data-qa-icon-sm]').innerHTML = c ? iconTile(catArt(c), { emoji: c.emoji, size: 'sm', round: true }) : line('budgets', { size: 22 });
  form.querySelector('[data-qa-day]').textContent = form.date.value ? dayLabel(form.date.value, today) : 'today';
  const cash = form.paid.value === 'cash';
  form.querySelector('[data-qa-paid]').textContent = cash ? 'cash' : 'card';
  form.querySelector('[data-qa-hint]').textContent = cash ? 'Cash counts right away.' : 'Waits for the bank charge, then counts once.';
  form.querySelector('.composer-save').disabled = !(form.merchant.value.trim() && amount > 0 && c);
}
