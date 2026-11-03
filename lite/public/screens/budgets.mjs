// Budgets at a glance. Each card shows its own period, what is left after
// plans, and a bar split into spent, pending, planned and left. Tapping a card
// expands its purchases. Percentages are never capped at 100.
import * as L from '../logic.mjs';
import { pageHeader, card, budgetBar, barLegend, percentOf, iconTile, button, banner, note, moneyShort, money, esc, listSection, emptyState } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { catArt, periodLabel, txnRow } from './shared.mjs';

export function budgetView(b) {
  const planned = b.plannedHigh; // plans reserve their upper estimate
  const left = b.limitCents - b.total - planned;
  return { ...b, planned, left, used: b.total + planned };
}

function budgetCard(S, b, { open, today }) {
  const v = budgetView(b);
  const parts = [`${moneyShort(v.spent)} spent`, v.pending && `${moneyShort(v.pending)} pending`, v.planned && `${moneyShort(v.planned)} planned`, `${moneyShort(v.limitCents)} limit`].filter(Boolean);
  const over = v.left < 0;
  const head = `<button type="button" class="budget-head" data-act="toggle-budget" data-id="${esc(v.id)}" aria-expanded="${open}">
      ${iconTile(catArt(v), { emoji: v.emoji })}
      <span class="grow"><b class="budget-name">${esc(v.name)}</b><small>${esc(periodLabel(v, today))}</small></span>
      <span class="budget-left ${over ? 'is-over' : ''}"><b><span data-count="${Math.abs(v.left)}" data-count-key="left-${esc(v.id)}" data-format="short">${moneyShort(Math.abs(v.left))}</span> ${over ? 'over' : 'left'}</b>${v.planned && !over ? '<small>after plans</small>' : ''}</span>
      <span class="budget-chev">${line('chevronDown', { size: 20 })}</span></button>`;
  const pctTotal = percentOf(v.used, v.limitCents);
  const caption = `<p class="bar-caption"><span>${percentOf(v.total, v.limitCents)}% spent${v.pending ? ' incl. pending' : ''}</span>${v.planned ? `<span>${percentOf(v.planned, v.limitCents)}% planned</span>` : ''}<span class="${pctTotal > 100 ? 'amount-over' : ''}">${pctTotal > 100 ? `${pctTotal}% used` : `${Math.max(0, 100 - pctTotal)}% left`}</span></p>`;
  const details = open ? `<div class="budget-details">
      ${barLegend([
        { kind: 'spent', label: 'Spent', cents: v.spent, pct: percentOf(v.spent, v.limitCents) },
        { kind: 'pending', label: 'Pending', cents: v.pending, pct: percentOf(v.pending, v.limitCents) },
        ...(v.planned ? [{ kind: 'planned', label: 'Planned', cents: v.planned, pct: percentOf(v.planned, v.limitCents) }] : []),
        { kind: over ? 'over' : 'left', label: over ? 'Over' : 'Left', cents: Math.abs(v.left), pct: percentOf(Math.abs(v.left), v.limitCents) }
      ], { layout: 'rows' })}
      ${v.pending ? note('Pending spending already reduces what is left.') : ''}
      ${v.description ? `<p class="muted">${esc(v.description)}</p>` : ''}
      ${v.txns.length ? listSection({ title: `Purchases (${v.txns.length})`, cls: 'card-flat', rows: v.txns.map(t => txnRow(S, t)) }) : '<p class="muted">No purchases this period yet.</p>'}
      ${button('Edit budget', { variant: 'secondary', act: 'category', data: { id: v.id }, icon: 'pencil', full: true })}
    </div>` : '';
  return card(`${head}<p class="budget-line">${esc(parts.join(' · '))}</p>${budgetBar({ limit: v.limitCents, spent: v.spent, pending: v.pending, planned: v.planned }, { label: `${v.name}: ${parts.join(', ')}`, id: v.id })}${caption}${details}`, { tag: 'article', cls: `budget${open ? ' is-open' : ''}` });
}

export function budgetsScreen({ S, ui, today }) {
  const budgets = L.budgetSummary(S, today);
  // Bank purchases this month with no budget yet: budget room is provisional until they're reviewed.
  const month = L.periodRange('monthly', today);
  const waiting = S.txns.filter(t => !t.reviewed && t.date >= month.start && t.date <= month.end && t.amountCents > 0);
  const waitingCents = waiting.reduce((s, t) => s + t.amountCents, 0);
  const add = button('New', { variant: 'secondary', size: 'sm', icon: 'plus', act: 'category' });
  return `${pageHeader({ title: 'Budgets', action: add })}
    ${waiting.length ? banner(`${money(waitingCents)} awaiting review`, 'Budget room is provisional.', { act: 'tab', data: { tab: 'inbox' } }) : ''}
    ${budgets.length ? budgets.map(b => budgetCard(S, b, { open: ui.openBudgets.has(b.id), today })).join('') : emptyState({ icon: 'groceries', title: 'No budgets yet', text: 'Pick a category and a limit to start.', action: add })}`;
}
