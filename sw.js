/* ============================================================================
   sw.js — Lumira | Dil Kartları  ·  Service Worker
   ----------------------------------------------------------------------------
   Strateji (Google'ın "app shell + runtime caching" önerisi):

     · Navigasyon (HTML)     → network-first + navigation preload → cache → offline.html
     · Uygulama kabuğu       → stale-while-revalidate (anında açılır, arkada tazelenir)
     · vocab-*.js (büyük)    → cache-first (bir kez indirilir, kalıcı kalır)
     · Görseller / fontlar   → cache-first (limitli)
     · CDN (firebase, gsap)  → stale-while-revalidate, çevrimdışıyken sessizce atlanır
     · Firebase Realtime DB  → asla önbelleklenmez (network-only)

   SÜRÜM YÜKSELTME: Dosyalarda değişiklik yaptığında sadece CACHE_VERSION'ı
   artır (v1.0.0 → v1.0.1). Eski önbellekler otomatik silinir ve kullanıcıya
   "Yeni sürüm hazır" bildirimi gösterilir.
   ========================================================================== */
'use strict';

const CACHE_VERSION = 'v1.7.29';
const SHELL_CACHE   = `lumira-shell-${CACHE_VERSION}`;
const VOCAB_CACHE   = 'lumira-vocab-v1';      /* sözlükler sürümden bağımsız */
const ASSET_CACHE   = 'lumira-assets-v1';
const CDN_CACHE     = 'lumira-cdn-v1';
const KEEP = [SHELL_CACHE, VOCAB_CACHE, ASSET_CACHE, CDN_CACHE];

const OFFLINE_URL = './offline.html';

/* ---- İlk kurulumda indirilecek çekirdek (küçük, hızlı) ------------------- */
const SHELL = [
  './',
  './index.html',
  './offline.html',
  './privacy/',
  './privacy/index.html',
  './manifest.json',
  './pwa.css',
  './pwa.js',
  './support-badges.js',
  './analytics.js',
  './splash.js',
  './admin.js',
  './theme.css',
  './theme.js',
  './voice.js',
  './progress.js',
  './leaderboard.js',
  './vocab-core.js',
  './scene-bg.jpg',
  './icon-192.png',
  './splash-logo.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './apple-touch-icon.png',
  './favicon.ico'
];

/* ---- İstek üzerine indirilebilecek sözlükler ("Çevrimdışı paket") -------- */
const VOCAB_FILES = [
  './vocab-de.js', './vocab-en.js', './vocab-ar.js',
  './vocab-fr.js', './vocab-es.js', './vocab-ru.js'
];

const isVocab = (url) => /vocab-[a-z_]+\.js$/i.test(url.pathname);
const isCDN   = (url) => /(gstatic\.com|cdnjs\.cloudflare\.com|googleapis\.com|jsdelivr\.net|unpkg\.com)$/.test(url.hostname);
const isLive  = (url) => /(firebaseio\.com|firebasedatabase\.app|identitytoolkit|googleapis\.com\/identitytoolkit)/.test(url.hostname + url.pathname);
const isAsset = (url) => /\.(png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|mp3|ogg)$/i.test(url.pathname);

/* ========================================================== INSTALL ====== */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    /* Tek tek ekliyoruz: eksik/başarısız bir dosya kurulumun tamamını
       çökertmesin (addAll all-or-nothing çalışır). */
    await Promise.allSettled(SHELL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' }))
    ));
  })());
  /* DİKKAT: Buraya bir zamanlar koşulsuz self.skipWaiting() konmuştu.
     Sayfa tarafındaki "controllerchange → location.reload()" ile birleşince
     SONSUZ YENİDEN YÜKLEME DÖNGÜSÜ oluşuyordu: yeni worker hemen devralıyor,
     sayfa yenileniyor, yenilenince worker yeniden denetleniyor, tekrar
     devralıyor… Ekranda her şey sürekli baştan başlıyordu.
     Artık devralma yalnızca kullanıcı "Güncelle"ye bastığında (SKIP_WAITING
     mesajıyla) gerçekleşiyor. Dosya tazeliği zaten iki ayrı yolla güvence
     altında: kod dosyaları ağ öncelikli ve adreslerinde ?v= sürüm etiketi var. */
});

/* ========================================================= ACTIVATE ====== */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => {
      if (n.startsWith('lumira-') && !KEEP.includes(n)) return caches.delete(n);
      return Promise.resolve();
    }));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

