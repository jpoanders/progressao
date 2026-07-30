// Progression service worker — precaches the app shell, serves cache-first (offline).
//
// Bump CACHE_VERSION whenever a shipped file changes, otherwise devices that already
// installed the app keep serving the old cache forever. Every file listed in SHELL must
// exist: cache.addAll() rejects atomically, which would leave the app uncached.
const CACHE_VERSION = 'progression-v13';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './src/main.js',
  './src/app.js',
  './src/catalog.js',
  './src/dom.js',
  './src/format.js',
  './src/plan.js',
  './src/progress.js',
  './src/state.js',
  './src/i18n/index.js',
  './src/i18n/en.js',
  './src/i18n/pt-BR.js',
  './src/views/banners.js',
  './src/views/day.js',
  './src/views/exercises.js',
  './src/views/fields.js',
  './src/views/planEditor.js',
  './src/views/plans.js',
  './src/views/selectors.js',
  './src/views/tools.js',
  './fonts/archivo-var.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Keep a copy of same-origin resources for future offline use.
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // Offline navigations fall back to the app shell.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});
