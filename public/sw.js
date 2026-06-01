const CACHE_VERSION = 'aiobs-v8';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const API_CACHE     = `${CACHE_VERSION}-api`;

const PRECACHE_ASSETS = [
  '/assets/style.css?v=4',
  '/assets/countries-110m.json',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js',
];

// Install: pre-cache static assets (NOT index.html — always fetch fresh)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: purge old cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle GET requests. POST/PUT/DELETE should always bypass the service worker cache.
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // API routes: network-first, fall back to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // HTML: always network-first so updates are seen immediately
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }

  // CSS, JS, assets, CDN: network-first for guaranteed freshness and offline fallback
  event.respondWith(networkFirst(event.request, STATIC_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    } catch (e) {
      console.warn('Caching failed but proceeding with network response:', e);
    }
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
      } catch (e) {
        console.warn('Caching failed but proceeding with network response:', e);
      }
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error('Network error and no cache available');
  }
}
