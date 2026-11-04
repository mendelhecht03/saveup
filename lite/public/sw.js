// Service worker: lets SaveUp install as a phone app and open instantly.
// App files are fetched fresh when the PC is reachable (so updates show at
// once) and fall back to the last copy when it isn't. Money data (/api/) is
// never cached: it always comes live from the app on the PC.
const CACHE = 'saveup-shell-v1';
const SHELL = [
  '/', 'index.html', 'app.js', 'logic.mjs', 'manifest.webmanifest',
  'ui/tokens.css', 'ui/components.css', 'ui/components.mjs', 'ui/icons.mjs', 'ui/motion.mjs',
  'screens/screens.css', 'screens/inbox.mjs', 'screens/budgets.mjs', 'screens/planned.mjs', 'screens/more.mjs',
  'screens/sheets.mjs', 'screens/shared.mjs', 'screens/gallery.mjs', 'screens/receipt.mjs', 'screens/preview.mjs', 'screens/week.mjs',
  'logic/state.mjs', 'logic/dates.mjs', 'logic/transfers.mjs', 'logic/suggestions.mjs', 'logic/budgets.mjs', 'logic/validate.mjs',
  'logic/review.mjs', 'logic/plans.mjs', 'logic/sync.mjs', 'logic/splits.mjs', 'logic/receipts.mjs',
  'fonts/nunito-sans-400.ttf', 'fonts/nunito-sans-700.ttf', 'fonts/nunito-sans-800.ttf',
  'icons/app/icon-192.png', 'icons/app/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  // A missing file must not stop the install, so each one is cached on its own.
  event.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/_preview/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(event.request);
      if (fresh.ok) cache.put(event.request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(event.request)) || (event.request.mode === 'navigate' && await cache.match('/')) || Response.error();
    }
  })());
});
