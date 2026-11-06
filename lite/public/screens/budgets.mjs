// Budgets, laid out like YNAB's plan: a pill with the total left to spend, then
// collapsible groups (Needs, Wants...) of compact rows. Each row is a name with
// what is left in a colored pill, a thin bar, and one short status line.
// Tapping a row expands its purchases. Percentages are never capped at 100.
import * as L from '../logic.mjs';
import { pageHeader, budgetBar, barLegend, percentOf, button, note, moneyShort, money, esc, listSection, emptyState } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { txnRow } from './shared.mjs';

export function budgetView(b) {
  const planned = b.plannedHigh; // plans reserve their upper estimate
  const left = b.limitCents - b.total - planned;
  return { ...b, planned, left, used: b.total + planned };
}

const PER = { weekly: 'a week', monthly: 'a month', yearly: 'a year' };
const signedShort = c => `${c < 0 ? '−' : ''}${moneyShort(Math.abs(c))}`;

// Like YNAB's "available" pill: green with room, amber when nearly used,
// gray at exactly zero, red when over.
export function leftTone(v) {
  if (v.left < 0) return 'over';
  if (v.left === 0) return 'empty';
  return v.used >= v.limitCents * 0.9 ? 'low' : 'ok';
}

// One short line under the bar, the way YNAB says "Funded" or "Fully spent".
export function statusLine(v) {
  const pct = percentOf(v.used, v.limitCents);
  const extras = [v.pending && `${moneyShort(v.pending)} pending`, v.planned && `${moneyShort(v.planned)} planned`].filter(Boolean);
  const head = v.left < 0 ? `Overspent ${moneyShort(-v.left)} · ${pct}% of ${moneyShort(v.limitCents)}`
    : v.left === 0 ? `Fully spent · ${moneyShort(v.limitCents)} ${PER[v.interval] || ''}`.trim()
    : v.used === 0 ? `${moneyShort(v.limitCents)} ${PER[v.interval] || ''} · nothing spent yet`.trim()
    : `${pct}% of ${moneyShort(v.limitCents)} ${PER[v.interval] || ''}`.trim();
  return [head, ...extras].join(' · ');
}

function budgetRow(S, b, { open }) {
  const v = budgetView(b), tone = leftTone(v);
  const details = open ? `<div class="budget-details">
      ${barLegend([
        { kind: 'spent', label: 'Spent', cents: v.spent, pct: percentOf(v.spent, v.limitCents) },
        { kind: 'pending', label: 'Pending', cents: v.pending, pct: percentOf(v.pending, v.limitCents) },
        ...(v.planned ? [{ kind: 'planned', label: 'Planned', cents: v.planned, pct: percentOf(v.planned, v.limitCents) }] : []),
        { kind: v.left < 0 ? 'over' : 'left', label: v.left < 0 ? 'Over' : 'Left', cents: Math.abs(v.left), pct: percentOf(Math.abs(v.left), v.limitCents) }
      ], { layout: 'rows' })}
      ${v.pending ? note('Pending spending already reduces what is left.') : ''}
      ${v.description ? `<p class="muted">${esc(v.description)}</p>` : ''}
      ${v.txns.length ? listSection({ title: `Purchases (${v.txns.length})`, cls: 'card-flat', rows: v.txns.map(t => txnRow(S, t)) }) : '<p class="muted">No purchases this period yet.</p>'}
      ${button('Edit budget', { variant: 'secondary', act: 'category', data: { id: v.id }, icon: 'pencil', full: true })}
    </div>` : '';
  const label = `${v.name}: ${statusLine(v)}`;
  return `<article class="brow${open ? ' is-open' : ''}">
    <button type="button" class="brow-head" data-act="toggle-budget" data-id="${esc(v.id)}" aria-expanded="${open}">
      <span class="brow-name">${v.emoji ? `<span class="brow-emoji" aria-hidden="true">${esc(v.emoji)}</span>` : ''}${esc(v.name)}</span>
      <span class="brow-left tone-${tone}">${v.left < 0 ? '−' : ''}<span data-count="${Math.abs(v.left)}" data-count-key="left-${esc(v.id)}" data-format="short">${moneyShort(Math.abs(v.left))}</span></span>
    </button>
    ${budgetBar({ limit: v.limitCents, spent: v.spent, pending: v.pending, planned: v.planned }, { size: 'thin', label, id: v.id })}
    <p class="brow-status tone-${tone}">${esc(statusLine(v))}</p>
    ${details}
  </article>`;
}

// Needs, Wants, Goals first, then any groups the person made, then Other.
export function groupBudgets(budgets) {
  const by = new Map();
  for (const b of budgets) {
    const g = b.group || 'Other';
    by.set(g, [...(by.get(g) || []), b]);
  }
  const rank = g => { const i = L.GROUP_ORDER.indexOf(g); return i >= 0 ? i : g === 'Other' ? 1e6 : 1e3; };
  return [...by].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

function budgetGroup(S, name, list, ui) {
  const closed = ui.closedGroups?.has(name);
  return `<section class="bgroup${closed ? ' is-closed' : ''}">
    <button type="button" class="bgroup-head" data-act="toggle-group" data-group="${esc(name)}" aria-expanded="${!closed}">
      <span class="bgroup-chev">${line('chevronDown', { size: 18 })}</span><b class="grow">${esc(name)}</b><small>Left to<br>spend</small>
    </button>
    ${closed ? '' : list.map(b => budgetRow(S, b, { open: ui.openBudgets.has(b.id) })).join('')}
  </section>`;
}

export function budgetsScreen({ S, ui, today }) {
  const budgets = L.budgetSummary(S, today);
  // Bank purchases this month with no budget yet: budget room is provisional until they're reviewed.
  const month = L.periodRange('monthly', today);
  const waiting = S.txns.filter(t => !t.reviewed && t.date >= month.start && t.date <= month.end && t.amountCents > 0);
  const waitingCents = waiting.reduce((s, t) => s + t.amountCents, 0);
  const add = button('New', { variant: 'secondary', size: 'sm', icon: 'plus', act: 'category' });
  if (!budgets.length) return `${pageHeader({ title: 'Budgets', action: add })}${emptyState({ icon: 'groceries', title: 'No budgets yet', text: 'Pick a category and a limit to start.', action: add })}`;
  const totalLeft = budgets.reduce((s, b) => s + budgetView(b).left, 0);
  return `${pageHeader({ title: 'Budgets', action: add })}
    <div class="btotal ${totalLeft < 0 ? 'is-over' : ''}"><b>${signedShort(totalLeft)}</b><span>${totalLeft < 0 ? 'Over budget' : 'Left to spend'}</span></div>
    ${waiting.length ? `<button type="button" class="bwaiting" data-act="tab" data-tab="inbox">${line('clock', { size: 16 })}<span class="grow">${esc(money(waitingCents))} still to review</span>${line('chevronRight', { size: 16 })}</button>` : ''}
    <div class="blist">${groupBudgets(budgets).map(([name, list]) => budgetGroup(S, name, list, ui)).join('')}</div>`;
}
