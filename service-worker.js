const CACHE_NAME = 'bus-times-cache-v4';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
];

// Install - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - network first, fallback to cache for assets
self.addEventListener('fetch', event => {
  // Don't cache API calls - let the app handle that with localStorage
  if (event.request.url.includes('api.tfl.gov.uk')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For app assets: try network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Update cache with fresh version
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
