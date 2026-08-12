/* 온종일 체험단 Service Worker
   배포마다 VERSION 을 올리면 하단 '새로운 업데이트' 배너가 뜹니다. */
const VERSION = 'onjongil-v3';

self.addEventListener('install', function (e) {
  // 새 SW 즉시 대기 → skipWaiting 은 배너에서 사용자가 누르면 호출
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
  // 옛 캐시 정리
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    })
  );
});

// 정적 자산만 가볍게 캐시(네트워크 우선), HTML은 항상 네트워크
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') return; // 페이지는 항상 최신
  if (/\.(png|jpg|jpeg|webp|css|js|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(VERSION).then(function (cache) {
        return fetch(req).then(function (res) {
          cache.put(req, res.clone()); return res;
        }).catch(function () { return cache.match(req); });
      })
    );
  }
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
