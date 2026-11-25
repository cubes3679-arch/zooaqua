const CACHE = 'zooaqua-guide-v5';
const FILES = [
  './', './index.html', './guide.css', './guide.mjs', './model.mjs', './storage.mjs',
  './recognition.mjs', './manifest.json', './icon-192.svg',
  './list.html', './detail.html', './facilities.html', './miss.html', './wild.html',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key === 'zoo-records-v3' || (key.startsWith('zooaqua-guide-') && key !== CACHE))
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const target = new URL(event.request.url);
  target.search = '';
  target.hash = '';
  if (!FILES.some(file => new URL(file, self.registration.scope).href === target.href)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (!response.ok) throw new Error('App shell unavailable');
    return response;
  }).catch(async () => (await caches.open(CACHE)).match(target.href)));
});
