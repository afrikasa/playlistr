const CACHE = 'playlistr-shell-v3';

const API_PATHS = [
  '/library', '/download', '/progress', '/cancel', '/auth', '/callback',
  '/playlists', '/status', '/open-folder', '/local-playlists', '/sync-playlists',
  '/artist-image', '/cover/', '/files/',
];

function isApi(url) {
  const p = new URL(url).pathname;
  return API_PATHS.some((prefix) => p.startsWith(prefix));
}

async function cacheFile(cache, url) {
  try {
    const r = await fetch(url);
    if (r.ok) await cache.put(url, r);
  } catch (_) {}
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Cachear shell core — individualmente para não abortar se um falhar
      await Promise.all(['/', '/index.html', '/manifest.json'].map(u => cacheFile(cache, u)));
      // Tentar cachear todos os assets do build
      try {
        const manifest = await fetch('/asset-manifest.json').then(r => r.json());
        const urls = Object.values(manifest.files || {}).filter(
          u => !u.endsWith('.map') && !u.endsWith('.txt')
        );
        await Promise.all(urls.map(u => cacheFile(cache, u)));
      } catch (_) {}
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;
  if (isApi(request.url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone(); // clonar imediatamente antes de qualquer async
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
    })
  );
});
