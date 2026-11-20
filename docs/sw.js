// Regenerate this service worker with npm run prepare:site after changing docs/.
const scope = self.registration.scope;
const cachePrefix = 'journal-offline:' + scope + ':';
const cacheName = cachePrefix + '0f524cf4c62e4fa3';
const files = [
  "app.js",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable.png",
  "index.html",
  "manifest.webmanifest",
  "model.js",
  "pdf.js",
  "storage.js",
  "styles.css",
  "vendor/jspdf.umd.min.js",
  "vendor/noto-sans-semibold.woff2",
  "vendor/noto-sans.ttf",
  "vendor/noto-sans.woff2"
];
const assets = new Set(files.map(file => new URL(file, scope).href));
const home = new URL('./index.html', scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(
    [...assets].map(url => new Request(url, { cache: 'reload' })),
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const navigation = event.request.mode === 'navigate' && (url.pathname === new URL(scope).pathname || url.href.split('?')[0] === home);
  const target = navigation ? home : url.href;
  if (event.request.method !== 'GET' || !assets.has(target)) return;
  event.respondWith((async () => {
    const cached = await caches.match(target, { cacheName });
    if (cached) return cached;

    // A navigation can still reach the old worker as the replacement takes control.
    const replacements = (await caches.keys()).filter(name => name.startsWith(cachePrefix) && name !== cacheName);
    for (const name of replacements.reverse()) {
      const replacement = await caches.match(target, { cacheName: name });
      if (replacement) return replacement;
    }
    return fetch(event.request);
  })());
});