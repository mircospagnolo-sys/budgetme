const CACHE_NAME = 'budgetme-v5';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first per JS/CSS, cache-first per il resto
self.addEventListener('fetch', e => {
  if (e.request.url.match(/\.(js|css)$/)) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Firebase e CDN: sempre dalla rete
  if (e.request.url.includes('firebase') ||
      e.request.url.includes('gstatic') ||
      e.request.url.includes('unpkg') ||
      e.request.url.includes('cdnjs')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
