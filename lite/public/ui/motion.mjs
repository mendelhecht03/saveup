// Motion helpers. Everything animates transform and opacity only, and every
// helper becomes instant when the phone asks for reduced motion.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
const EASE = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

// ---- FLIP: remember where things were, redraw, then glide from old to new.
export function capture(root = document) {
  const rows = new Map(), bars = new Map(), counts = new Map();
  for (const r of root.querySelectorAll('[data-flip]')) rows.set(r.dataset.flip, r.getBoundingClientRect().top);
  for (const b of root.querySelectorAll('[data-bar]')) {
    const box = b.getBoundingClientRect();
    bars.set(b.dataset.bar, Object.fromEntries([...b.querySelectorAll('.seg')].map(s => { const r = s.getBoundingClientRect(); return [s.className, { left: r.left - box.left, width: r.width }]; })));
  }
  for (const c of root.querySelectorAll('[data-count]')) counts.set(c.dataset.countKey || c.dataset.count, Number(c.dataset.count));
  return { rows, bars, counts };
}

export function play(prev, root = document, { firstBars = false } = {}) {
  if (reduced()) return;
  for (const r of root.querySelectorAll('[data-flip]')) {
    const old = prev?.rows.get(r.dataset.flip), now = r.getBoundingClientRect().top;
    if (old === undefined) { if (prev?.rows.size) r.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 120, easing: EASE, fill: 'backwards' }); }
    else if (Math.abs(old - now) > 0.5) r.animate([{ transform: `translateY(${old - now}px)` }, { transform: 'none' }], { duration: 380, easing: SPRING });
  }
  // Budget bars grow with a soft spring: each segment moves and stretches from its old box.
  for (const b of root.querySelectorAll('[data-bar]')) {
    const old = prev?.bars.get(b.dataset.bar);
    if (!old && !firstBars) continue;
    const box = b.getBoundingClientRect();
    [...b.querySelectorAll('.seg')].forEach((s, i) => {
      const r = s.getBoundingClientRect(), from = old?.[s.className] || { left: old ? r.left - box.left + r.width : 0, width: 0 };
      if (r.width < 0.5 || (Math.abs(from.left - (r.left - box.left)) < 0.5 && Math.abs(from.width - r.width) < 0.5)) return;
      s.animate([{ transform: `translateX(${from.left - (r.left - box.left)}px) scaleX(${Math.max(from.width, 0.001) / r.width})` }, { transform: 'none' }], { duration: 700, delay: old ? 0 : 60 * i, easing: SPRING, fill: 'backwards' });
    });
  }
  for (const c of root.querySelectorAll('[data-count]')) {
    const from = prev?.counts.get(c.dataset.countKey || c.dataset.count), to = Number(c.dataset.count);
    if (from !== undefined && from !== to) countUp(c, from, to);
  }
}

