// Service Worker for Stray Arrows — enables offline play + app store packaging
// CACHE_NAME is auto-synced from package.json version by tools/sync-sw-version.js
// (runs as `prebuild` script). Do NOT edit the version below by hand — bump
// package.json instead and run `npm run build`.
const CACHE_NAME = 'stray-arrows-v2.0.0';

// Pre-cached on install: everything required to render the first frame and
// reach the level-1 board. handcrafted-levels.js is included because it owns
// the tutorial (1-10) and milestone levels — without it offline players would
// silently drop into procedural fallback for level 1.
//
// v1.0.19: dropped Rush Hour imported chunks — level supply is now
// handcrafted + procedural only, both packed inside index.html /
// handcrafted-levels.js so no extra precache entries are needed.
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/handcrafted-levels.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
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

self.addEventListener('fetch', e => {
  const req = e.request;

  // Only handle GETs from our own origin. AdMob, Google Fonts, etc. must hit
  // the network directly — caching them would either break ad rotation or
  // require complex cache-busting we don't need.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations so a fresh HTML can land in the next tab,
  // with the cached copy as the offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for assets, with runtime caching: anything we successfully
  // fetch over the network gets stored so the next offline visit has it.
  // Without this, files outside the install ASSETS list (e.g. sounds/*.mp3)
  // would be missing on the first offline launch.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        // Only cache full, successful, basic (same-origin) responses. Opaque
        // responses (status 0) and partials (206) corrupt caches.
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return resp;
      });
    })
  );
});
