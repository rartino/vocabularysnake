fetch('./manifest.json')
    .then(response => response.json())
    .then(manifest => {
        const APP_VERSION = manifest.version;
        const CACHE_NAME = `labyrinth-cache-v${APP_VERSION}`;  // Use dynamic version from manifest

        const urlsToCache = [
            './',
            './index.html',
            './manifest.json',
            './sw.js',
            './game.js',
            './background.png',
            './offline.html',
            'https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js'
        ];

        // Install the service worker and cache the necessary files
        self.addEventListener('install', function(event) {
            event.waitUntil(
                caches.open(CACHE_NAME).then(function(cache) {
                    console.log('Opened cache with version:', APP_VERSION);
                    return cache.addAll(urlsToCache);
                })
            );
            self.skipWaiting();  // Activate the service worker immediately
        });

        // Remove old caches when a new service worker is activated
        self.addEventListener('activate', function(event) {
            event.waitUntil(
                caches.keys().then(function(cacheNames) {
                    return Promise.all(
                        cacheNames.map(function(cacheName) {
                            if (cacheName !== CACHE_NAME) {
                                console.log('Deleting old cache:', cacheName);
                                return caches.delete(cacheName);
                            }
                        })
                    );
                })
            );
            self.clients.claim();  // Immediately take control of clients
        });

        // Fetch handler with stale-while-revalidate for key assets and offline fallback
        self.addEventListener('fetch', function(event) {
            event.respondWith(
                caches.match(event.request).then(function(cachedResponse) {
                    // Serve from cache if available
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // If the resource is not cached, fetch it from the network
                    return fetch(event.request).catch(function() {
                        // If the network is unavailable, serve the offline page for HTML requests
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('./offline.html');
                        }
                    });
                })
            );
        });
    })
    .catch(error => {
        console.error('Failed to load manifest:', error);
    });

