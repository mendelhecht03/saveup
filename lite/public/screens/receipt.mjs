// Receipts: attach one (photo, file, digital receipt or by hand), check what was
// read on a slightly crumpled paper copy with a toggle to the original photo, then
// confirm how it splits across budgets. Also the "Looks like the same purchase"
// card that links a logged purchase to its bank charge.
import * as L from '../logic.mjs';
import { pageHeader, card, button, row, listSection, banner, note, pills, statusPill, segmented, esc, money, iconTile, link } from '../ui/components.mjs';
import { line } from '../ui/icons.mjs';
import { catArt, signed, shortDate, accountLabel, txnIcon } from './shared.mjs';

const cents = c => (c / 100).toFixed(2);

// ---- step 10: attach a receipt
export function receiptStartSheet(S, t, { reader, samples = [] }) {
  const option = (icon, title, sub, extra) => `<label class="receipt-option card">${iconTile(icon, { size: 'sm' })}<span class="grow"><b>${esc(title)}</b><small>${esc(sub)}</small></span>${line('chevronRight', { size: 18 })}${extra}</label>`;
  const file = (capture) => `<input type="file" accept="image/jpeg,image/png,image/webp,image/*" data-upload="${t ? esc(t.id) : ''}"${capture ? ' capture="environment"' : ''} class="visually-hidden">`;
  const head = t ? card(`<div class="review-head">${iconTile(txnIcon(S, t).icon, { size: 'sm', round: true })}<span class="grow"><b class="review-name">${esc(t.name)}</b><small class="muted">${esc(shortDate(t.date))} · ${esc(accountLabel(S, t))}</small></span><b class="review-amount">${signed(t)}</b></div>`, { cls: 'card-flat' }) : '';
  return `<div class="stack-lg">${head}
    <p class="muted">${t ? `Add a receipt to split this ${money(t.amountCents)} charge into the right budgets.` : 'Scan first. SaveUp fills in the purchase and waits for the bank charge, so it counts once.'}</p>
    ${reader ? '' : note('Reading photos needs ANTHROPIC_API_KEY in lite/.env.local. Without it, you type the items yourself.', { tone: 'plain' })}
    <div class="stack">
      ${option('receipt', 'Take photo', 'Use the camera', file(true))}
      ${option('receipt', 'Choose file', 'A photo or screenshot of the receipt', file(false))}
      <details class="receipt-samples card"><summary>${iconTile('receipt', { size: 'sm' })}<span class="grow"><b>Use digital receipt</b><small>Sample receipts from the SaveUp Test Bank</small></span>${line('chevronDown', { size: 18 })}</summary>
        <div class="stack">${samples.map(r => button(`${r.merchant} · ${money(r.totalCents)}`, { variant: 'secondary', full: true, act: 'receipt-digital', data: { sample: r.id, txn: t?.id || '' } })).join('')}</div></details>
    </div>
    <div class="or-rule"><span>or</span></div>
    ${button('Split manually', { variant: 'ghost', full: true, icon: 'pencil', act: 'receipt-manual', data: { txn: t?.id || '' } })}</div>`;
}

// ---- steps 11–12 on one screen: check the scan, then confirm the split
export function receiptScreen({ S, ui, route }) {
  const id = route.split('/')[1];
  const r = S.receipts.find(x => x.id === id);
  if (!r) return `${pageHeader({ back: 'Inbox', backAct: 'go-inbox', title: 'Receipt' })}${note('This receipt was removed.')}`;
  const t = r.txnId ? S.txns.find(x => x.id === r.txnId) : null;
  const step = ui.receiptStep === 'split' ? 'split' : 'items';
  return step === 'split' ? splitStep(S, r, t) : itemsStep(S, ui, r, t);
}

