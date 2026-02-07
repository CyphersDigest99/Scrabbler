const CACHE_NAME = 'scrabbler-v2';

// Relative asset paths (works with any base URL, including GitHub Pages subpaths)
const STATIC_ASSET_PATHS = [
    'index.html',
    'css/styles.css',
    'js/main.js',
    'js/letterWheel.js',
    'js/scene.js',
    'js/dictionary.js',
    'js/letterRack.js',
    'js/tour.js',
    'js/search.js',
    'js/definitions.js',
    'js/utils.js',
    'data/scrabble-dictionary.txt',
    'manifest.json',
    'icons/icon-192.svg',
    'icons/icon-512.svg'
];

const EXTERNAL_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
    'https://fonts.googleapis.com/css2?family=Bungee&display=swap'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Resolve relative paths against SW scope
            const base = self.registration.scope;
            const localPromises = STATIC_ASSET_PATHS.map((path) => {
                const url = new URL(path, base).href;
                return cache.add(url).catch((err) => console.warn('Failed to cache:', url, err));
            });
            const externalPromises = EXTERNAL_ASSETS.map((url) =>
                cache.add(url).catch((err) => console.warn('Failed to cache external:', url, err))
            );
            return Promise.all([...localPromises, ...externalPromises]);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for everything else
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Network-first for HTML (navigation)
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Cache successful responses for same-origin or known CDNs
                if (response.ok && (url.origin === self.location.origin ||
                    url.hostname.includes('cdnjs.cloudflare.com') ||
                    url.hostname.includes('fonts.googleapis.com') ||
                    url.hostname.includes('fonts.gstatic.com') ||
                    url.hostname.includes('unpkg.com'))) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
