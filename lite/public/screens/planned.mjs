// Planned purchases. Each plan reserves its upper estimate in its budget.
// This is budget room, not money set aside in a bank.
import { pageHeader, card, iconTile, button, statusPill, emptyState, note, moneyShort, esc, pills } from '../ui/components.mjs';
import { catChip } from './shared.mjs';
import { line } from '../ui/icons.mjs';

const planArt = p => /guitar/i.test(p.name) ? 'guitar' : 'goal';

export function plannedScreen({ S, ui }) {
  const plans = S.plans;
  const edit = plans.length ? button(ui.editPlans ? 'Done' : 'Edit', { variant: 'secondary', size: 'sm', act: 'edit-plans' }) : '';
  const list = plans.map(p => {
    const c = S.categories.find(x => x.id === p.categoryId);
    return card(`<div class="plan">
      ${iconTile(planArt(p), { size: 'lg' })}
      <button type="button" class="grow plan-text" data-act="plan" data-id="${esc(p.id)}">
        <b class="plan-name">${esc(p.name)}</b>
        <span class="plan-range">${moneyShort(p.lowCents)} – ${moneyShort(p.highCents)}</span>
        <small class="muted">estimated price range</small>
        ${pills([c ? catChip(c) : statusPill('No budget', 'info'), p.essential ? statusPill('Essential', 'ok') : ''].filter(Boolean))}
      </button>
      <span class="plan-side"><small class="muted">${c ? `${moneyShort(p.highCents)} reserved` : 'Not reserved'}</small>
        ${ui.editPlans ? button('Delete', { variant: 'danger', size: 'sm', act: 'delete-plan', data: { id: p.id } }) : `${button('Adjust', { variant: 'ghost', size: 'sm', act: 'plan', data: { id: p.id } })}${c ? button('What if…', { variant: 'secondary', size: 'sm', act: 'whatif', data: { id: p.id } }) : ''}`}</span>
    </div>`, { tag: 'article' });
  }).join('');
  return `${pageHeader({ title: 'Planned', action: edit })}
    ${plans.length ? list : emptyState({ icon: 'goal', title: 'Plan something you want', text: 'Add a price range and a budget. SaveUp reserves the high end so you can see what it leaves.' })}
    ${button('Plan a purchase', { icon: 'plus', act: 'plan', full: true, size: 'lg' })}
    <button type="button" class="card older" data-act="go" data-to="planned/goals">${iconTile('goal', { size: 'sm' })}<span class="grow"><b>Goals</b><small>Save toward a planned purchase · Preview</small></span>${line('chevronRight', { size: 18 })}</button>
    ${note('Budget room, not your bank balance.', { tone: 'plain' })}`;
}
