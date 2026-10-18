// Service worker: caches the app shell so Thiran opens with no network.
// API data is cached by the app itself (IndexedDB) and synced through the outbox.
const VERSION = 'thiran-v1';
const SHELL = [
  '/', '/index.html', '/passport.html', '/manifest.webmanifest',
  '/css/app.css', '/js/app.js', '/js/api.js', '/js/store.js', '/js/i18n.js', '/js/voice.js',
  '/locales/ta.json', '/locales/hi.json',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // QR codes: cache first.
  if (url.pathname.endsWith('/qr.svg')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
    })));
    return;
  }
  // Other API calls go to the network; the app falls back to its own saved copy.
  if (url.pathname.startsWith('/api/')) return;

  // Pages: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    const page = url.pathname.startsWith('/p/') ? '/passport.html' : '/index.html';
    e.respondWith(fetch(req).catch(() => caches.match(page)));
    return;
  }
  // Static files: serve from cache, refresh in the background.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
