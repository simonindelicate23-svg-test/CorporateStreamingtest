const CACHE_NAME = 'tmc-pwa-cache-v5';
const OFFLINE_URL = '/player.html';
const PRECACHE_ASSETS = [
  '/',
  '/player.html',
  '/styles/style.css',
  '/player/ui.js',
  '/player/api.js',
  '/player/state.js',
  '/player/config.js',
  '/vendor/color-thief.min.js',
  '/sigil.png',
  '/title.png',
  '/favicon.ico'
  // manifest.webmanifest is served dynamically — never precache it
];

function isStaticAsset(pathname) {
  return /\.(?:css|js|mjs|html|webmanifest)$/i.test(pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const pathname = requestUrl.pathname;

  // Never cache the service worker script itself, otherwise updates can get stuck.
  if (pathname === '/service-worker.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  const isApiRequest = pathname.startsWith('/.netlify/functions/');
  if (isApiRequest) {
    // API responses must be fresh; do not persist stale copies across deploys.
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // The manifest is dynamic (served via a Netlify function redirect) — always
  // fetch it fresh so PWA name/colours reflect admin changes immediately.
  if (pathname === '/manifest.webmanifest') {
    event.respondWith(fetch(event.request));
    return;
  }

  const isNavigation = event.request.mode === 'navigate';
  if (isNavigation || isStaticAsset(pathname)) {
    // Stale-while-revalidate: serve cached version immediately (fast), then
    // fetch and cache the latest version in the background for next time.
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response.ok) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached || caches.match(OFFLINE_URL));

          // Return cached immediately if available, otherwise wait for network.
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});
