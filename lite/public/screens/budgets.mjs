// Budgets at a glance, laid out like YNAB's budget list: budgets are grouped by
// period (week, month, year), each group headed by its total left, and each
// budget is a thin row with what is left on the right and a bar underneath.
// Tapping a row expands its purchases. Percentages are never capped at 100.
import * as L from '../logic.mjs';
import { pageHeader, budgetBar, barLegend, percentOf, iconTile, button, banner, note, moneyShort, money, esc, listSection, emptyState } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { catArt, periodLabel, txnRow } from './shared.mjs';

export function budgetView(b) {
  const planned = b.plannedHigh; // plans reserve their upper estimate
  const left = b.limitCents - b.total - planned;
  return { ...b, planned, left, used: b.total + planned };
}

const GROUPS = [['weekly', 'This week'], ['monthly', 'This month'], ['yearly', 'This year']];

// Left after plans, as a pill: green with room, amber when nearly used, red when over.
function leftPill(v) {
  const tone = v.left < 0 ? 'danger' : v.left === 0 || v.used >= v.limitCents * 0.9 ? 'amber' : 'mint';
  return `<span class="budget-left pill-${tone}">${v.left < 0 ? '−' : ''}<span data-count="${Math.abs(v.left)}" data-count-key="left-${esc(v.id)}" data-format="short">${moneyShort(Math.abs(v.left))}</span></span>`;
}

function budgetRow(S, b, { open }) {
  const v = budgetView(b);
  const over = v.left < 0;
  const parts = [`${moneyShort(v.spent)} spent`, v.pending && `${moneyShort(v.pending)} pending`, v.planned && `${moneyShort(v.planned)} planned`].filter(Boolean);
  const pct = percentOf(v.used, v.limitCents);
  const head = `<button type="button" class="budget-head" data-act="toggle-budget" data-id="${esc(v.id)}" aria-expanded="${open}">
      ${iconTile(catArt(v), { emoji: v.emoji, size: 'sm' })}
      <b class="budget-name grow">${esc(v.name)}</b>
      ${leftPill(v)}
      <span class="budget-chev">${line('chevronDown', { size: 18 })}</span></button>`;
  const summary = `<p class="budget-line"><span>${esc(parts.join(' · '))}</span><span class="${pct > 100 ? 'amount-over' : ''}">${pct}% of ${moneyShort(v.limitCents)}</span></p>`;
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
  const bar = budgetBar({ limit: v.limitCents, spent: v.spent, pending: v.pending, planned: v.planned }, { size: 'sm', label: `${v.name}: ${parts.join(', ')}, ${moneyShort(v.limitCents)} limit`, id: v.id });
  return `<article class="budget${open ? ' is-open' : ''}">${head}${bar}${summary}${details}</article>`;
}

function budgetGroup(S, title, list, { ui, today }) {
  const left = list.reduce((s, b) => s + budgetView(b).left, 0);
  return `<section class="card budget-group">
      <header class="budget-group-head"><span class="grow"><b>${esc(title)}</b><small>${esc(periodLabel(list[0], today))}</small></span>
        <span class="budget-group-total"><small>Left</small><b class="${left < 0 ? 'amount-over' : ''}">${left < 0 ? '−' : ''}${moneyShort(Math.abs(left))}</b></span></header>
      ${list.map(b => budgetRow(S, b, { open: ui.openBudgets.has(b.id) })).join('')}
    </section>`;
}

export function budgetsScreen({ S, ui, today }) {
  const budgets = L.budgetSummary(S, today);
  // Bank purchases this month with no budget yet: budget room is provisional until they're reviewed.
  const month = L.periodRange('monthly', today);
  const waiting = S.txns.filter(t => !t.reviewed && t.date >= month.start && t.date <= month.end && t.amountCents > 0);
  const waitingCents = waiting.reduce((s, t) => s + t.amountCents, 0);
  const add = button('New', { variant: 'secondary', size: 'sm', icon: 'plus', act: 'category' });
  const groups = GROUPS.map(([interval, title]) => [title, budgets.filter(b => b.interval === interval)]).filter(([, list]) => list.length);
  return `${pageHeader({ title: 'Budgets', action: add })}
    ${waiting.length ? banner(`${money(waitingCents)} awaiting review`, 'Budget room is provisional.', { act: 'tab', data: { tab: 'inbox' } }) : ''}
    ${budgets.length ? groups.map(([title, list]) => budgetGroup(S, title, list, { ui, today })).join('') : emptyState({ icon: 'groceries', title: 'No budgets yet', text: 'Pick a category and a limit to start.', action: add })}`;
}
