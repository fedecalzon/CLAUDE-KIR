'use strict';
// Actualizar esta versión junto con APP_VERSION al publicar cambios del shell.
const CACHE = 'pie-shell-2.3.1';
const SHELL = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const urlFor = path => new URL(path, self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(SHELL.map(path => new Request(urlFor(path), { cache: 'reload' })))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('pie-shell-') && key !== CACHE)
    .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Nunca guardar respuestas de la API, claves de enlace ni fotos en Cache Storage.
  if (request.mode === 'navigate' && url.href.startsWith(self.registration.scope)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(urlFor('index.html')))
      .then(cached => cached || fetch(request)));
    return;
  }
  const asset = SHELL.find(path => url.pathname === new URL(urlFor(path)).pathname);
  if (asset && !url.search) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(urlFor(asset)))
      .then(cached => cached || fetch(request)));
  }
});
