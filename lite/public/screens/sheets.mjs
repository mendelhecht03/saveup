// Bottom sheets: review a purchase, add one by hand, edit a budget or a plan.
import * as L from '../logic.mjs';
import { iconTile, button, choiceList, textField, moneyField, textArea, selectField, segmented, stepSlider, checkbox, note, pills, esc, emptyState, categoryChip } from '../ui/components.mjs';
import { ART } from '../ui/icons.mjs';
import { txnIcon, statusPills, signed, longDate, accountLabel, catArt } from './shared.mjs';
import { splitSummary } from './receipt.mjs';

export const PRIORITY_STOPS = L.PRIORITIES;

function categoryChoices(S, selected, suggestedId) {
  // The suggested or chosen budget goes first so it's within thumb reach.
  const cats = [...S.categories].sort((a, b) => (b.id === selected) - (a.id === selected));
  return cats.map(c => ({ value: c.id, label: c.name, sub: c.description, icon: catArt(c), emoji: c.emoji,
    badge: c.id === suggestedId ? categoryChip('Suggested', 'sky', { suggested: true }) : '' }));
}

export function reviewSheet(S, t) {
  const sug = !t.reviewed ? L.suggest(S, t) : null;
  const selected = t.categoryId || sug?.categoryId || '', kind = t.transferKind || sug?.transferKind || '';
  const { icon, emoji } = txnIcon(S, t);
  const out = t.amountCents > 0;
  const transfer = t.transfer ? choiceList('kind', [
    out ? { value: 'spending', label: 'Spending', sub: 'A payment or gift. Counts in a budget.', icon: 'shopping' } : { value: 'income', label: 'Income', sub: 'Money you earned or were paid back.', icon: 'income' },
    { value: 'own', label: 'Between my accounts', sub: 'Moves your money. Not income or spending.', icon: 'bank' }
  ], { value: kind, legend: 'What was this for?', hint: 'Transfers count as nothing until you say what they were.' }) : '';
  return `<form data-form="confirm" data-id="${esc(t.id)}" class="stack-lg">
    <div class="review-head">${iconTile(icon, { emoji, size: 'md', round: true })}
      <span class="grow"><b class="review-name">${esc(t.name)}</b><small class="muted">${esc(longDate(t.date))} · ${esc(accountLabel(S, t))}</small>${pills(statusPills(t))}</span>
      <b class="review-amount ${t.amountCents < 0 ? 'amount-in' : ''}">${signed(t)}</b></div>
    ${t.amountChanged ? note('The final amount changed, so this needs another look.', { tone: 'warn' }) : ''}
    ${t.matchedFrom ? note(`Linked to “${t.matchedFrom}”, which you logged by hand. Counts once.`) : ''}
    ${sug ? note(sug.source === 'ai'
      ? `AI suggestion${sug.reason ? `: ${sug.reason.replace(/\.?$/, '.')}` : '.'} Nothing is confirmed until you tap Confirm.`
      : `Suggested from ${sug.exact ? 'an identical past purchase' : 'past purchases here'}. Nothing is confirmed until you tap Confirm.`, { icon: 'sparkle' }) : ''}
    ${splitSummary(S, t)}
    ${t.amountCents > 0 && (!t.transfer || t.transferKind === 'spending') ? (t.receiptId
      ? (t.splits?.length ? '' : button('View receipt', { variant: 'secondary', icon: 'file', full: true, act: 'receipt-open', data: { id: t.receiptId } }))
      : button('Add receipt', { variant: 'secondary', icon: 'camera', full: true, act: 'scan-options', data: { id: t.id } })) : ''}
    ${transfer}
    <div class="cats" ${t.transfer && kind !== 'spending' ? 'hidden' : ''}>${choiceList('cat', categoryChoices(S, selected, sug?.categoryId), { value: selected, legend: 'Which budget?', hint: t.splits?.length ? 'Picking one budget here replaces the split.' : t.transfer ? '' : 'The store name and amount don’t tell us what you bought.' })}</div>
    <div class="stack"><b class="section-label">Optional details</b>
      ${textArea('note', 'Note', { value: t.note, placeholder: 'e.g. toothbrush, speeding ticket', optional: true, rows: 2 })}
      ${stepSlider('priority', 'Priority', PRIORITY_STOPS, { value: Math.min(t.priority || 2, PRIORITY_STOPS.length), optional: true })}</div>
    ${button(t.reviewed ? 'Save changes' : 'Confirm & next', { type: 'submit', full: true, size: 'lg' })}
    ${!t.reviewed ? button('Skip', { variant: 'ghost', act: 'skip', data: { id: t.id }, full: true }) : ''}
    ${t.reviewed && t.source !== 'manual' ? button('Move back to inbox', { variant: 'ghost', act: 'unreview', data: { id: t.id }, full: true }) : ''}
    ${t.source === 'manual' ? button('Delete purchase', { variant: 'danger', act: 'delete-txn', data: { id: t.id }, full: true }) : ''}
  </form>`;
}

