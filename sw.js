// CHEMISTREAL OX service worker
// 네트워크 우선(online은 항상 최신) + 오프라인 시 캐시 폴백. PDF는 용량 때문에 캐시 제외.
const CACHE = 'chemistreal-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 동일 출처만
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && !/\.pdf($|\?)/i.test(url.pathname)) {
        const copy = res.clone();
        const c = await caches.open(CACHE);
        c.put(req, copy).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
