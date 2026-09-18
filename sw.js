/* Service Worker — App-Shell-Cache.
   Fotos und Galerie-Daten werden NICHT gecacht (sollen immer aktuell sein). */
var CACHE = 'eventpic-v1';
var SHELL = [
  './', './index.html', './app.js', './tasks.js', './qr.js', './zip.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Alles Fremde (Supabase, Fotos) direkt ans Netz
  if (url.origin !== location.origin) return;
  // App-Shell: erst Netz, bei Fehler Cache (damit Updates ankommen)
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