const ICON_CHOICES = ['groceries', 'recreation', 'personal-care', 'housing', 'household', 'travel', 'education', 'clothing', 'dining', 'coffee', 'transportation', 'health', 'gifts', 'pets', 'phone', 'utilities', 'other'];
const budgetGroups = S => [...new Set([...L.GROUP_ORDER, ...S.categories.map(c => c.group).filter(Boolean)])];
export function categorySheet(S, c) {
  const current = c ? catArt(c) || 'other' : 'groceries';
  return `<form data-form="category" data-id="${esc(c?.id || '')}" class="stack-lg">
    <fieldset class="icon-pick"><legend class="field-label">Icon</legend><span class="icon-grid">${ICON_CHOICES.map(k => `<label><input type="radio" name="icon" value="${k}"${k === current ? ' checked' : ''}>${iconTile(k, { size: 'sm' })}<span class="sr-only">${esc(k)}</span></label>`).join('')}</span></fieldset>
    ${textField('name', 'Name', { value: c?.name, required: true, max: 40, placeholder: 'e.g. Coffee' })}
    ${moneyField('limit', 'Amount', { cents: c?.limitCents })}
    ${textField('group', 'Group', { value: c ? c.group : 'Needs', max: 30, placeholder: 'e.g. Needs', list: budgetGroups(S), hint: 'Budgets are listed under their group, like Needs or Wants.' })}
    ${selectField('interval', 'Repeats', [['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']], { value: c?.interval || 'weekly' })}
    ${textArea('description', 'Description', { value: c?.description, required: true, max: 200, placeholder: 'What belongs here? This helps SaveUp suggest it.', counter: true })}
    ${button(c ? 'Save budget' : 'Create budget', { type: 'submit', full: true, size: 'lg' })}
    ${c ? button('Delete budget', { variant: 'danger', act: 'delete-category', data: { id: c.id }, full: true }) : ''}</form>`;
}
export const iconEmoji = key => ART[key]?.[0] || ART.other[0];

export function planSheet(S, p) {
  return `<form data-form="plan" data-id="${esc(p?.id || '')}" class="stack-lg">
    ${textField('name', 'Item', { value: p?.name, required: true, max: 80, placeholder: 'e.g. Guitar' })}
    <div class="two">${moneyField('low', 'Low estimate', { cents: p?.lowCents })}${moneyField('high', 'High estimate', { cents: p?.highCents })}</div>
    ${selectField('categoryId', 'Budget', [['', 'None'], ...S.categories.map(c => [c.id, c.name])], { value: p?.categoryId || '' })}
    ${checkbox('essential', 'Essential', { checked: p?.essential, hint: 'A priority tag, not a budget.' })}
    ${note('The high estimate is reserved in its budget, so you can see what it leaves.')}
    ${button(p ? 'Save plan' : 'Add plan', { type: 'submit', full: true, size: 'lg' })}</form>`;
}
