/* Recall Studio service worker.
 * - App shell + Next static assets: stale-while-revalidate.
 * - Navigations: network-first with an offline fallback to the cached shell.
 * - API (cross-origin) and /api/* (Auth.js session, token minting): never cached — study data and auth must stay live.
 */
const VERSION = 'rs-v4';
const SHELL = ['/', '/decks', '/import', '/insights', '/settings', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function isApi(url) {
  return url.port === '4000' || url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isApi(url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('/offline')) || (await caches.match('/')) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || /\.(css|js|woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone())).catch(() => undefined);
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
