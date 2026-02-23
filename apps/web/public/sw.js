// Minimal service worker — required for PWA installability.
// No caching strategy: Codeck is a live terminal app, all data must be fresh.
// The SW only exists to satisfy the browser's PWA install criteria.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Pass all fetches through to the network (no cache)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
