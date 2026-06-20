// CHEMISTREAL 서비스워커 — 오프라인 회복탄력성
// 전략: 네트워크 우선(온라인이면 항상 최신 콘텐츠), 실패 시 캐시 폴백.
//        POST(시트 저장)와 외부 origin은 건드리지 않는다. 온라인에선 stale 위험이 없다.
const CACHE = 'chemistreal-v1';
const SHELL = ['index.html', 'report.html', 'challenge.html', 'pending.html', 'admin.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // 시트 저장 등 POST는 통과
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;             // 외부 스크립트/시트 API는 통과
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) {
        if (m) return m;
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
