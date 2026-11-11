// Bump VERSION on every release so browsers detect a new service worker.
const VERSION = 'v3';
const CACHE = 'speedreader-' + VERSION;
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'epub.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network first so users always get the latest files when online; cache when offline.
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
