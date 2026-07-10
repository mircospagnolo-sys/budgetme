const CACHE_NAME = 'budgetme-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/components.css',
  '/js/db.js',
  '/js/router.js',
  '/js/utils.js',
  '/js/backup.js',
  '/js/modules/dashboard.js',
  '/js/modules/budget.js',
  '/js/modules/conti.js',
  '/js/modules/depositi.js',
  '/js/modules/pac.js',
  '/pages/dashboard.html',
  '/pages/budget.html',
  '/pages/conti.html',
  '/pages/depositi.html',
  '/pages/pac.html'
];

// Installazione: mette in cache tutti gli asset
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Attivazione: rimuove cache vecchie
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: prima la cache, poi la rete
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