/* ============================================================ FETCH ====== */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  /* Bağlantı testi (?__ping=) ve canlı veri (liderlik, giriş) hiçbir zaman
     önbelleklenmez — doğrudan ağa gider. Aksi hâlde çevrimdışıyken bile
     önbellekten cevap döner ve "çevrimiçiyiz" sanılır. */
  if (url.searchParams.has('__ping')) return;
  if (isLive(url)) return;

  /* 1) Sayfa açılışları */
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  /* 2) Sözlük dosyaları — cache-first, kalıcı */
  if (url.origin === self.location.origin && isVocab(url)) {
    event.respondWith(cacheFirst(req, VOCAB_CACHE));
    return;
  }

  /* 3) Görsel / font / ses */
  if (url.origin === self.location.origin && isAsset(url)) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }

  /* 4) Dış kaynaklar (firebase sdk, gsap, lenis) */
  if (isCDN(url)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE, true));
    return;
  }

  /* 5) Kendi kod dosyalarımız (js/css) — ÖNCE AĞ.
     Eskiden "önbellekten ver, arkada tazele" idi; bu yüzden bir düzeltme
     yayınlandığında kullanıcı eski kodu bir açılış daha görüyordu. Dosyalar
     küçük olduğu için ağ öncelikli olması daha doğru; çevrimdışında yine
     önbellekten gelir. */
  if (url.origin === self.location.origin && /\.(js|css)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  /* 6) Kalan her şey */
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreVary: true });
    return hit || Response.error();
  }
}

async function handleNavigate(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const preload = await event.preloadResponse;
    if (preload) {
      cache.put('./index.html', preload.clone()).catch(() => {});
      return preload;
    }
    const fresh = await fetch(event.request);
    cache.put('./index.html', fresh.clone()).catch(() => {});
    return fresh;
  } catch (e) {
    return (await cache.match('./index.html')) ||
           (await cache.match('./')) ||
           (await cache.match(OFFLINE_URL)) ||
           new Response('<h1>Çevrimdışı</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName, allowOpaque) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  const network = fetch(req).then((res) => {
    if (res && (res.ok || (allowOpaque && res.type === 'opaque'))) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);
  return hit || (await network) || Response.error();
}

/* ========================================================== MESSAGE ====== */
self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'GET_VERSION') {
    try {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ version: CACHE_VERSION });
      } else if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'VERSION', version: CACHE_VERSION });
      }
    } catch (e) {}
    return;
  }

  /* Çevrimdışı paket: tüm sözlükleri arka planda indir, ilerlemeyi bildir */
  if (data.type === 'CACHE_ALL') {
    event.waitUntil((async () => {
      const cache = await caches.open(VOCAB_CACHE);
      const list = VOCAB_FILES.slice();
      let done = 0;
      for (const url of list) {
        try {
          const already = await cache.match(url);
          if (!already) await cache.add(new Request(url, { cache: 'reload' }));
        } catch (e) {}
        done++;
        const clientsList = await self.clients.matchAll({ type: 'window' });
        clientsList.forEach((c) => c.postMessage({
          type: 'CACHE_PROGRESS', done, total: list.length
        }));
      }
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((c) => c.postMessage({ type: 'CACHE_DONE' }));
    })());
    return;
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.filter(n => n.startsWith('lumira-')).map(n => caches.delete(n)));
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((c) => c.postMessage({ type: 'CACHE_CLEARED' }));
    })());
    return;
  }

  /* Uygulama içinden yerel bildirim (günlük hatırlatma) */
  if (data.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(showLumiraNotification(data.payload || {}));
  }
});

/* ============================================================= PUSH ====== */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (e) { payload = { body: event.data ? event.data.text() : '' }; }
  /* FCM "notification" alanı da desteklensin */
  const n = payload.notification || payload;
  event.waitUntil(showLumiraNotification({
    title: n.title || 'Dil Kartları',
    body:  n.body  || 'Bugünkü kelimelerin seni bekliyor 🌙',
    url:   (payload.data && payload.data.url) || n.url || './?src=push',
    tag:   n.tag || 'lumira-push'
  }));
});

function showLumiraNotification(o) {
  return self.registration.showNotification(o.title || 'Dil Kartları', {
    body: o.body || 'Çalışma vakti!',
    icon: './icon-192.png',
    badge: './icon-96.png',
    tag: o.tag || 'lumira',
    renotify: true,
    lang: 'tr',
    dir: 'ltr',
    vibrate: [60, 40, 60],
    requireInteraction: false,
    data: { url: o.url || './?src=notification' },
    actions: [
      { action: 'study', title: '📘 Çalış' },
      { action: 'later', title: '⏰ Sonra' }
    ]
  });
}

self.addEventListener('notificationclick', (event) => {
  const notif = event.notification;
  notif.close();
  if (event.action === 'later') return;

  const target = (notif.data && notif.data.url) || './?src=notification';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes(self.registration.scope) && 'focus' in c) {
        c.postMessage({ type: 'NOTIFICATION_OPEN', url: target });
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});

/* ============================================ PERIODIC BACKGROUND SYNC ==== */
/* Chrome/Android'de (yüklü PWA + TWA) günlük hatırlatmayı uygulama kapalıyken
   de tetikler. Desteklenmeyen yerlerde pwa.js zamanlayıcısı devreye girer. */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-reminder') {
    event.waitUntil(showLumiraNotification({
      title: 'Bugün 10 kelime? 🌙',
      body: 'Serini bozma — birkaç kart yeter.',
      url: './?src=reminder&tab=cards',
      tag: 'daily-reminder'
    }));
  }
});

/* Bağlantı geri geldiğinde bekleyen işleri tetikleme kancası */
self.addEventListener('sync', (event) => {
  if (event.tag === 'lumira-sync') {
    event.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: 'window' });
      all.forEach((c) => c.postMessage({ type: 'BACK_ONLINE' }));
    })());
  }
});
