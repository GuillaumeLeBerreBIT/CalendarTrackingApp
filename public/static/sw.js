const CACHE_NAME = 'tracking-calendar-v1';

// Only cache static assets that definitely exist
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/css/styles.css',
  '/css/components.css',
  '/css/groups.css',
  '/css/navbar.css',
  '/css/todo-styles.css',
  '/css/utilities.css',
  '/css/calendar.css',
  '/js/calendar.js',
  '/js/groups.js',
  '/js/navbar.js',
  '/js/todo.js',
  '/js/pwa.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching assets...');
        
        // ✅ Cache assets one by one to see which fail
        return Promise.allSettled(
          ASSETS_TO_CACHE.map((url) =>
            cache.add(url)
              .then(() => console.log(`✅ Cached: ${url}`))
              .catch((err) => console.error(`❌ Failed to cache ${url}:`, err))
          )
        );
      })
      .then(() => {
        console.log('[Service Worker] Installation complete');
        return self.skipWaiting(); // ✅ Activate immediately
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activated');
        return self.clients.claim(); // ✅ Take control immediately
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ Only handle requests to your domain
  if (url.origin !== location.origin) {
    return;
  }

  // ✅ Skip API calls and auth requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/login' ||
    url.pathname === '/register' ||
    url.pathname === '/logout'
  ) {
    return;
  }

  event.respondWith(
    // Try cache first for static assets
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log(`[Service Worker] Serving from cache: ${url.pathname}`);
          return cachedResponse;
        }

        // Not in cache - fetch from network
        return fetch(request)
          .then((response) => {
            // ✅ Only cache successful responses
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // ✅ Cache static assets dynamically
            if (
              url.pathname.startsWith('/css/') ||
              url.pathname.startsWith('/js/') ||
              url.pathname.startsWith('/icons/') ||
              url.pathname.match(/\.(png|jpg|jpeg|svg|gif|woff|woff2|ttf|json)$/)
            ) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
                console.log(`[Service Worker] Cached new asset: ${url.pathname}`);
              });
            }

            return response;
          })
          .catch((error) => {
            console.error(`[Service Worker] Fetch failed for ${url.pathname}:`, error);
            
            // ✅ Return offline page if available
            return caches.match('/offline.html') || new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});