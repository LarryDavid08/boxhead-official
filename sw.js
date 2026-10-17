// Cache-first app shell so the game opens offline once installed (needs HTTPS to register).
const CACHE = 'banner-blade-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'vendor/three.module.min.js',
  'src/main.js', 'src/util.js', 'src/world.js', 'src/lowpoly.js', 'src/input.js',
  'src/hud.js', 'src/fx.js', 'src/sfx.js', 'src/player.js', 'src/enemy.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    })),
  );
});