// Amounts count up (or down) to their new value.
export function countUp(el, from, to, { duration = 600 } = {}) {
  if (reduced()) return;
  const format = el.dataset.format === 'short' ? v => `$${Math.round(Math.abs(v) / 100).toLocaleString('en-US')}` : v => `$${(Math.abs(v) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const final = el.textContent, sign = to < 0 ? '-' : '', start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - t, 3);
    el.textContent = t < 1 ? sign + format(from + (to - from) * eased) : final;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---- Add purchase opens and closes like Splitwise's Add expense (timed from a
// screen recording): the button becomes a blue circle that grows to fill the screen
// in ~220ms, stays while the keyboard rises, then fades to show the form. Closing
// floods the screen blue, then shrinks the circle back into the button.
// The blue lives on its own layer, much taller than the screen, so neither the
// keyboard resizing the form nor iOS scrolling the page can uncover anything.
const flood = () => {
  const f = document.createElement('div');
  f.className = 'flood';
  f.setAttribute('aria-hidden', 'true');
  // Sized in px from the same innerHeight circleAt uses, so the circle lands on the button.
  f.style.top = `${-innerHeight}px`;
  f.style.height = `${3 * innerHeight}px`;
  document.body.append(f);
  return f;
};
// Circle geometry in the layer's own coordinates (the layer starts one screen above the top).
function circleAt(el) {
  const W = innerWidth, H = innerHeight, b = el?.getBoundingClientRect?.();
  const ok = b && b.width > 0;
  const x = ok ? b.left + b.width / 2 : W - 80, y = (ok ? b.top + b.height / 2 : H - 120) + H;
  return { small: `circle(${ok ? b.height / 2 : 27}px at ${x}px ${y}px)`, big: `circle(${Math.ceil(Math.hypot(W, 2 * H))}px at ${x}px ${y}px)` };
}
export function floodOpen(from) {
  if (reduced()) return;
  const f = flood(), c = circleAt(from);
  from?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' });
  f.animate([{ clipPath: c.small }, { clipPath: c.big }], { duration: 220, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)', fill: 'forwards' });
  f.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 330, duration: 120, easing: 'ease-out', fill: 'forwards' }).finished.then(() => f.remove(), () => f.remove());
}
// swap() removes the form while the screen is blue; target() finds the button to shrink into.
export function floodClose(swap, target) {
  if (reduced()) return swap();
  const f = flood();
  f.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 110, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
    swap();
    // Measured right after the swap (the button may have been redrawn) and with no
    // wait for a frame, so the button always comes back even if frames are throttled.
    const btn = target(), c = circleAt(btn);
    btn?.getAnimations?.().forEach(a => a.cancel());
    f.animate([{ clipPath: c.big }, { clipPath: c.small }], { duration: 240, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)', fill: 'forwards' }).finished
      .then(() => f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' }).finished)
      .finally(() => f.remove());
  }, () => { swap(); f.remove(); });
}

// ---- sheets: CSS springs them open; closing plays the reverse before removal.
export function closeSheet(done) {
  const parts = document.querySelectorAll('.sheet, .sheet-backdrop');
  if (!parts.length || reduced()) return done();
  parts.forEach(p => p.classList.add('is-closing'));
  setTimeout(done, 240);
}

// ---- swipe a row. Right confirms its suggestion and sends the row away; left
// opens a receipt scan for it and springs back. A short drag always springs
// back; past the threshold the row "arms" so letting go is a clear decision.
export function enableSwipe(root, { onConfirm, onScan }) {
  let drag = null;
  root.addEventListener('pointerdown', e => {
    const row = e.target.closest('.row-swipe');
    if (!row || e.button !== 0) return;
    drag = { row, main: row.querySelector('.row-main'), x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId,
      canRight: row.hasAttribute('data-swipe-confirm'), canLeft: row.hasAttribute('data-swipe-scan') };
  });
  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // a scroll, not a swipe
      if (!(dx > 8 && drag.canRight) && !(dx < -8 && drag.canLeft)) return;
      drag.active = true; drag.row.setPointerCapture(e.pointerId);
    }
    drag.dx = Math.min(drag.canRight ? Infinity : 0, Math.max(drag.canLeft ? -Infinity : 0, dx));
    const width = drag.row.offsetWidth, d = Math.abs(drag.dx), sign = Math.sign(drag.dx);
    const resist = d > width * 0.6 ? width * 0.6 + (d - width * 0.6) * 0.3 : d;
    drag.main.style.transform = `translateX(${sign * resist}px)`;
    drag.row.classList.toggle('is-swiping-right', drag.dx > 0);
    drag.row.classList.toggle('is-swiping-left', drag.dx < 0);
    drag.row.classList.toggle('is-armed', d > width * 0.35);
  });
  const springBack = (row, main) => {
    main.animate([{ transform: main.style.transform }, { transform: 'none' }], { duration: reduced() ? 1 : 420, easing: SPRING });
    main.style.transform = '';
    row.classList.remove('is-swiping-right', 'is-swiping-left', 'is-armed');
  };
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { row, main, active, dx } = drag;
    drag = null;
    if (!active) return;
    // Swallow the click the browser fires after a drag so the row doesn't also open.
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    row.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => row.removeEventListener('click', swallow, { capture: true }), 400);
    const width = row.offsetWidth, armed = Math.abs(dx) > width * 0.35 && e.type === 'pointerup';
    if (armed && dx > 0) {
      const anim = main.animate([{ transform: main.style.transform }, { transform: `translateX(${width}px)` }], { duration: reduced() ? 1 : 220, easing: EASE, fill: 'forwards' });
      anim.onfinish = () => onConfirm(row);
    } else {
      springBack(row, main);
      if (armed && dx < 0) onScan(row);
    }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
}

// ---- pull to refresh, with a clear indicator that rotates as you pull.
export function enablePullToRefresh(indicator, { canStart, onRefresh, threshold = 80 }) {
  let start = null, pull = 0;
  const label = indicator.querySelector('span');
  const set = (y, text) => { indicator.style.transform = `translate(-50%, ${y}px)`; indicator.style.opacity = String(Math.min(1, Math.max(0, (y + 60) / 70))); if (text) label.textContent = text; };
  addEventListener('touchstart', e => { start = scrollY <= 0 && canStart() ? e.touches[0].clientY : null; indicator.classList.remove('is-settling'); }, { passive: true });
  addEventListener('touchmove', e => {
    if (start === null) return;
    pull = Math.max(0, e.touches[0].clientY - start) * 0.55;
    indicator.style.setProperty('--pull', String(Math.min(pull / threshold, 1.2)));
    indicator.classList.toggle('is-armed', pull > threshold);
    set(Math.min(pull, threshold + 30) - 60, pull > threshold ? 'Release to refresh' : 'Pull to refresh');
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (start === null) return;
    start = null;
    indicator.classList.add('is-settling');
    if (pull <= threshold) { pull = 0; return set(-80); }
    pull = 0;
    indicator.classList.remove('is-armed'); indicator.classList.add('is-loading');
    set(10, 'Refreshing…');
    try { await onRefresh(); } finally { indicator.classList.remove('is-loading'); set(-80); }
  });
}
