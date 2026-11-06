// The SaveUp component set. Every screen is built only from these functions.
// Each returns an HTML string, so screens stay plain functions of the data and
// can be tested in Node. Styling lives in components.css; values in tokens.css.
import { line, artFor } from './icons.mjs';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (c, { cents = true } = {}) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
// Whole dollars when exact, otherwise cents: "$60" but "$52.18".
export const moneyShort = c => money(c, { cents: c % 100 !== 0 });
const attrs = (data = {}) => Object.entries(data).filter(([, v]) => v != null && v !== false).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
const cls = (...names) => names.filter(Boolean).join(' ');

// ---- icon tile: the soft rounded square that holds a 3D icon
export function iconTile(key, { size = 'md', emoji, round = false } = {}) {
  const a = artFor(key, emoji);
  const inner = a.real ? `<img src="icons/3d/${esc(a.key)}.png" alt="" loading="lazy">` : `<span class="tile-emoji">${esc(a.emoji)}</span>`;
  return `<span class="tile tile-${size} tint-${a.tint}${round ? ' tile-round' : ''}" aria-hidden="true">${inner}</span>`;
}

// ---- buttons
export function button(label, { variant = 'primary', size = 'md', act, data, icon, type = 'button', full = false, disabled = false, aria } = {}) {
  return `<button type="${type}" class="${cls('btn', `btn-${variant}`, `btn-${size}`, full && 'btn-full')}"${act ? ` data-act="${esc(act)}"` : ''}${attrs(data)}${disabled ? ' disabled' : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}>${icon ? line(icon, { size: size === 'sm' ? 18 : 20 }) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
}
export const iconButton = (icon, aria, opts = {}) => `<button type="button" class="${cls('icon-btn', opts.variant && `icon-btn-${opts.variant}`)}" aria-label="${esc(aria)}"${opts.act ? ` data-act="${esc(opts.act)}"` : ''}${attrs(opts.data)}${opts.disabled ? ' disabled' : ''}>${line(icon)}</button>`;
export const link = (label, { act, data, chevron = true } = {}) => `<button type="button" class="text-link"${act ? ` data-act="${esc(act)}"` : ''}${attrs(data)}><span>${esc(label)}</span>${chevron ? line('chevronRight', { size: 16 }) : ''}</button>`;

// ---- status pills: bank status, review status and match status are always separate pills
const PILL_TONES = { ok: 'mint', warn: 'amber', info: 'slate', blue: 'blue', danger: 'danger' };
export const statusPill = (label, tone = 'info', { icon } = {}) => `<span class="pill pill-${PILL_TONES[tone] || tone}">${icon ? line(icon, { size: 13 }) : ''}${esc(label)}</span>`;
export const pills = list => list.length ? `<span class="pill-row">${list.join('')}</span>` : '';

// ---- category chip (pastel tint per budget)
// A suggested category is an outlined chip with a sparkle; a confirmed one is
// solid with a check, so a guess never looks like a decision.
export const categoryChip = (name, tint = 'gray', { dropdown = false, act, data, suggested = false, confirmed = false } = {}) => {
  const tag = act ? 'button' : 'span';
  const mark = suggested ? line('sparkle', { size: 13 }) : confirmed ? line('check', { size: 13 }) : '';
  const label = suggested ? ` aria-label="Suggested: ${esc(name)}" title="Suggested, not confirmed"` : '';
  return `<${tag}${act ? ` type="button" data-act="${esc(act)}"` : ''}${attrs(data)}${label} class="chip tint-${tint}${suggested ? ' chip-suggested' : ''}">${mark}${esc(name)}${dropdown ? line('chevronDown', { size: 14 }) : ''}</${tag}>`;
};

// ---- budget bar: spent (solid blue), pending (dotted amber), planned (striped green), left (pale)
export function barSegments({ limit, spent = 0, pending = 0, planned = 0 }) {
  const used = Math.max(0, spent) + Math.max(0, pending) + Math.max(0, planned);
  const scale = Math.max(limit, used, 1); // past 100%, segments shrink to fit and the overflow is marked
  const pct = v => Math.max(0, v) * 100 / scale;
  return { spent: pct(spent), pending: pct(pending), planned: pct(planned), left: pct(Math.max(0, limit - used)), over: used > limit && limit > 0, limitAt: limit > 0 ? limit * 100 / scale : 100 };
}
// `id` lets the app animate this bar from its previous values after a redraw.
export function budgetBar(values, { size = 'md', label, id } = {}) {
  const s = barSegments(values);
  const seg = (k, w) => w > 0 ? `<i class="seg seg-${k}" style="--w:${w.toFixed(3)}%"></i>` : '';
  return `<div class="${cls('bar', `bar-${size}`, s.over && 'bar-over')}"${id ? ` data-bar="${esc(id)}"` : ''} role="img" aria-label="${esc(label || '')}">${seg('spent', s.spent)}${seg('pending', s.pending)}${seg('planned', s.planned)}${seg('left', s.left)}${s.over ? `<b class="bar-limit" style="--at:${s.limitAt.toFixed(3)}%"></b>` : ''}</div>`;
}
// Percent of the limit, never capped at 100.
export const percentOf = (part, limit) => limit > 0 ? Math.round(Math.max(0, part) * 100 / limit) : 0;
export function barLegend(items, { layout = 'columns' } = {}) {
  return `<ul class="legend legend-${layout}">${items.map(i => `<li><i class="dot dot-${i.kind}"></i>${layout === 'columns'
    ? `<span><b>${i.pct}%</b><b>${moneyShort(i.cents)}</b><small>${esc(i.label)}</small></span>`
    : `<span class="grow">${esc(i.label)}</span><b>${moneyShort(i.cents)}</b>`}</li>`).join('')}</ul>`;
}

// ---- cards and list sections
export const card = (body, { cls: extra, tag = 'section', data, act } = {}) => `<${tag} class="${cls('card', extra)}"${act ? ` data-act="${esc(act)}"` : ''}${attrs(data)}>${body}</${tag}>`;

// A list row: icon, title, subtitle, optional chip, amount, pills and chevron.
// `swipe` marks a row that can be swiped: right to confirm its suggestion
// (`swipe.confirm`, when there is one), left to scan a receipt (`swipe.scan`).
// `activity` lays a row out like Splitwise's activity feed: a square tile with a
// small badge, then title, a colored amount line, the chip and a muted date.
export function row({ icon, emoji, title, sub, amount, amountTone, chip, pillList = [], chevron = true, act, data, swipe, tag = 'button', extra, activity }) {
  // The outer row carries every data attribute; the button only needs the action and id.
  const open = tag === 'button' ? `<button type="button" class="row-main"${act ? ` data-act="${esc(act)}"` : ''}${attrs({ id: data?.id })}>` : '<div class="row-main">';
  const close = tag === 'button' ? '</button>' : '</div>';
  const body = activity ? `${open}<span class="row-art">${iconTile(icon, { emoji, size: 'md' })}${activity.badge ? `<span class="${cls('row-badge', activity.badgeTone && `tone-${activity.badgeTone}`)}">${line(activity.badge, { size: 13 })}</span>` : ''}</span>
    <span class="row-text"><b class="row-title">${esc(title)}</b><span class="${cls('row-lead', amountTone && `amount-${amountTone}`)}">${esc(activity.lead)}</span>${chip ? `<span class="row-chip">${chip}</span>` : ''}${sub ? `<small class="row-sub">${esc(sub)}</small>` : ''}</span>${close}`
  : `${open}${icon !== null ? iconTile(icon, { emoji, size: 'sm', round: true }) : ''}
    <span class="row-text"><b class="row-title">${esc(title)}</b>${sub ? `<small class="row-sub">${esc(sub)}</small>` : ''}${pills(pillList)}</span>
    ${chip ? `<span class="row-chip">${chip}</span>` : ''}
    ${amount != null ? `<span class="${cls('row-amount', amountTone && `amount-${amountTone}`)}">${esc(amount)}</span>` : ''}
    ${extra || ''}${chevron ? `<span class="row-chev">${line('chevronRight', { size: 18 })}</span>` : ''}${close}`;
  const rowCls = cls('row', activity && 'row-activity');
  if (!swipe) return `<div class="${rowCls}"${attrs(data)}>${body}</div>`;
  const under = (side, icon, label) => label ? `<div class="swipe-under swipe-${side}" aria-hidden="true">${line(icon, { size: 20 })}<span>${esc(label)}</span></div>` : '';
  return `<div class="${rowCls} row-swipe"${attrs(data)}${swipe.confirm ? ' data-swipe-confirm' : ''}${swipe.scan ? ' data-swipe-scan' : ''}>${under('confirm', 'check', swipe.confirm)}${under('scan', 'camera', swipe.scan)}${body}</div>`;
}

export function listSection({ title, subtitle, icon, iconTone, action, rows = [], footer, id, cls: extra }) {
  const head = title ? `<header class="list-head">${icon ? `<span class="list-head-icon tone-${iconTone || 'blue'}">${line(icon, { size: 18 })}</span>` : ''}
    <span class="grow"><b>${esc(title)}</b>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span>${action || ''}</header>` : '';
  return `<section class="${cls('card', 'list', extra)}"${id ? ` id="${esc(id)}"` : ''}>${head}<div class="list-rows">${rows.join('')}</div>${footer ? `<footer class="list-foot">${footer}</footer>` : ''}</section>`;
}

// ---- page structure
export function pageHeader({ title, back, backAct = 'back', sub, action, center } = {}) {
  const top = back ? `<div class="nav-row"><button type="button" class="back-link" data-act="${esc(backAct)}">${line('back', { size: 20 })}<span>${esc(back)}</span></button>${center ? `<b class="nav-title">${esc(center)}</b>` : ''}<span class="nav-action">${back && action ? action : ''}</span></div>` : '';
  const main = title ? `<div class="page-title-row"><h1 class="page-title">${esc(title)}</h1>${!back && action ? action : ''}</div>` : '';
  return `<header class="page-head">${top}${main}${sub ? `<p class="page-sub">${sub}</p>` : ''}</header>`;
}

const NAV = [['inbox', 'Inbox', 'inbox'], ['budgets', 'Budgets', 'budgets'], ['planned', 'Planned', 'planned'], ['more', 'More', 'more']];
export function bottomNav(active, { badge = 0 } = {}) {
  return `<nav class="bottom-nav" aria-label="Main">${NAV.map(([id, label, icon]) => `<button type="button" class="${cls('nav-tab', active === id && 'is-active')}" data-act="tab" data-tab="${id}"${active === id ? ' aria-current="page"' : ''}>
    <span class="nav-icon">${line(icon, { size: 24 })}${id === 'inbox' && badge ? `<i class="nav-badge">${badge > 99 ? '99+' : badge}</i>` : ''}</span><span>${label}</span></button>`).join('')}</nav>`;
}

// ---- bottom sheet (springs open; the app adds motion)
export const sheet = (body, { title, label } = {}) => `<div class="sheet-backdrop" data-act="close"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || title || 'Details')}"><div class="sheet-grip" aria-hidden="true"></div>
  <div class="sheet-top">${title ? `<h2 class="sheet-title">${esc(title)}</h2>` : '<span></span>'}${iconButton('close', 'Close', { act: 'close', variant: 'soft' })}</div>
  <div class="sheet-body">${body}</div></div>`;

// ---- banner (amber strip, blue info note)
export const banner = (title, text, { tone = 'warn', act, data, icon } = {}) => {
  const tag = act ? 'button' : 'div';
  return `<${tag}${act ? ` type="button" data-act="${esc(act)}"` : ''}${attrs(data)} class="banner banner-${tone}">${line(icon || (tone === 'warn' ? 'alert' : 'info'), { size: 22 })}<span class="grow"><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</span>${act ? line('chevronRight', { size: 18 }) : ''}</${tag}>`;
};
export const note = (text, { tone = 'info', icon } = {}) => `<p class="note note-${tone}">${line(icon || (tone === 'warn' ? 'alert' : 'info'), { size: 18 })}<span>${esc(text)}</span></p>`;

// ---- empty state
export const emptyState = ({ icon = 'empty', title, text, action }) => card(`${iconTile(icon, { size: 'lg' })}<b class="empty-title">${esc(title)}</b>${text ? `<p class="empty-text">${esc(text)}</p>` : ''}${action || ''}`, { cls: 'empty' });

// ---- toast
export const toast = (message, { error = false } = {}) => `<div class="${cls('toast', error && 'toast-error')}" role="${error ? 'alert' : 'status'}">${line(error ? 'alert' : 'check', { size: 18 })}<span>${esc(message)}</span></div>`;

// ---- form fields
const fieldWrap = (label, input, { hint, optional, id } = {}) => `<label class="field"${id ? ` for="${esc(id)}"` : ''}><span class="field-label">${esc(label)}${optional ? ' <i>(optional)</i>' : ''}</span>${input}${hint ? `<small class="field-hint">${esc(hint)}</small>` : ''}</label>`;
export function textField(name, label, { value = '', placeholder = '', required = false, max = 100, optional, hint, type = 'text', inputmode } = {}) {
  return fieldWrap(label, `<input class="input" name="${esc(name)}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="${max}"${required ? ' required' : ''}${inputmode ? ` inputmode="${inputmode}"` : ''}>`, { optional, hint });
}
export function moneyField(name, label, { cents, placeholder = '0.00', required = true, hint, big = false } = {}) {
  const value = cents == null ? '' : (cents / 100).toFixed(2);
  return fieldWrap(label, `<span class="${cls('input', 'input-money', big && 'input-big')}"><span class="input-prefix">$</span><input name="${esc(name)}" inputmode="decimal" autocomplete="off" value="${value}" placeholder="${esc(placeholder)}"${required ? ' required' : ''}></span>`, { hint });
}
export function textArea(name, label, { value = '', placeholder = '', max = 500, required = false, optional, rows = 3, counter = false } = {}) {
  return fieldWrap(label, `<span class="textarea-wrap"><textarea class="input" name="${esc(name)}" rows="${rows}" maxlength="${max}" placeholder="${esc(placeholder)}"${required ? ' required' : ''}>${esc(value)}</textarea>${counter ? `<small class="counter" data-counter="${esc(name)}">${String(value).length}/${max}</small>` : ''}</span>`, { optional });
}
export function selectField(name, label, options, { value, optional } = {}) {
  return fieldWrap(label, `<span class="select-wrap"><select class="input" name="${esc(name)}">${options.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${line('chevronDown', { size: 18 })}</span>`, { optional });
}
// Full-width selectable rows with a radio and an icon; the chosen one gets a blue outline.
export function choiceList(name, choices, { value, legend, hint } = {}) {
  return `<fieldset class="choices">${legend ? `<legend class="field-label">${esc(legend)}</legend>` : ''}${hint ? `<p class="field-hint">${esc(hint)}</p>` : ''}${choices.map(c => `<label class="choice${c.disabled ? ' is-disabled' : ''}">
    <input type="radio" name="${esc(name)}" value="${esc(c.value)}"${c.value === value ? ' checked' : ''}${c.disabled ? ' disabled' : ''}><span class="radio" aria-hidden="true"></span>
    ${c.icon ? iconTile(c.icon, { emoji: c.emoji, size: 'sm', round: true }) : ''}<span class="grow"><b>${esc(c.label)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>${c.badge || ''}</label>`).join('')}</fieldset>`;
}
// Two to three side-by-side options (Cash | Card, Editable copy | Original).
export const segmented = (name, options, { value, legend } = {}) => `<fieldset class="segmented">${legend ? `<legend class="field-label">${esc(legend)}</legend>` : ''}<span class="segmented-track">${options.map(([v, l, icon]) => `<label><input type="radio" name="${esc(name)}" value="${esc(v)}"${v === value ? ' checked' : ''}><span>${icon ? line(icon, { size: 18 }) : ''}${esc(l)}</span></label>`).join('')}</span></fieldset>`;
export const checkbox = (name, label, { checked = false, hint } = {}) => `<label class="check"><input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}><span class="box" aria-hidden="true">${line('check', { size: 14 })}</span><span class="grow"><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
// A stepped slider with a readable label at each stop.
export function stepSlider(name, label, stops, { value = 1, optional } = {}) {
  return `<label class="field slider"><span class="field-label">${esc(label)}${optional ? ' <i>(optional)</i>' : ''}</span>
    <input type="range" name="${esc(name)}" min="1" max="${stops.length}" step="1" value="${value}" style="--fill:${((value - 1) * 100 / Math.max(1, stops.length - 1)).toFixed(2)}%">
    <span class="slider-stops">${stops.map(s => `<span>${esc(s)}</span>`).join('')}</span></label>`;
}
export const searchField = (name, { value = '', placeholder = 'Search' } = {}) => `<label class="search">${line('search', { size: 18 })}<input type="search" name="${esc(name)}" id="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
