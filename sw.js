const CACHE_NAME = "kelime-kartlari-v2";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/*
  Güncel dosyaları her zaman internetten almaya çalışır.
  İnternet yoksa cache kullanılır.
*/
self.addEventListener("fetch", event => {

  // Sadece GET istekleri
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {

        if (
          response &&
          response.status === 200 &&
          response.type === "basic"
        ) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});