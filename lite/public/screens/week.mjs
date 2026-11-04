// Real-data pieces from boards 07 and 09: the "this week is reviewed" card with a
// budget overview, and the "What if it costs…" check for a planned purchase.
import * as L from '../logic.mjs';
import { card, button, statusPill, iconTile, money, moneyShort, percentOf, esc, note } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { catArt, rangeLabel } from './shared.mjs';

// A progress ring drawn with SVG; the stroke length is the share reviewed.
const ring = (done, total) => {
  const r = 52, c = 2 * Math.PI * r, share = total ? done / total : 0;
  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${done} of ${total} reviewed"><circle class="ring-track" cx="60" cy="60" r="${r}"/>
    <circle class="ring-fill" cx="60" cy="60" r="${r}" stroke-dasharray="${(c * share).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" class="ring-num">${done} / ${total}</text><text x="60" y="78" class="ring-label">reviewed</text></svg>`;
};

// Board 09, screen 25: finish the week or pick up later. Never a false "inbox zero":
// older purchases still waiting stay visible.
export function weekDoneCard(S, { start, end, week, older, today }) {
  const reviewed = week.filter(t => t.reviewed).length;
  const budgets = L.budgetSummary(S, today).filter(b => b.limitCents > 0);
  const spent = budgets.reduce((a, b) => a + b.total, 0), limit = budgets.reduce((a, b) => a + b.limitCents, 0);
  const pct = percentOf(spent, limit);
  const over = budgets.filter(b => b.total > b.limitCents);
  const review = card(`<div class="stack"><b class="section-label">Weekly review</b><small class="muted">${esc(rangeLabel(start, end))}</small>
    <div class="week-done">${ring(reviewed, week.length)}<span class="week-done-side">${statusPill('This week reviewed', 'ok', { icon: 'check' })}
      ${older.length ? `<span>${older.length} older purchase${older.length === 1 ? '' : 's'} still waiting</span>` : '<span class="muted">Nothing older is waiting.</span>'}</span></div>
    ${older.length ? button('Resume older review', { variant: 'secondary', full: true, act: 'jump', data: { date: older[0].date } }) : ''}
    ${button('See updated budgets', { full: true, act: 'go', data: { to: 'budgets' } })}</div>`);
  const overview = card(`<div class="stack"><b class="section-label">Budget overview</b>
    <span class="overview-total"><b>${moneyShort(spent)}</b> / ${moneyShort(limit)} · <b class="${pct > 100 ? 'is-over' : ''}">${pct}%</b></span>
    ${spent > limit ? statusPill(`${moneyShort(spent - limit)} over budget`, 'warn', { icon: 'alert' }) : ''}
    <ul class="overview-list">${budgets.map(b => `<li>${iconTile(catArt(b), { emoji: b.emoji, size: 'sm', round: true })}<span class="grow">${esc(b.name)}</span><span class="muted">${moneyShort(b.total)} / ${moneyShort(b.limitCents)}</span><b class="${b.total > b.limitCents ? 'is-over' : ''}">${percentOf(b.total, b.limitCents)}%</b></li>`).join('')}</ul>
    ${over.length ? '' : '<small class="muted">Every budget is within its limit.</small>'}</div>`);
  return review + overview;
}

// Board 07, screen 21: what a planned purchase would leave in its budget at a
// given price. Budget room only; it says nothing about your bank balance.
export function whatIfResult(S, p, priceCents, today) {
  const b = L.budgetSummary(S, today).find(x => x.id === p.categoryId);
  if (!b) return note('Pick a budget for this plan to see what it leaves.');
  const otherPlans = b.plannedHigh - p.highCents;
  const before = b.limitCents - b.total - otherPlans;
  const after = before - priceCents;
  return `<div class="whatif-out">
    <b class="hero-amount ${after < 0 ? 'is-over' : ''}">${money(after)}</b><span>${after < 0 ? 'over' : 'left'} in ${esc(b.name)} after the purchase</span>
    <dl class="sum-rows"><div><dt>Before the purchase</dt><dd>${money(before)}</dd></div><div><dt>After at ${money(priceCents)}</dt><dd>${money(after)}</dd></div></dl>
    <small class="muted">Budget room: ${money(b.limitCents)} limit, ${money(b.total)} spent or pending${otherPlans ? `, ${money(otherPlans)} for other plans` : ''}.</small></div>`;
}

export function whatIfSheet(S, p, today) {
  const step = 100, mid = Math.round((p.lowCents + p.highCents) / 2 / step) * step;
  const span = p.highCents - p.lowCents;
  return `<div class="stack-lg">
    <label class="field slider"><span class="field-label">Price</span>
      <input type="range" name="whatif" data-plan="${esc(p.id)}" min="${p.lowCents}" max="${p.highCents}" step="${span >= step ? step : 1}" value="${span ? mid : p.lowCents}" style="--fill:50%"${span ? '' : ' disabled'}>
      <span class="slider-stops"><span>${moneyShort(p.lowCents)}</span><span>${moneyShort(p.highCents)}</span></span></label>
    <div id="whatif-out">${whatIfResult(S, p, span ? mid : p.lowCents, today)}</div>
    ${card(`<div class="review-head">${line('info', { size: 20 })}<span class="grow"><b>Cash check</b><small class="muted">A budget limit doesn’t prove you can afford it. Check your accounts and other commitments too.</small></span></div>`, { cls: 'card-flat' })}
    ${button('Done', { full: true, act: 'close' })}</div>`;
}


