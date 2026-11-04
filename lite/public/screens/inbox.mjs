// Inbox: this week's queue. About five purchases show at once, separated by thin
// dividers; reconciling one slides it away and the rest move up. Nothing is
// confirmed without a deliberate swipe or tap.
import * as L from '../logic.mjs';
import { pageHeader, listSection, button, iconButton, emptyState, link, esc } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { txnRow, rangeLabel, byDate } from './shared.mjs';

export const QUEUE_SIZE = 5;

export function inboxScreen({ S, ui, today }) {
  const { start, end } = L.weekRange(today, ui.weekOffset);
  const week = S.txns.filter(t => t.date >= start && t.date <= end);
  const open = week.filter(t => !t.reviewed).sort(byDate);
  const older = S.txns.filter(t => !t.reviewed && t.date < start).sort(byDate);
  const shown = ui.showAll ? open : open.slice(0, QUEUE_SIZE);
  const weekPicker = `<span class="week-picker">${iconButton('back', 'Previous week', { act: 'week', data: { d: -1 } })}
    <span class="week-label">${line('calendar', { size: 16 })}${esc(rangeLabel(start, end))}</span>
    ${iconButton('chevronRight', 'Next week', { act: 'week', data: { d: 1 }, disabled: ui.weekOffset >= 0 })}</span>`;
  const reviewed = week.length - open.length;
  const sub = week.length ? `<b>${open.length ? `${open.length} to review ${ui.weekOffset === 0 ? 'this week' : 'that week'}` : 'This week is reviewed'}</b>${reviewed} of ${week.length} reconciled. Swipe right to confirm a suggestion, left to scan its receipt, or tap to review.` : '';
  let body;
  if (!S.items.length && !S.txns.length) body = emptyState({ icon: 'bank', title: 'Connect a bank to fill your inbox', text: 'Your purchases arrive here each week for you to review.', action: button('Connect a bank', { act: 'go', data: { to: 'more/accounts' } }) });
  else if (!open.length) body = emptyState({ icon: 'inbox-done', title: week.length ? 'Everything here is reviewed' : 'Nothing this week yet', text: older.length ? `${older.length} older purchases are still waiting.` : 'New purchases show up after the next sync.', action: older.length ? button('Review older purchases', { variant: 'secondary', act: 'jump', data: { date: older[0].date } }) : '' });
  else body = listSection({ id: 'queue', cls: 'queue', rows: shown.map(t => txnRow(S, t, { queue: true })),
    footer: open.length > QUEUE_SIZE ? link(ui.showAll ? 'Show fewer' : `${open.length - QUEUE_SIZE} more waiting`, { act: 'show-all' }) : '' });
  return `${pageHeader({ title: 'Inbox', action: weekPicker, sub })}
    ${body}
    ${open.length && older.length ? `<button type="button" class="card older" data-act="jump" data-date="${esc(older[0].date)}">${line('clock')}<span class="grow"><b>${older.length} older purchase${older.length === 1 ? '' : 's'}</b><small>From before ${esc(rangeLabel(start, end).split(' – ')[0])}</small></span>${line('chevronRight', { size: 18 })}</button>` : ''}
    <div class="btn-row">${button('Add purchase', { icon: 'plus', act: 'manual' })}${button('Scan receipt', { icon: 'camera', variant: 'ghost', act: 'scan' })}</div>`;
}