function itemsStep(S, ui, r, t) {
  const view = r.image && ui.receiptView === 'original' ? 'original' : 'copy';
  const check = L.receiptCheck(S, r);
  const catOptions = l => `<option value="">Pick a budget</option>${S.categories.map(c => `<option value="${esc(c.id)}"${c.id === l.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  const lineRow = (l, i) => {
    const c = S.categories.find(x => x.id === l.categoryId);
    return `<li class="rline" data-line="${i}">
      <span class="rline-tile">${c ? iconTile(catArt(c), { emoji: c.emoji, size: 'sm', round: true }) : iconTile('receipt', { size: 'sm', round: true })}</span>
      <span class="rline-main">
        <input class="rline-name" name="name" value="${esc(l.name)}" maxlength="80" aria-label="Item name">
        ${l.name !== l.code ? `<small class="rline-code">${esc(l.code)}${l.remembered ? ' · name you gave it' : ''}</small>` : ''}
        <span class="rline-meta">
          <span class="select-chip${c ? '' : ' is-empty'}${l.unsure ? ' is-unsure' : ''}"><select name="cat" aria-label="Budget for ${esc(l.name)}">${catOptions(l)}</select>${line('chevronDown', { size: 14 })}</span>
          ${l.unsure ? statusPill('Check this', 'warn', { icon: 'alert' }) : ''}
        </span>
      </span>
      <span class="rline-amount"><span>$</span><input name="amount" inputmode="decimal" value="${cents(l.amountCents)}" aria-label="Amount for ${esc(l.name)}"></span>
      <button type="button" class="icon-btn rline-remove" data-act="receipt-remove-line" data-line="${i}" aria-label="Remove ${esc(l.name)}">${line('close', { size: 16 })}</button>
    </li>`;
  };
  const paper = `<form data-form="receipt" data-id="${esc(r.id)}" class="receipt-paper" novalidate>
    <div class="paper-head">
      <input class="paper-store" name="merchant" value="${esc(r.merchant)}" placeholder="Store name" aria-label="Store" maxlength="100">
      <span class="paper-row"><input type="date" name="date" value="${esc(r.date)}" aria-label="Date">${r.time ? `<span>${esc(r.time)}</span>` : ''}</span>
    </div>
    <ul class="rlines">${r.lines.map(lineRow).join('') || '<li class="rline-empty muted">No items yet. Add them below.</li>'}</ul>
    <button type="button" class="text-link paper-add" data-act="receipt-add-line">${line('plus', { size: 16 })}<span>Add item</span></button>
    <div class="paper-totals">
      <label><span>Tax</span><span class="rline-amount"><span>$</span><input name="tax" inputmode="decimal" value="${cents(r.taxCents)}"></span></label>
      <label class="paper-total"><span>Total</span><span class="rline-amount"><span>$</span><input name="total" inputmode="decimal" value="${cents(r.totalCents)}"></span></label>
      ${r.last4 ? `<small class="muted">${r.method === 'cash' ? 'Cash' : `Card •••• ${esc(r.last4)}`}</small>` : ''}
    </div>
  </form>`;
  const original = r.image ? `<figure class="receipt-original card"><img src="/api/receipt/image?id=${encodeURIComponent(r.id)}" alt="Original receipt from ${esc(r.merchant)}"></figure>` : '';
  return `${pageHeader({ back: t ? 'Purchase' : 'Inbox', backAct: 'go-inbox', center: 'Review receipt' })}
    ${r.note ? banner('Couldn’t read this one', r.note, { tone: 'info' }) : ''}
    ${r.image ? `<div class="receipt-toggle">${segmented('receipt-view', [['copy', 'Editable copy'], ['original', 'Original']], { value: view })}</div>` : ''}
    ${view === 'original' ? original : paper}
    ${view === 'copy' ? `<div class="stack">
      <b class="section-label">Review extracted items</b>
      <p class="muted">Rename cryptic codes once and SaveUp remembers them for ${esc(r.merchant || 'this store')}. Tax is shared across the items.</p>
      ${check.printedDifference ? note(`The items and tax add up to ${money(check.lineSum + r.taxCents)}, but the receipt total says ${money(r.totalCents)}. Check the amounts.`, { tone: 'warn' }) : ''}
      ${r.lines.some(l => l.unsure) ? note('Lines marked “Check this” were hard to read or their budget is a guess.', { tone: 'warn' }) : ''}
    </div>` : ''}
    <div class="btn-stack">${button('Next: confirm the split', { full: true, act: 'receipt-next', data: { id: r.id } })}
      ${button('Remove this receipt', { variant: 'ghost', full: true, act: 'receipt-delete', data: { id: r.id } })}</div>`;
}

function splitStep(S, r, t) {
  const check = L.receiptCheck(S, r);
  const dupes = !t ? L.possibleDuplicates(S, r) : [];
  const parts = check.parts.map(p => {
    const c = S.categories.find(x => x.id === p.categoryId);
    return row({ icon: c ? catArt(c) : 'other', emoji: c?.emoji, title: c ? c.name : 'No budget yet', amount: money(p.amountCents), chevron: false, tag: 'div' });
  });
  const diff = check.difference;
  const fix = diff ? card(`<div class="stack"><b>${money(Math.abs(diff))} ${diff > 0 ? 'not assigned yet' : 'more than the charge'}</b>
    <p class="muted">${diff > 0 ? 'The bank charged more than the items add up to.' : 'The items add up to more than the bank charged, for example a discount.'} Put the difference in one budget, or go back and fix an amount.</p>
    <span class="select-wrap"><select class="input" name="diff-cat" aria-label="Budget for the difference">${S.categories.map(c => `<option value="${esc(c.id)}"${c.id === check.parts[0]?.categoryId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>${line('chevronDown', { size: 18 })}</span>
    ${button(diff > 0 ? `Put ${money(diff)} in this budget` : `Take ${money(-diff)} off this budget`, { variant: 'secondary', full: true, act: 'receipt-difference', data: { id: r.id } })}</div>`, { cls: 'card-warn' }) : '';
  const bankRow = t ? card(`<div class="review-head">${iconTile(t.source === 'manual' ? 'card' : 'bank', { size: 'sm', round: true })}<span class="grow"><b>${t.source === 'manual' ? 'Your purchase' : 'Bank charge'}</b><small class="muted">${esc(shortDate(t.date))}</small>${pills(t.pending ? [statusPill('Pending', 'warn')] : t.source === 'plaid' ? [statusPill('Posted', 'ok')] : [])}</span><b class="review-amount">${money(t.amountCents)}</b></div>`)
    : card(`<div class="review-head">${iconTile(r.method === 'cash' ? 'cash' : 'card', { size: 'sm', round: true })}<span class="grow"><b>New ${r.method === 'cash' ? 'cash' : 'card'} purchase</b><small class="muted">${esc(r.merchant)} · ${esc(r.date ? shortDate(r.date) : 'no date')}</small></span><b class="review-amount">${money(r.totalCents)}</b></div>`);
  return `${pageHeader({ back: 'Items', backAct: 'receipt-back', center: 'Confirm breakdown' })}
    ${t?.pending ? banner('Payment pending', 'These amounts reduce your budgets now. Categorization can be changed before it posts.', { icon: 'clock' }) : ''}
    ${!t && r.method !== 'cash' ? banner('Waits for the bank charge', 'Counts as pending once, until you link it to the charge.', { tone: 'info', icon: 'clock' }) : ''}
    ${dupes.length ? card(`<div class="stack"><b>${line('alert', { size: 18 })} You may already have this purchase</b>
      ${dupes.slice(0, 3).map(d => row({ icon: txnIcon(S, d).icon, title: d.name, sub: `${shortDate(d.date)} · ${d.source === 'manual' ? 'Logged by you' : d.pending ? 'Pending' : 'Posted'}`, amount: money(d.amountCents), chevron: false, tag: 'div',
        extra: button('Attach', { variant: 'secondary', size: 'sm', act: 'receipt-attach', data: { id: r.id, txn: d.id } }) })).join('')}
      <p class="muted">Attaching avoids counting it twice.</p></div>`, { cls: 'card-warn' }) : ''}
    ${bankRow}
    ${listSection({ title: 'Budget allocations from this receipt', subtitle: t ? 'This does not create a new charge.' : 'Tax is shared across the items.', rows: parts, footer: `<span class="split-total"><b>Total allocated</b><b>${money(check.assigned)}</b></span>` })}
    ${card(`<dl class="sum-rows"><div><dt>${t ? (t.source === 'manual' ? 'Your purchase' : 'Bank charge') : 'Receipt total'}</dt><dd>${money(check.target)}</dd></div><div><dt>Assigned from receipt</dt><dd>${money(check.assigned)}</dd></div>
      <div class="sum-diff${diff ? ' is-off' : ''}"><dt>Difference</dt><dd>${money(diff)}</dd></div></dl>`, { cls: 'card-flat' })}
    ${fix}
    ${check.unassigned ? note('Some items have no budget yet. Go back and pick one.', { tone: 'warn' }) : ''}
    ${button(t ? 'Confirm breakdown & next' : 'Save purchase', { full: true, act: 'receipt-confirm', data: { id: r.id }, disabled: !check.ready })}`;
}

// ---- step 15: link a logged purchase to its bank charge
export function matchCard(S, m, { open = false } = {}) {
  const side = (title, icon, t, status) => `<div class="match-side"><small>${line(icon, { size: 16 })} ${esc(title)}</small><b class="match-amount">${money(t.amountCents)}</b>${pills([status])}<span class="match-name">${esc(t.name)}</span><small class="muted">${esc(shortDate(t.date))} · ${esc(accountLabel(S, t))}</small>${t.splits?.length > 1 ? `<small class="muted">${t.splits.length} splits</small>` : ''}</div>`;
  const same = m.differenceCents === 0;
  const pair = `<div class="match-pair">${side('Bank transaction', 'calendar', m.bank, m.bank.pending ? statusPill('Pending', 'warn', { icon: 'clock' }) : statusPill('Posted', 'ok'))}
    <span class="match-link" aria-hidden="true">${line('link', { size: 18 })}</span>
    ${side('Your purchase', 'file', m.manual, statusPill('Reviewed', 'ok', { icon: 'check' }))}</div>`;
  const ids = { bank: m.bank.id, manual: m.manual.id };
  if (same) return card(`<div class="stack"><b class="match-title">${line('check', { size: 18 })} Looks like the same purchase</b>
    <p class="muted">The amount matches and the dates are close. Link them to keep your receipt and split. It counts once.</p>
    ${pair}${button('Link purchase', { full: true, act: 'match-link', data: ids })}${button('Not a match', { variant: 'ghost', full: true, act: 'match-reject', data: ids })}</div>`, { cls: 'match-card' });
  return card(`<div class="stack"><b class="match-title is-warn">${line('alert', { size: 18 })} A possible match with a different amount</b>
    ${pair}${statusPill(`${money(Math.abs(m.differenceCents))} amount difference`, 'warn', { icon: 'alert' })}
    <p class="muted">Same store and close dates, but the amounts don’t match. Linking reopens review so you can fix the split.</p>
    ${open ? `${button('Link anyway', { variant: 'secondary', full: true, act: 'match-link', data: ids })}${button('Not a match', { variant: 'ghost', full: true, act: 'match-reject', data: ids })}`
      : button('Review difference', { variant: 'secondary', full: true, act: 'match-open', data: ids })}</div>`, { cls: 'match-card match-card-warn' });
}

// A split purchase, as shown in its review sheet.
export const splitSummary = (S, t) => t.splits?.length ? listSection({ title: `Split across ${t.splits.length} budget${t.splits.length === 1 ? '' : 's'}`, cls: 'card-flat',
  rows: t.splits.map(p => { const c = S.categories.find(x => x.id === p.categoryId); return row({ icon: c ? catArt(c) : 'other', emoji: c?.emoji, title: c?.name || 'Deleted budget', amount: money(p.amountCents), chevron: false, tag: 'div' }); }),
  footer: t.receiptId ? link('View receipt', { act: 'receipt-open', data: { id: t.receiptId } }) : '' }) : '';

