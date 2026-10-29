const CACHE = 'gym-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'vendor/supabase.js', 'data/ejercicios.json', 'manifest.webmanifest', 'icons/192.png', 'icons/512.png', 'icons/apple-touch.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('gym-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (url.pathname.includes('/img/')) {
      const saved = await cache.match(event.request);
      if (saved) return saved;
    }
    try {
      const response = await fetch(event.request, {cache:'no-cache'});
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(event.request) || (event.request.mode === 'navigate' && await cache.match('index.html'));
      if (saved) return saved;
      throw error;
    }
  })());
});
