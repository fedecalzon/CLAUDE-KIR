// Service worker: guarda la app en el celular para abrirla sin señal.
// Los datos de las planillas y la cola de envíos viven en IndexedDB (index.html).
var CACHE = 'pie-carga-v1.7.0';
var ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  // la API de Apps Script (otro dominio) nunca se cachea
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.searchParams.has('action')) return;
  var key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(key, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(function () {
        return hit || new Response('<meta name="viewport" content="width=device-width"><h1>Sin señal</h1><p>Abrí la app una vez con conexión.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      });
      return hit || net;
    });
  }));
});
