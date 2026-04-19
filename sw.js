// Service Worker — 캐시 없이 항상 네트워크에서 최신 파일 로드
const VERSION = 'v' + Date.now();

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // 항상 네트워크에서 가져오고 캐시 사용 안 함
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .catch(() => caches.match(e.request)) // 오프라인일 때만 캐시 fallback
  );
});
