/* ============================================================================
   pwa.js — Lumira | Dil Kartları  ·  Uygulama katmanı
   ----------------------------------------------------------------------------
   Mevcut uygulama koduna DOKUNMAZ. Sadece dışarıdan bağlanır:

     1  Service Worker kaydı + otomatik güncelleme kontrolü
     2  Tam ekran / edge-to-edge + durum çubuğu rengi (Android 16/17 uyumlu)
     3  Android geri tuşu (predictive back dahil) ve "çıkmak için tekrar bas"
     4  Deep link · uygulama kısayolları · paylaşım menüsünden gelen metin
     5  Kurulum afişi (Android) + iOS "Ana Ekrana Ekle" rehberi
     6  Bildirimler: günlük hatırlatma + push (FCM uyumlu)
     7  Çevrimdışı paket indirme (tüm sözlükler)
     8  Favoriler ⭐ ve kullanım istatistikleri
     9  Dışa aktarma: dosya indirme + Web Share ile paylaşma
    10  Hata kaydı / çökme raporu
    11  Puanlama isteği (Play Store)
    12  Yumuşak sayfa geçişleri + kaldığı yerden devam

   Global API:  window.PWA  (toast, share, saveFile, notify, openSettings ...)
   ========================================================================== */
(function () {
'use strict';

/* ========================================================== AYARLAR ====== */
var CONFIG = {
  appName:      'Dil Kartları',
  brand:        'Lumira',
  packageId:    'com.lumira.dilkartlari',   /* Bubblewrap ile aynı olmalı */
  playUrl:      'https://play.google.com/store/apps/details?id=com.lumira.dilkartlari',
  vapidKey:     '',                          /* FCM/WebPush açık anahtarı (ops.) */
  pushEndpoint: '',                          /* abonelik gönderilecek sunucu (ops.) */
  errorEndpoint:'',                          /* hata raporu sunucusu (ops.) */
  reminderHour: 20,                          /* varsayılan hatırlatma saati */
  reminderMin:  0
};
window.PWA_CONFIG = CONFIG;

/* ============================================================ YARDIM ===== */
var $  = function (id) { return document.getElementById(id); };
var qs = function (s, r) { return (r || document).querySelector(s); };

function store(key, val) {
  try {
    if (val === undefined) {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
    localStorage.setItem(key, JSON.stringify(val));
    return val;
  } catch (e) { return null; }
}
function today() {
  var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
/* Ana script'teki top-level let/const değişkenlerine güvenli erişim */
function G(name) {
  try { return new Function('try{return typeof ' + name + '!=="undefined"?' + name + ':null}catch(e){return null}')(); }
  catch (e) { return null; }
}
/* ...ve onlara güvenli yazma (idx gibi) */
function setG(name, val) {
  try { new Function('v', 'try{' + name + '=v}catch(e){}')(val); return true; }
  catch (e) { return false; }
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

/* -------------------------------------------------------------- TOAST --- */
function toastHost() {
  var h = $('pwa-toasts');
  if (!h) { h = document.createElement('div'); h.id = 'pwa-toasts'; document.body.appendChild(h); }
  return h;
}
function toast(msg, opts) {
  opts = opts || {};
  var el = document.createElement('div');
  el.className = 'pwa-toast' + (opts.kind ? ' ' + opts.kind : '');
  el.innerHTML = '<span>' + msg + '</span>';
  if (opts.action) {
    var b = document.createElement('button');
    b.className = 't-act';
    b.textContent = opts.action;
    b.onclick = function () { try { opts.onAction && opts.onAction(); } catch (e) {} close(); };
    el.appendChild(b);
  }
  toastHost().appendChild(el);
  requestAnimationFrame(function () { el.classList.add('in'); });
  var timer = setTimeout(close, opts.duration || (opts.action ? 9000 : 3200));
  function close() {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(function () { el.remove(); }, 340);
  }
  return close;
}

/* ------------------------------------------------------- ALT SAYFA ------ */
var openSheets = [];
function sheet(title, subtitle, buildBody) {
  /* Aynı panel zaten açıksa ikinci dokunuş onu KAPATIR — üst üste kopya
     açılmasını engeller (ayar düğmesindeki davranışın aynısı). */
  for (var i = openSheets.length - 1; i >= 0; i--) {
    if (openSheets[i].title === title) { openSheets[i].close(); return null; }
  }

  var back = document.createElement('div');
  back.className = 'pwa-sheet-backdrop';
  var box = document.createElement('div');
  box.className = 'pwa-sheet';
  box.setAttribute('role', 'dialog');
  box.innerHTML = '<div class="grab"></div>' +
                  '<button type="button" class="pwa-sheet-x" aria-label="Kapat">✕</button>' +
                  '<h3>' + title + '</h3>' +
                  (subtitle ? '<p class="sheet-sub">' + subtitle + '</p>' : '');
  var body = document.createElement('div');
  box.appendChild(body);
  document.body.appendChild(back);
  document.body.appendChild(box);

  requestAnimationFrame(function () { back.classList.add('in'); box.classList.add('in'); });
  back.onclick = function () { api.close(); };

  /* aşağı sürükleyerek kapatma */
  var y0 = null;
  box.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchmove', function (e) {
    if (y0 === null || box.scrollTop > 0) return;
    var dy = e.touches[0].clientY - y0;
    if (dy > 0) box.style.transform = 'translateY(' + dy + 'px)';
  }, { passive: true });
  box.addEventListener('touchend', function (e) {
    var dy = e.changedTouches[0].clientY - (y0 || 0);
    box.style.transform = '';
    y0 = null;
    if (dy > 110) api.close();
  });

  var api = {
    body: body,
    close: function () {
      var i = openSheets.indexOf(api);
      if (i > -1) openSheets.splice(i, 1);
      if (settingsOpen === api) settingsOpen = null;
      back.classList.remove('in'); box.classList.remove('in');
      setTimeout(function () { back.remove(); box.remove(); }, 380);
    }
  };
  openSheets.push(api);
  var xBtn = qs('.pwa-sheet-x', box);
  if (xBtn) xBtn.onclick = function (e) { e.stopPropagation(); api.close(); };
  api.title = title;
  pushGuard();
  /* İçerik, api hazır olduktan SONRA kuruluyor: aksi hâlde geri çağrıya
     gönderilen api tanımsız oluyordu (var hoisting). */
  try { buildBody(body, api); } catch (e) { logError(e); }
  return api;
}
function row(icon, title, desc, right) {
  var d = document.createElement('div');
  d.className = 'pwa-row';
  d.innerHTML = '<div class="ic">' + icon + '</div><div class="tx"><b>' + title + '</b>' +
                (desc ? '<span>' + desc + '</span>' : '') + '</div>';
  if (right) d.insertAdjacentHTML('beforeend', right);
  return d;
}

/* ============================================== 1 · SERVICE WORKER ======= */
var swReg = null, waitingWorker = null;

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then(function (reg) {
      swReg = reg;

      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
        });
      });

      /* Otomatik güncelleme kontrolü: açılışta, saatte bir ve öne gelince.
         NOT: reg.update() bir söz (promise) döndürür; try/catch onun
         REDDİNİ yakalamaz. Yakalanmadığında "sw.js load failed" hatası
         raporlara düşüyordu — özellikle iOS'ta Chrome gibi Service Worker
         desteği sınırlı tarayıcılarda ve anlık ağ kesintilerinde. */
      var quietUpdate = function () {
        try {
          var pr = reg.update();
          if (pr && pr.catch) pr.catch(function () {});   /* sessizce geç */
        } catch (e) {}
      };
      setTimeout(quietUpdate, 8000);
      setInterval(quietUpdate, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) quietUpdate();
      });

      registerPeriodicSync(reg);
    })
    .catch(function (err) {
      /* Bazı tarayıcılar (ör. iOS'ta Chrome) Service Worker'ı desteklemez.
         Uygulama bu durumda da tam çalışır; yalnızca çevrimdışı kullanım ve
         bildirimler devre dışı kalır. Hata raporuna yazmıyoruz. */
      console.warn('[PWA] Service Worker kullanılamıyor:', err && err.message);
    });

  /* Service Worker el değiştirdiğinde sayfa yenilenir — ama OTURUMDA EN
     FAZLA BİR KEZ. Bu kilit olmadan, worker her devraldığında sayfa
     yenileniyor, yenilenen sayfa worker'ı yeniden kuruyor ve döngü
     sürüyordu; site birkaç saniyede bir kendini baştan yüklüyordu. */
  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing) return;
    try {
      if (sessionStorage.getItem('lumira_sw_reloaded')) return;
      sessionStorage.setItem('lumira_sw_reloaded', '1');
    } catch (e) {}
    refreshing = true;
    location.reload();
  });

  navigator.serviceWorker.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.type === 'CACHE_PROGRESS') onCacheProgress(d.done, d.total);
    if (d.type === 'CACHE_DONE')     onCacheDone();
    if (d.type === 'NOTIFICATION_OPEN') route(new URL(d.url, location.href).searchParams, true);
    if (d.type === 'BACK_ONLINE')    refreshOnlineState();
  });
}

function offerUpdate(worker) {
  waitingWorker = worker;
  toast('✨ Yeni sürüm hazır', {
    action: 'Güncelle',
    duration: 14000,
    onAction: function () {
      try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) { location.reload(); }
    }
  });
}

/* ================================ 2 · TAM EKRAN / DURUM ÇUBUĞU =========== */
var isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
                   (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) ||
                   navigator.standalone === true ||
                   /android-app:\/\//.test(document.referrer);

/* Play Store (TWA) üzerinden mi açıldı? Üç bağımsız sinyal kontrol edilir,
   biri bile true ise TWA sayılır — hiçbiri tek başına %100 güvenilir değil:
   1) 'android-app://' referrer — bazı Android/Chrome sürümlerinde (özellikle
      uygulama simgesinden soğuk başlatmada) hiç set edilmiyor, bilinen sorun.
   2) '?src=twa' — twa-manifest.json'daki startUrl'e bağlı, PWABuilder formunda
      doğru girilmemişse eksik kalabilir.
   3) getDigitalGoodsService — EN GÜVENİLİR sinyal: bu API sadece gerçek,
      Play Billing'e bağlı bir TWA içinde var olur, sıradan tarayıcı
      sekmelerinde asla bulunmaz. */
var isTwa = /android-app:\/\//.test(document.referrer) ||
            /(^|[?&])src=twa(&|$)/.test(location.search) ||
            (typeof window.getDigitalGoodsService === 'function') ||
            store('pwa_src_twa') === true;
if (/(^|[?&])src=twa(&|$)/.test(location.search)) { try { store('pwa_src_twa', true); } catch (e) {} }

function setupShell() {
  document.documentElement.classList.toggle('pwa-standalone', isStandalone);

  /* Durum çubuğu / gezinme çubuğu rengi — splash koyu, uygulama koyu */
  setThemeColor('#04050a');

  /* Yakınlaştırma artık viewport meta etiketiyle kilitli.
     gesturestart engellenmiyor: engellendiğinde, sayfa bir şekilde büyüdüğünde
     kullanıcı parmakla GERİ KÜÇÜLTEMİYORDU. */

  /* Standalone modda dış bağlantılar tarayıcıda açılsın (uygulamadan çıkmasın) */
  if (isStandalone) {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="http"]') : null;
      if (!a) return;
      if (a.host === location.host) return;
      e.preventDefault();
      window.open(a.href, '_blank', 'noopener');
    });
  }

  /* Çevrimdışı rozeti.
     navigator.onLine tek başına güvenilmez: iOS'ta uygulama modunda açılışta
     kısa süre "false" dönebiliyor ve sonra 'online' olayı hiç gelmediği için
     rozet çevrimiçiyken de asılı kalıyordu. Bu yüzden durum, sunucuya küçük
     bir istek atılarak GERÇEKTEN doğrulanıyor. */
  var badge = document.createElement('div');
  badge.id = 'pwa-offline';
  badge.textContent = '● ÇEVRİMDIŞI — kayıtlı kartlar açık';
  document.body.appendChild(badge);

  addEventListener('online', function () { refreshOnlineState(); });
  addEventListener('offline', function () { refreshOnlineState(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshOnlineState();
  });
  /* Açılışta bir an bekle: ilk saniyede yanlış "çevrimdışı" göstermesin */
  setTimeout(refreshOnlineState, 1500);
  setInterval(function () { if (wasOffline) refreshOnlineState(); }, 20000);
}

/* Service Worker araya girmesin diye adrese __ping ekleniyor;
   sw.js bu istekleri doğrudan ağa bırakır. */
var wasOffline = false;
var probing = false;
function probeConnection(cb) {
  if (probing) return;
  probing = true;
  var done = false;
  var finish = function (ok) {
    if (done) return;
    done = true; probing = false;
    cb(ok);
  };
  var t = setTimeout(function () { finish(false); }, 5000);
  try {
    fetch('./favicon-16.png?__ping=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { clearTimeout(t); finish(!!(r && (r.ok || r.type === 'opaque'))); })
      .catch(function () { clearTimeout(t); finish(false); });
  } catch (e) { clearTimeout(t); finish(false); }
}
function refreshOnlineState() {
  probeConnection(function (ok) {
    /* Rozet YALNIZCA iki kanıt birden varken çıkar:
       hem tarayıcı "bağlantı yok" diyecek, hem de sunucuya atılan istek
       başarısız olacak. Tek başına navigator.onLine iOS'ta yanılıyor. */
    var offline = (ok === false) && (navigator.onLine === false);
    setOffline(offline);
    if (!offline && wasOffline) toast('🌐 Bağlantı geri geldi', { kind: 'good' });
    wasOffline = offline;
  });
}
function setOffline(on) {
  var b = $('pwa-offline');
  if (b) b.classList.toggle('in', !!on);
}
function setThemeColor(hex) {
  var m = qs('meta[name="theme-color"]:not([media])');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.setAttribute('content', hex);
}

/* ================================== 3 · ANDROID GERİ TUŞU ================ */
var lastBack = 0;
function pushGuard() {
  try { history.pushState({ pwaGuard: Date.now() }, ''); } catch (e) {}
}
function setupBackButton() {
  try {
    history.replaceState({ pwaRoot: true }, '');
    history.pushState({ pwaGuard: 0 }, '');
  } catch (e) {}

  addEventListener('popstate', function () {
    /* 1) Açık bir alt sayfa varsa onu kapat */
    if (openSheets.length) {
      openSheets[openSheets.length - 1].close();
      pushGuard();
      return;
    }
    /* 2) Kategori paneli açıksa kapat */
    var cat = $('catOverlay');
    if (cat && getComputedStyle(cat).display !== 'none' && cat.classList.contains('show')) {
      var cc = $('catClose'); if (cc) cc.click(); else cat.classList.remove('show');
      pushGuard();
      return;
    }
    if (cat && cat.classList.contains('open')) {
      var cc2 = $('catClose'); if (cc2) cc2.click();
      pushGuard();
      return;
    }
    /* 3) Hata listesi / sonuç ekranı açıksa kartlara dön */
    var mv = $('mistakesView');
    if (mv && mv.style.display === 'block') {
      var back = $('backToQuizBtn') || $('backBtn');
      if (back) back.click(); else mv.style.display = 'none';
      pushGuard();
      return;
    }
    /* 4) Kartlar sekmesinde değilsek oraya dön */
    var tc = $('tabCards');
    if (tc && !tc.classList.contains('active')) {
      tc.click();
      pushGuard();
      return;
    }
    /* 5) Kök ekrandayız: çıkmak için iki kez */
    var now = Date.now();
    if (now - lastBack < 2200) {
      history.back();               /* kök state tüketilir → uygulama kapanır */
      return;
    }
    lastBack = now;
    vibrate(18);
    toast('Çıkmak için geri tuşuna tekrar bas');
    pushGuard();
  });

  /* Sekme/panel değişimlerinde geçmişe kayıt ekle */
  ['tabQuiz', 'tabPersonal', 'catTrigger'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { pushGuard(); }, true);
  });
}

/* ============================ 4 · DEEP LINK · KISAYOL · PAYLAŞIM ========= */
function dismissSplash(cb) {
  var sp = $('splash');
  if (!sp || sp.classList.contains('hidden')) { cb && cb(); return; }
  sp.click();
  setTimeout(function () { cb && cb(); }, 700);
}

function route(params, force) {
  if (!params) return;
  var tab   = params.get('tab');
  var lang  = params.get('lang');
  var level = params.get('level');
  var act   = params.get('action');
  var src   = params.get('src');
  var shared = params.get('share_text') || params.get('share_title') || params.get('share_url');

  var needsApp = tab || lang || level || act || shared || src === 'shortcut' ||
                 src === 'notification' || src === 'push' || src === 'reminder' || force;
  if (!needsApp) return;

  dismissSplash(function () {
    if (lang) {
      var lo = qs('.lang-opt[data-lang="' + lang.toLowerCase() + '"]');
      if (lo) lo.click();     /* sözlük hazır değilse setupLazyVocab devralır */
    }
    if (level) {
      var lv = Array.prototype.slice.call(document.querySelectorAll('.level-opt'))
        .filter(function (e) { return e.textContent.trim().toUpperCase() === level.toUpperCase(); })[0];
      if (lv) lv.click();
    }
    if (tab === 'quiz' && $('tabQuiz')) $('tabQuiz').click();
    else if ((tab === 'personal' || tab === 'profile') && $('tabPersonal')) $('tabPersonal').click();
    else if (tab === 'cards' && $('tabCards')) $('tabCards').click();

    if (act === 'daily') setTimeout(showDailyWord, 450);
    if (act === 'favorites') setTimeout(openFavorites, 450);
    if (act === 'settings') setTimeout(openSettings, 450);

    if (shared) {
      var txt = (params.get('share_text') || '') + ' ' + (params.get('share_title') || '');
      handleSharedText(txt.trim());
    }

    /* URL'i temizle ki yenilemede tekrar tetiklenmesin */
    try { history.replaceState(history.state, '', location.pathname); } catch (e) {}
  });
}

function handleSharedText(txt) {
  if (!txt) return;
  var word = txt.split(/\s+/).slice(0, 3).join(' ');
  sheet('📥 Paylaşılan metin', 'Başka bir uygulamadan gönderdiğin içerik:', function (b) {
    var box = document.createElement('div');
    box.className = 'pwa-row';
    box.innerHTML = '<div class="ic">📝</div><div class="tx"><b>' + escapeHtml(word) + '</b><span>' +
                    escapeHtml(txt.slice(0, 140)) + '</span></div>';
    b.appendChild(box);
    var save = row('⭐', 'Favorilere ekle', 'Kendi kelime listene kaydet');
    save.onclick = function () {
      if (window.LUMIRA_LOCK && !window.LUMIRA_LOCK.anyBadge('Favorilere ekleme')) return;
      addFavorite({ w: word, tr: txt.slice(0, 120), lang: activeLangCode(), pos: 'not' });
      toast('⭐ Favorilere eklendi', { kind: 'good' });
    };
    b.appendChild(save);
    var copy = row('📋', 'Panoya kopyala', '');
    copy.onclick = function () { copyText(txt); };
    b.appendChild(copy);
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}

/* ==================================== 5 · KURULUM (INSTALL) ============== */
var deferredPrompt = null;

function setupInstall() {
  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var seen = store('pwa_install_dismissed');
    var opens = (store('pwa_opens') || 0);
    if (!isStandalone && !isTwa && !seen && opens >= 2) setTimeout(showInstallBanner, 2500);
  });

  addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hideInstallBanner();
    store('pwa_installed', true);
    toast('🎉 Uygulama ana ekranına eklendi!', { kind: 'good' });
  });

  /* iOS: beforeinstallprompt yok → yönergeli rehber */
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !isStandalone && !isTwa && !store('pwa_ios_hint') && (store('pwa_opens') || 0) >= 2) {
    setTimeout(function () { store('pwa_ios_hint', true); iosInstallGuide(); }, 4000);
  }
}

function showInstallBanner() {
  if ($('pwa-install') || !deferredPrompt) return;
  var el = document.createElement('div');
  el.id = 'pwa-install';
  el.innerHTML =
    '<img src="icon-192.png" alt="">' +
    '<div class="txt"><b>Ana ekrana ekle</b><span>Tam ekran, çevrimdışı ve daha hızlı</span></div>' +
    '<button class="go">Yükle</button><button class="x" aria-label="Kapat">✕</button>';
  document.body.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('in'); });
  qs('.go', el).onclick = function () { doInstall(); };
  qs('.x', el).onclick = function () {
    store('pwa_install_dismissed', Date.now());
    hideInstallBanner();
  };
}
function hideInstallBanner() {
  var el = $('pwa-install');
  if (!el) return;
  el.classList.remove('in');
  setTimeout(function () { el.remove(); }, 460);
}
function doInstall() {
  if (!deferredPrompt) { iosInstallGuide(); return; }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function (c) {
    if (c && c.outcome === 'accepted') toast('Kuruluyor…', { kind: 'good' });
    deferredPrompt = null;
    hideInstallBanner();
  }).catch(function () {});
}
function iosInstallGuide() {
  sheet('📲 Ana ekrana ekle', 'Uygulamayı tam ekran ve çevrimdışı kullanmak için:', function (b) {
    [['1️⃣', 'Safari\'de paylaş simgesine dokun', 'Alt çubuktaki ⬆️ simgesi'],
     ['2️⃣', '"Ana Ekrana Ekle"yi seç', 'Listede aşağı kaydırman gerekebilir'],
     ['3️⃣', '"Ekle"ye dokun', 'Uygulama ana ekranında belirir']]
      .forEach(function (r) { b.appendChild(row(r[0], r[1], r[2])); });
    b.insertAdjacentHTML('beforeend',
      '<p class="pwa-note">Not: iOS\'ta bu adım yalnızca Safari üzerinden çalışır. ' +
      'Ekledikten sonra bildirimler de (iOS 16.4+) etkinleştirilebilir.</p>');
  });
}

/* ===================================== 6 · BİLDİRİMLER ================== */
function notifyState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
function askNotifyPermission() {
  return new Promise(function (resolve) {
    if (!('Notification' in window)) { resolve('unsupported'); return; }
    if (Notification.permission !== 'default') { resolve(Notification.permission); return; }
    Notification.requestPermission().then(resolve).catch(function () { resolve('denied'); });
  });
}
function showNotification(title, body, url) {
  var payload = { title: title, body: body, url: url || './?src=notification', tag: 'lumira-local' };
  if (swReg && swReg.active) {
    try { swReg.active.postMessage({ type: 'SHOW_NOTIFICATION', payload: payload }); return true; } catch (e) {}
  }
  if (swReg && swReg.showNotification) {
    try { swReg.showNotification(title, { body: body, icon: './icon-192.png', badge: './icon-96.png', data: { url: payload.url } }); return true; } catch (e) {}
  }
  try { new Notification(title, { body: body, icon: './icon-192.png' }); return true; } catch (e) {}
  return false;
}

/* --- Günlük hatırlatma: uygulama açıkken zamanlayıcı, kapalıyken periodicSync */
var reminderTimer = null;
function reminderSettings() {
  return store('pwa_reminder') || { on: false, hour: CONFIG.reminderHour, min: CONFIG.reminderMin };
}
function saveReminder(s) { store('pwa_reminder', s); scheduleReminder(); }

function scheduleReminder() {
  clearTimeout(reminderTimer);
  var s = reminderSettings();
  if (!s.on || notifyState() !== 'granted') return;

  var now = new Date();
  var next = new Date();
  next.setHours(s.hour, s.min, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  /* Uygulama açılırken bugünün saati geçmişse ve hiç gösterilmediyse hemen göster */
  var last = store('pwa_reminder_last');
  var passed = new Date(); passed.setHours(s.hour, s.min, 0, 0);
  if (now >= passed && last !== today() && !studiedToday()) {
    fireReminder();
  }

  var ms = next - now;
  if (ms < 2147483647) {
    reminderTimer = setTimeout(function () { fireReminder(); scheduleReminder(); }, ms);
  }
}
function fireReminder() {
  if (studiedToday()) return;
  store('pwa_reminder_last', today());
  var w = pickDailyWord();
  showNotification(
    'Bugün birkaç kelime? 🌙',
    w ? (w.w + ' — ' + (w.tr || '') + '  ·  serini bozma!') : 'Serini bozma, 5 dakika yeter.',
    './?src=reminder&tab=cards'
  );
}
function studiedToday() {
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf('meta') === -1 && k.indexOf('progress') === -1) continue;
      var v = JSON.parse(localStorage.getItem(k) || 'null');
      if (v && v.todayDate === today() && v.todayCount > 0) return true;
    }
  } catch (e) {}
  return false;
}
function registerPeriodicSync(reg) {
  if (!('periodicSync' in reg)) return;
  navigator.permissions && navigator.permissions.query({ name: 'periodic-background-sync' })
    .then(function (st) {
      if (st.state !== 'granted') return;
      reg.periodicSync.register('daily-reminder', { minInterval: 12 * 60 * 60 * 1000 })
        .catch(function () {});
    }).catch(function () {});
}

/* --- Push aboneliği (sunucu tarafı VAPID anahtarı verilirse) -------------- */
function subscribePush() {
  if (!swReg || !swReg.pushManager || !CONFIG.vapidKey) return Promise.resolve(null);
  return swReg.pushManager.getSubscription().then(function (sub) {
    if (sub) return sub;
    return swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64(CONFIG.vapidKey)
    });
  }).then(function (sub) {
    if (sub && CONFIG.pushEndpoint) {
      fetch(CONFIG.pushEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      }).catch(function () {});
    }
    return sub;
  }).catch(function () { return null; });
}
function urlB64(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(b64), arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

/* ================================ 7 · ÇEVRİMDIŞI PAKET ================== */
var cacheBar = null;
function downloadOfflinePack() {
  if (!swReg || !swReg.active) { toast('Service Worker henüz hazır değil', { kind: 'bad' }); return; }
  if (!navigator.onLine) { toast('İndirmek için internet gerekli', { kind: 'bad' }); return; }
  swReg.active.postMessage({ type: 'CACHE_ALL' });
  toast('📦 Sözlükler indiriliyor…');
}
function onCacheProgress(done, total) {
  if (cacheBar) cacheBar.style.width = Math.round(done / total * 100) + '%';
}
function onCacheDone() {
  if (cacheBar) cacheBar.style.width = '100%';
  store('pwa_offline_pack', today());
  toast('✅ Çevrimdışı paket hazır — internet olmadan da çalışır', { kind: 'good', duration: 5000 });
}
function estimateStorage() {
  if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
  return navigator.storage.estimate().then(function (e) {
    return { used: e.usage || 0, quota: e.quota || 0 };
  }).catch(function () { return null; });
}
function mb(n) { return (n / 1048576).toFixed(1) + ' MB'; }

/* ======================================== 8 · FAVORİLER ================= */
var FAV_KEY = 'lumira_favs_v1';
function favs() { return store(FAV_KEY) || []; }
function favKey(o) { return (o.lang || '') + '|' + (o.w || ''); }
function isFav(o) { return favs().some(function (f) { return favKey(f) === favKey(o); }); }
function addFavorite(o) {
  var list = favs();
  if (list.some(function (f) { return favKey(f) === favKey(o); })) return false;
  o.at = Date.now();
  list.unshift(o);
  store(FAV_KEY, list.slice(0, 500));
  return true;
}
function removeFavorite(o) {
  store(FAV_KEY, favs().filter(function (f) { return favKey(f) !== favKey(o); }));
}
function activeLangCode() {
  var el = qs('.lang-opt.active');
  return el ? el.getAttribute('data-lang') : 'de';
}
function currentCard() {
  var w = $('frontWord'), tr = $('trWord'), pos = $('frontPos');
  if (!w || !w.textContent.trim()) return null;
  return {
    w: w.textContent.trim(),
    tr: tr ? tr.textContent.trim() : '',
    pos: pos ? pos.textContent.trim() : '',
    lang: activeLangCode()
  };
}
function setupFavButton() {
  var card = $('card');
  if (!card || $('favBtn')) return;
  var btn = document.createElement('div');
  btn.id = 'favBtn';
  btn.title = 'Favorilere ekle';
  btn.textContent = '☆';
  var stage = card.parentElement;
  if (stage) { stage.style.position = stage.style.position || 'relative'; stage.appendChild(btn); }

  btn.onclick = function (e) {
    e.stopPropagation();
    var c = currentCard();
    if (!c) return;
    if (isFav(c)) { removeFavorite(c); toast('Favorilerden çıkarıldı'); }
    else {
      if (window.LUMIRA_LOCK && !window.LUMIRA_LOCK.anyBadge('Favorilere ekleme')) return;
      addFavorite(c); vibrate(24); toast('⭐ ' + c.w + ' favorilere eklendi', { kind: 'good' });
    }
    syncFavButton();
  };

  var mo = new MutationObserver(syncFavButton);
  try { mo.observe($('frontWord'), { childList: true, characterData: true, subtree: true }); } catch (e) {}
  syncFavButton();
}
function syncFavButton() {
  var btn = $('favBtn'); if (!btn) return;
  var c = currentCard(); if (!c) return;
  var on = isFav(c);
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('on', on);
}
function openFavorites() {
  sheet('⭐ Favorilerim', 'Kaydettiğin kelimeler cihazında saklanır.', function (b) {
    var list = favs();
    if (!list.length) {
      b.innerHTML = '<div class="pwa-empty">Henüz favori yok.<br>Kartın sağ üstündeki ☆ ile ekleyebilirsin.</div>';
      return;
    }
    var flags = { de: '🇩🇪', en: '🇬🇧', ar: '🇸🇦', fr: '🇫🇷', es: '🇪🇸', ru: '🇷🇺' };
    list.forEach(function (f) {
      var it = document.createElement('div');
      it.className = 'fav-item';
      it.innerHTML = '<div class="fl">' + (flags[f.lang] || '🏳️') + '</div>' +
        '<div class="w"><b>' + escapeHtml(f.w) + '</b><span>' + escapeHtml(f.tr || '') + '</span></div>' +
        '<button class="rm" aria-label="Sil">✕</button>';
      qs('.rm', it).onclick = function () { removeFavorite(f); it.remove(); syncFavButton(); };
      b.appendChild(it);
    });
    var exp = row('📤', 'Favorileri paylaş / indir', list.length + ' kelime');
    exp.onclick = function () { exportFavorites(); };
    b.appendChild(exp);
  });
}
function exportFavorites() {
  var list = favs();
  var txt = list.map(function (f) { return f.w + ' — ' + (f.tr || ''); }).join('\n');
  var content = 'Lumira · Dil Kartları — Favorilerim (' + today() + ')\n\n' + txt;
  shareOrSave('favorilerim-' + today() + '.txt', content, 'text/plain', 'Favori kelimelerim');
}

/* ================== 9 · DOSYA İNDİRME · PAYLAŞMA ======================== */
function saveFile(filename, content, mime) {
  try {
    var blob = (content instanceof Blob) ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('⬇️ ' + filename + ' indirildi', { kind: 'good' });
    return true;
  } catch (e) { logError(e); toast('İndirme başarısız', { kind: 'bad' }); return false; }
}
function shareOrSave(filename, content, mime, title) {
  var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  var file = null;
  try { file = new File([blob], filename, { type: blob.type }); } catch (e) {}
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: title || filename })
      .catch(function () { saveFile(filename, blob); });
    return;
  }
  saveFile(filename, blob);
}
function shareApp() {
  var PLAY_URL = CONFIG.playUrl || ('https://play.google.com/store/apps/details?id=' + CONFIG.packageId);
  var shareUrl = isTwa ? PLAY_URL : (location.origin + location.pathname);
  var data = {
    title: CONFIG.brand + ' · ' + CONFIG.appName,
    text: '6 dilde kelime kartları, quiz ve seslendirme — çevrimdışı da çalışıyor 🌙',
    url: shareUrl
  };
  if (navigator.share) {
    navigator.share(data).catch(function () {});
  } else {
    copyText(data.text + ' ' + data.url);
  }
}
function copyText(t) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(t)
      .then(function () { toast('📋 Panoya kopyalandı', { kind: 'good' }); })
      .catch(function () { toast('Kopyalanamadı', { kind: 'bad' }); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('📋 Panoya kopyalandı', { kind: 'good' }); } catch (e) {}
    ta.remove();
  }
}
function exportAllData() {
  var dump = { app: CONFIG.brand, exportedAt: new Date().toISOString(), data: {} };
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      dump.data[k] = localStorage.getItem(k);
    }
  } catch (e) {}
  shareOrSave('dil-kartlari-yedek-' + today() + '.json',
    JSON.stringify(dump, null, 2), 'application/json', 'İlerleme yedeğim');
}
function importData() {
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = function () {
    var f = inp.files && inp.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var j = JSON.parse(fr.result);
        var d = j.data || j;
        Object.keys(d).forEach(function (k) { localStorage.setItem(k, d[k]); });
        toast('✅ Yedek geri yüklendi, yenileniyor…', { kind: 'good' });
        setTimeout(function () { location.reload(); }, 1200);
      } catch (e) { toast('Dosya okunamadı', { kind: 'bad' }); }
    };
    fr.readAsText(f);
  };
  inp.click();
}

/* ================================ 10 · HATA RAPORU ====================== */
var ERR_KEY = 'lumira_errors_v1';
/* Kullanıcı için anlamı olmayan, uygulamayı etkilemeyen bilinen mesajlar.
   Bunlar rapora yazılmaz; yoksa liste gerçek hataları gizleyen gürültüyle
   dolar. */
var IGNORED_ERRORS = [
  'sw.js load failed',
  'ServiceWorker script',
  'The operation is insecure',
  'disconnect',
  'ResizeObserver loop',
  /* Firebase SDK'nın dahili IndexedDB kalıcılık katmanından gelen, zararsız
     ve geçici bir yarış-durumu hatası. İşlevselliği etkilemez (Firebase
     otomatik olarak yeniden dener); hata raporlarını kirletmesin. */
  'Attempt to get records from database without an in-progress transaction'
];
function isNoise(msg) {
  msg = String(msg || '');
  for (var i = 0; i < IGNORED_ERRORS.length; i++) {
    if (msg.indexOf(IGNORED_ERRORS[i]) > -1) return true;
  }
  return false;
}

function logError(err, extra) {
  try {
    if (isNoise(err && (err.message || err.reason || err))) return;
    var list = store(ERR_KEY) || [];
    list.unshift({
      t: new Date().toISOString(),
      m: (err && (err.message || err.reason || err)) + '',
      s: (err && err.stack ? String(err.stack).slice(0, 900) : ''),
      u: location.href, ua: navigator.userAgent, extra: extra || null
    });
    store(ERR_KEY, list.slice(0, 40));
    if (CONFIG.errorEndpoint) {
      var body = JSON.stringify(list[0]);
      if (navigator.sendBeacon) navigator.sendBeacon(CONFIG.errorEndpoint, body);
      else fetch(CONFIG.errorEndpoint, { method: 'POST', body: body, keepalive: true }).catch(function () {});
    }
  } catch (e) {}
}
function setupErrorReporting() {
  addEventListener('error', function (e) {
    if (e && e.message) logError({ message: e.message, stack: (e.filename || '') + ':' + (e.lineno || '') });
  });
  addEventListener('unhandledrejection', function (e) { logError({ message: 'Promise: ' + (e.reason && e.reason.message || e.reason) }); });
}
function openErrorReport() {
  var list = store(ERR_KEY) || [];
  sheet('🐞 Hata raporu', list.length ? (list.length + ' kayıt bulundu.') : 'Kayıtlı hata yok — her şey yolunda.', function (b) {
    if (!list.length) {
      b.innerHTML = '<div class="pwa-empty">🎉 Hiç hata kaydedilmemiş.</div>';
    } else {
      list.slice(0, 8).forEach(function (e) {
        b.appendChild(row('•', escapeHtml((e.m || '').slice(0, 60)), new Date(e.t).toLocaleString('tr-TR')));
      });
    }
    var snd = row('📤', 'Raporu paylaş / indir', 'Cihaz bilgisi + son hatalar');
    snd.onclick = function () {
      shareOrSave('hata-raporu-' + today() + '.json',
        JSON.stringify({ app: CONFIG.brand, ua: navigator.userAgent, errors: list }, null, 2),
        'application/json', 'Hata raporu');
    };
    b.appendChild(snd);
    var clr = row('🧹', 'Kayıtları temizle', '');
    clr.onclick = function () { store(ERR_KEY, []); toast('Temizlendi'); };
    b.appendChild(clr);
  });
}

/* ================================ 11 · PUANLAMA İSTEĞİ ================== */
function maybeAskRating() {
  if (store('pwa_rated') || store('pwa_rate_never')) return;
  var opens = store('pwa_opens') || 0;
  var first = store('pwa_first_open') || Date.now();
  var days = (Date.now() - first) / 86400000;
  var snoozed = store('pwa_rate_snooze') || 0;
  if (opens < 6 || days < 2 || Date.now() - snoozed < 7 * 86400000) return;

  setTimeout(function () {
    sheet('⭐ Beğendin mi?', 'Uygulamayı puanlaman bize çok yardımcı olur.', function (b) {
      var yes = row('💛', 'Play Store\'da puan ver', '30 saniye sürer');
      yes.onclick = function () {
        store('pwa_rated', true);
        try { location.href = 'market://details?id=' + CONFIG.packageId; } catch (e) {}
        setTimeout(function () { window.open(CONFIG.playUrl, '_blank', 'noopener'); }, 700);
      };
      var later = row('⏰', 'Sonra hatırlat', '1 hafta sonra tekrar sorulur');
      later.onclick = function () { store('pwa_rate_snooze', Date.now()); openSheets[openSheets.length - 1].close(); };
      var never = row('🚫', 'Bir daha sorma', '');
      never.onclick = function () { store('pwa_rate_never', true); openSheets[openSheets.length - 1].close(); };
      b.appendChild(yes); b.appendChild(later); b.appendChild(never);
    });
  }, 3000);
}

/* ================================ 12 · GEÇİŞLER · DEVAM ================= */
function setupTransitions() {
  ['tabCards', 'tabQuiz', 'tabPersonal'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('click', function () {
      var app = qs('.app');
      if (!app) return;
      if (document.startViewTransition) {
        try { document.startViewTransition(function () {}); return; } catch (e) {}
      }
      var view = $('cardsView');
      var target = id === 'tabQuiz' ? $('quizView') : (id === 'tabPersonal' ? $('personalView') : view);
      if (target) {
        target.classList.remove('pwa-fade-in');
        void target.offsetWidth;
        target.classList.add('pwa-fade-in');
      }
    });
  });
}

var RESUME_KEY = 'lumira_resume_v1';
function saveResume() {
  var tab = $('tabQuiz') && $('tabQuiz').classList.contains('active') ? 'quiz'
          : ($('tabPersonal') && $('tabPersonal').classList.contains('active') ? 'personal' : 'cards');
  var lvEl = qs('.level-opt.active');
  var card = currentCard();
  var deck = G('deck');
  var idx = G('idx');
  if (!card) return;
  store(RESUME_KEY, {
    tab: tab,
    lang: activeLangCode(),
    level: lvEl ? lvEl.textContent.trim() : null,
    cat: ($('cardCat') ? $('cardCat').textContent.trim() : null),
    idx: (typeof idx === 'number' ? idx : 0),
    total: (deck && deck.length) || 0,
    word: card.w || null,
    at: Date.now()
  });
}

/* Kart sırasını gerçekten geri yükler: idx'i yazar ve kartı yeniden çizer. */
function applyResume(r) {
  var deck = G('deck');
  var render = G('renderCard');
  if (!deck || !deck.length || typeof render !== 'function') return false;

  var target = -1;
  /* Önce kelimeyi ara (deste karıştırılmış olabilir), bulamazsan sırayı kullan */
  if (r.word) {
    for (var i = 0; i < deck.length; i++) {
      if (deck[i] && deck[i].w === r.word) { target = i; break; }
    }
  }
  if (target < 0 && typeof r.idx === 'number' && r.idx < deck.length) target = r.idx;
  if (target < 0) return false;

  setG('idx', target);
  setG('flipped', false);
  var cardEl = $('card');
  if (cardEl) cardEl.classList.remove('flipped');
  try { render(); } catch (e) { logError(e); return false; }
  try { var sc = G('saveCardPosition'); if (typeof sc === 'function') sc(); } catch (e) {}
  return true;
}

function offerResume() {
  var r = store(RESUME_KEY);
  if (!r || !r.at || !r.word) return;
  var params = new URLSearchParams(location.search);
  if (params.get('tab') || params.get('action')) return;   /* kısayolla açıldıysa karışmasın */
  if (Date.now() - r.at > 30 * 86400000) return;
  /* İlk karttaysa hatırlatmaya gerek yok */
  if (r.tab === 'cards' && (r.idx || 0) === 0) return;

  var pos = (typeof r.idx === 'number' && r.total) ? ' · ' + (r.idx + 1) + '/' + r.total : '';
  toast('📖 "' + escapeHtml(r.word) + '"' + pos + ' — kaldığın yerden devam?', {
    action: 'Devam',
    duration: 11000,
    onAction: function () {
      var lo = qs('.lang-opt[data-lang="' + r.lang + '"]');
      var switched = false;
      if (lo && !lo.classList.contains('active')) { lo.click(); switched = true; }
      if (r.level) {
        var lv = Array.prototype.slice.call(document.querySelectorAll('.level-opt'))
          .filter(function (e) { return e.textContent.trim() === r.level; })[0];
        if (lv && !lv.classList.contains('active')) { lv.click(); switched = true; }
      }
      if (r.tab === 'quiz' && $('tabQuiz')) { $('tabQuiz').click(); return; }
      if (r.tab === 'personal' && $('tabPersonal')) { $('tabPersonal').click(); return; }

      /* Dil/seviye değiştiyse deste yeniden kurulur — kısa bir nefes al */
      setTimeout(function () {
        if (applyResume(r)) toast('✅ ' + r.word + ' kartına dönüldü', { kind: 'good' });
        else toast('Bu kart artık listede yok', { kind: 'bad' });
      }, switched ? 420 : 60);
    }
  });
}

/* ======================== GÜNÜN KELİMESİ / WIDGET VERİSİ ================= */
function pickDailyWord() {
  try {
    var d = G('deck');
    if (d && d.length) {
      var seed = parseInt(today().replace(/-/g, ''), 10);
      return d[seed % d.length];
    }
    var f = favs();
    if (f.length) return f[0];
  } catch (e) {}
  return null;
}
function showDailyWord() {
  var w = pickDailyWord();
  sheet('🌙 Günün kelimesi', today(), function (b) {
    if (!w) {
      b.innerHTML = '<div class="pwa-empty">Kartlar henüz yüklenmedi. Birkaç saniye sonra tekrar dene.</div>';
      return;
    }
    var card = document.createElement('div');
    card.className = 'pwa-row';
    card.innerHTML = '<div class="ic">📘</div><div class="tx"><b style="font-size:19px">' +
      escapeHtml(w.w || '') + '</b><span style="font-size:13px">' + escapeHtml(w.tr || w.t || '') + '</span></div>';
    b.appendChild(card);

    var listen = row('🔊', 'Dinle', 'Telaffuzu seslendir');
    listen.onclick = function () {
      try {
        if (typeof window.speakNative === 'function') {
          var map = { de: 'de-DE', en: 'en-US', ar: 'ar-SA', fr: 'fr-FR', es: 'es-ES', ru: 'ru-RU' };
          window.speakNative(w.w, map[w.lang || activeLangCode()] || 'de-DE', 0.92, function () {});
        }
      } catch (e) { logError(e); }
    };
    b.appendChild(listen);

    var fav = row('⭐', 'Favorilere ekle', '');
    fav.onclick = function () { addFavorite({ w: w.w, tr: w.tr || '', lang: w.lang || activeLangCode() }); toast('⭐ Eklendi', { kind: 'good' }); };
    b.appendChild(fav);

    var sh = row('📤', 'Paylaş', 'Arkadaşına gönder');
    sh.onclick = function () {
      var txt = w.w + ' — ' + (w.tr || '') + '\n' + CONFIG.brand + ' · ' + CONFIG.appName;
      if (navigator.share) navigator.share({ text: txt, url: location.origin + location.pathname }).catch(function () {});
      else copyText(txt);
    };
    b.appendChild(sh);
  });
  updateWidgetData(w);
}
function updateWidgetData(w) {
  if (!w) return;
  store('lumira_daily_word', { date: today(), w: w.w, tr: w.tr || '', lang: w.lang || activeLangCode() });
  try {
    if ('widgets' in navigator) {
      /* Windows Widgets Board / desteklenen platformlar */
      navigator.widgets.updateByTag && navigator.widgets.updateByTag('daily-word', {
        template: 'daily-word', data: JSON.stringify({ word: w.w, translation: w.tr || '' })
      });
    }
  } catch (e) {}
}

/* Sözlüklerin ihtiyaç anında yüklenmesi artık index.html içinde
   (sürüm uyuşmazlığı yaşanmasın diye sözlük etiketleriyle aynı dosyada). */

/* ===================== OTOMATİK HAFİF MOD (lite) ======================== */
/* Zayıf cihazlarda arka plan bulanıklıkları, kelebekler ve film taneciği
   kare hızını yarıya düşürebiliyor. Cihaz gerçekten zorlanıyorsa bu süslemeler
   kapatılır — işlevsellik aynen kalır. */
function liteSetting() { return store('pwa_lite'); }   /* true / false / null(oto) */

function applyLite(on) {
  document.documentElement.classList.toggle('lite', !!on);
  if (on && typeof window.__snowStop === 'function') {
    try { window.__snowStop(); } catch (e) {}
  }
}

/* Hafif mod YALNIZCA kullanıcı ayarlardan açtığında devreye girer.
   Cihaz özelliklerine bakıp otomatik açma kaldırıldı. */
function initLite() {
  applyLite(liteSetting() === true);
}

/* ======================= HOŞ GELDİN KARTI ============================== */
/* Giriş yapmış kullanıcıya, açılış ekranı kapandıktan sonra kısa bir
   karşılama gösterir. Butonu yoktur: 2,6 saniye sonra kendiliğinden kaybolur
   ya da dokunulunca kapanır. Her açılışta DEĞİL — günün ilk girişinde veya
   son gösterimden en az 8 saat geçmişse. */
var WELCOME_KEY = 'lumira_welcome_v1';

function shouldShowWelcome() {
  try {
    var last = store(WELCOME_KEY) || 0;
    if (!last) return true;
    var now = Date.now();
    if (now - last >= 8 * 3600 * 1000) return true;      /* 8 saat geçtiyse */
    return new Date(last).toDateString() !== new Date(now).toDateString();
  } catch (e) { return false; }
}

function welcomeStats() {
  var out = { streak: 0, xp: 0, level: 1, goal: 0, done: 0 };
  try {
    if (typeof window.PR_getXp === 'function') out.xp = window.PR_getXp();
    if (typeof window.PR_getLevel === 'function') out.level = window.PR_getLevel();
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf('meta') === -1) continue;
      var v = JSON.parse(localStorage.getItem(k) || 'null');
      if (!v || typeof v !== 'object') continue;
      if (typeof v.streak === 'number') out.streak = Math.max(out.streak, v.streak);
      if (typeof v.dailyGoal === 'number') out.goal = Math.max(out.goal, v.dailyGoal);
      if (typeof v.todayCount === 'number') out.done = Math.max(out.done, v.todayCount);
    }
  } catch (e) {}
  return out;
}

function showWelcomeCard(name) {
  if (!name || $('lumira-welcome')) return;
  var st = welcomeStats();

  var lines = [];
  if (st.streak > 0) lines.push('🔥 <b>' + st.streak + ' günlük</b> serin devam ediyor');
  lines.push('⭐ Seviye <b>' + st.level + '</b> · ' + st.xp + ' XP');
  if (st.goal > 0) lines.push('📚 Bugünkü hedefin: <b>' + st.goal + '</b> kelime');

  var el = document.createElement('div');
  el.id = 'lumira-welcome';
  el.innerHTML =
    '<div class="wc-card">' +
      '<span class="wc-mark">🦋</span>' +
      '<div class="wc-hi">Hoş geldin,</div>' +
      '<div class="wc-name">' + escapeHtml(name) + '</div>' +
      '<div class="wc-lines">' + lines.map(function (l) {
        return '<div class="wc-line">' + l + '</div>';
      }).join('') + '</div>' +
      '<span class="wc-fly">🦋</span>' +
    '</div>';
  document.body.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('in'); });

  var closed = false;
  var close = function () {
    if (closed) return;
    closed = true;
    el.classList.remove('in');
    setTimeout(function () { el.remove(); }, 420);
  };
  el.addEventListener('click', close);
  setTimeout(close, 2600);
  store(WELCOME_KEY, Date.now());
}

function setupWelcome() {
  if (!shouldShowWelcome()) return;
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (tries > 40) { clearInterval(timer); return; }        /* ~20 sn sonra vazgeç */
    var sp = $('splash');
    if (sp && !sp.classList.contains('hidden')) return;       /* açılış ekranı hâlâ açık */
    var u = fbUser();
    if (!u) return;
    clearInterval(timer);
    setTimeout(function () {
      showWelcomeCard(u.displayName || (u.email || '').split('@')[0]);
    }, 500);
  }, 500);
}

/* ==================== PROFİL VE YÖNETİCİ BÖLÜMÜ ========================= */
/* Firebase'e doğrudan erişim (yüklenmediyse hepsi sessizce devre dışı kalır) */
function fbAuth() {
  try { return (window.firebase && firebase.apps.length) ? firebase.auth() : null; } catch (e) { return null; }
}
function fbDb() {
  try { return (window.firebase && firebase.apps.length) ? firebase.database() : null; } catch (e) { return null; }
}
function fbUser() {
  var a = fbAuth();
  return a ? a.currentUser : null;
}

/* Yönetici tanımı — UID artık istemcide SABİT DEĞİL.
   Yetki /admins/<uid> düğümünden okunur; gerçek koruma Firebase
   kurallarındadır. Bu yalnızca ARAYÜZ içindir (Admin Panel satırını
   göstermek/gizlemek). Yeni yönetici eklemek için: Firebase Console'da
   /admins/<yeni-uid> = true düğümünü ekle — kod değişmez. */
var _isAdmin = false;

/* Yönetici arayüzünü ANINDA ve güvenilir göstermek için sabit UID (1.7.4 gibi).
   Gerçek veritabanı güvenliği yine Firebase kurallarındaki /admins düğümüyle
   sağlanır; bu liste yalnızca arayüzün (admin panelinin) görünmesi içindir. */
var ADMIN_UIDS = ['49AyoEDRltPQ8NSzPU9y2fDtWDI2'];

function refreshAdminFlag(cb) {
  var u = fbUser();
  var d = (typeof fbDb === 'function') ? fbDb() : null;
  /* sabit listedeyse hemen yönetici say, DB'yi bekleme */
  if (u && ADMIN_UIDS.indexOf(u.uid) !== -1) { _isAdmin = true; if (cb) cb(true); return; }
  if (!u || !d) { _isAdmin = false; if (cb) cb(false); return; }
  d.ref('admins/' + u.uid).once('value').then(function (s) {
    _isAdmin = (s.val() === true);
    if (cb) cb(_isAdmin);
  }).catch(function () { _isAdmin = false; if (cb) cb(false); });
}

function isAdmin() {
  if (_isAdmin === true) return true;
  var u = fbUser();
  return !!(u && ADMIN_UIDS.indexOf(u.uid) !== -1);
}

/* Firebase hazır olunca oturum değişimlerini dinle, yönetici bayrağını tazele. */
(function attachAdminWatch() {
  var a = (typeof fbAuth === 'function') ? fbAuth() : null;
  if (!a) { setTimeout(attachAdminWatch, 800); return; }
  a.onAuthStateChanged(function () { refreshAdminFlag(); });
})();

function inputRow(label, type, value, placeholder) {
  var d = document.createElement('label');
  d.className = 'pwa-field';
  d.innerHTML = '<span>' + label + '</span>' +
    '<input class="pwa-input" type="' + type + '" ' +
    (value ? 'value="' + escapeHtml(value) + '" ' : '') +
    (placeholder ? 'placeholder="' + escapeHtml(placeholder) + '" ' : '') +
    'autocomplete="off" autocapitalize="off" spellcheck="false">';
  return d;
}
function bigButton(text) {
  var b = document.createElement('button');
  b.className = 'pwa-btn';
  b.type = 'button';
  b.textContent = text;
  return b;
}

/* ------------------------------- PROFİLİM ------------------------------- */
function openProfile() {
  var u = fbUser();
  sheet('👤 Profilim', u ? 'Giriş yapıldı' : 'Bu bölüm için önce giriş yapman gerekiyor.', function (b) {
    if (!u) {
      b.innerHTML = '<div class="pwa-empty">Açılış ekranındaki sıralama bölümünden giriş yapabilirsin.</div>';
      return;
    }

    var loginName = (u.email || '').split('@')[0];
    var info = row('🪪', 'Giriş adın', loginName + ' — bu ad değişmez, giriş için hep bunu kullan');
    info.style.cursor = 'default';
    b.appendChild(info);

    var idRow = row('🔑', 'Kullanıcı kimliğim', 'Dokun ve kopyala');
    idRow.onclick = function () { copyText(u.uid); };
    b.appendChild(idRow);

    /* --- görünen ad --- */
    b.insertAdjacentHTML('beforeend', '<p class="pwa-note" style="margin:18px 2px 6px">Görünen ad</p>');
    var nameF = inputRow('Sıralamada görünecek ad', 'text', u.displayName || '', 'Adın');
    b.appendChild(nameF);
    var nameBtn = bigButton('Adı güncelle');
    nameBtn.onclick = function () {
      var v = qs('input', nameF).value.trim();
      if (v.length < 2) { toast('Ad en az 2 karakter olmalı', { kind: 'bad' }); return; }
      nameBtn.disabled = true; nameBtn.textContent = 'Güncelleniyor…';
      u.updateProfile({ displayName: v }).then(function () {
        var db = fbDb();
        if (db) return db.ref('leaderboard/' + u.uid + '/name').set(v);
      }).then(function () {
        nameBtn.disabled = false; nameBtn.textContent = 'Adı güncelle';
        toast('✅ Ad güncellendi', { kind: 'good' });
      }).catch(function (e) {
        nameBtn.disabled = false; nameBtn.textContent = 'Adı güncelle';
        toast('Ad değiştirilemedi: ' + (e && e.code ? e.code : 'hata'), { kind: 'bad', duration: 6000 });
      });
    };
    b.appendChild(nameBtn);

    /* --- şifre --- */
    b.insertAdjacentHTML('beforeend', '<p class="pwa-note" style="margin:22px 2px 6px">Şifre değiştir</p>');
    var oldF = inputRow('Mevcut şifren', 'password', '', '••••••');
    var newF = inputRow('Yeni şifre (en az 6 karakter)', 'password', '', '••••••');
    b.appendChild(oldF); b.appendChild(newF);
    var passBtn = bigButton('Şifreyi değiştir');
    passBtn.onclick = function () {
      var oldP = qs('input', oldF).value;
      var newP = qs('input', newF).value;
      if (!oldP) { toast('Mevcut şifreni yaz', { kind: 'bad' }); return; }
      if (!newP || newP.length < 6) { toast('Yeni şifre en az 6 karakter olmalı', { kind: 'bad' }); return; }
      passBtn.disabled = true; passBtn.textContent = 'Değiştiriliyor…';

      var cred;
      try { cred = firebase.auth.EmailAuthProvider.credential(u.email, oldP); }
      catch (e) { passBtn.disabled = false; passBtn.textContent = 'Şifreyi değiştir'; toast('Yapılamadı', { kind: 'bad' }); return; }

      u.reauthenticateWithCredential(cred).then(function () {
        return u.updatePassword(newP);
      }).then(function () {
        passBtn.disabled = false; passBtn.textContent = 'Şifreyi değiştir';
        qs('input', oldF).value = ''; qs('input', newF).value = '';
        toast('✅ Şifren değişti', { kind: 'good' });
      }).catch(function (e) {
        passBtn.disabled = false; passBtn.textContent = 'Şifreyi değiştir';
        var code = e && e.code;
        toast(code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Mevcut şifre yanlış'
          : 'Değiştirilemedi: ' + (code || 'hata'), { kind: 'bad', duration: 6000 });
      });
    };
    b.appendChild(passBtn);

    /* --- Hesabı sil (KALICI) --------------------------------------- */
    b.insertAdjacentHTML('beforeend',
      '<p class="pwa-note" style="margin:24px 2px 6px;color:#ff8a8a">Hesabımı sil</p>' +
      '<p class="pwa-note" style="margin:0 2px 8px;opacity:.75">Hesabın, ilerlemen ve sıralaman kalıcı olarak silinir. Geri alınamaz.</p>');
    var delF = inputRow('Onaylamak için şifreni yaz', 'password', '', '••••••');
    b.appendChild(delF);
    var delBtn = bigButton('Hesabımı kalıcı olarak sil');
    delBtn.style.background = 'rgba(255,80,80,.14)';
    delBtn.style.borderColor = 'rgba(255,80,80,.5)';
    delBtn.style.color = '#ff8a8a';
    delBtn.onclick = function () {
      var pw = qs('input', delF).value;
      if (!pw) { toast('Önce şifreni yaz', { kind: 'bad' }); return; }
      if (!window.confirm('Hesabın, ilerlemen ve sıralaman KALICI olarak silinecek. Bu işlem geri alınamaz.\n\nDevam edilsin mi?')) return;

      var uid = u.uid;
      var d = (typeof fbDb === 'function') ? fbDb() : null;
      delBtn.disabled = true; delBtn.textContent = 'Siliniyor…';

      var cred;
      try { cred = firebase.auth.EmailAuthProvider.credential(u.email, pw); }
      catch (e) { delBtn.disabled = false; delBtn.textContent = 'Hesabımı kalıcı olarak sil'; toast('Yapılamadı', { kind: 'bad' }); return; }

      u.reauthenticateWithCredential(cred).then(function () {
        /* Kimlik hâlâ geçerliyken önce sunucudaki verileri sil */
        var jobs = [];
        if (d) {
          jobs.push(d.ref('progress/' + uid).remove().catch(function () {}));
          jobs.push(d.ref('leaderboard/' + uid).remove().catch(function () {}));
        }
        return Promise.all(jobs);
      }).then(function () {
        return u.delete();               /* sonra hesabı sil */
      }).then(function () {
        try { localStorage.clear(); } catch (e) {}
        toast('✅ Hesabın ve tüm verilerin silindi', { kind: 'good' });
        setTimeout(function () { location.reload(); }, 1200);
      }).catch(function (e) {
        delBtn.disabled = false; delBtn.textContent = 'Hesabımı kalıcı olarak sil';
        var code = e && e.code;
        toast(code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Şifre yanlış'
          : 'Silinemedi: ' + (code || 'hata'), { kind: 'bad', duration: 6000 });
      });
    };
    b.appendChild(delBtn);

    b.insertAdjacentHTML('beforeend',
      '<p class="pwa-note">Görünen adını değiştirmen giriş bilgilerini etkilemez; ' +
      'uygulamaya girerken yine <b>' + escapeHtml(loginName) + '</b> adını kullanacaksın.</p>');
  });
}

/* --------------------------- YÖNETİCİ: XP GÖNDER ------------------------ */
function openAdminXp() {
  sheet('🛡️ XP Gönder', 'Yalnızca yönetici görür. Seçtiğin kişinin XP\'si kalıcı olarak artar.', function (b) {
    var db = fbDb();
    if (!db) {
      b.innerHTML = '<div class="pwa-empty">Bağlantı yok — internet gerekiyor.</div>';
      return;
    }

    var searchF = inputRow('Kişi ara', 'text', '', 'İsim yaz…');
    b.appendChild(searchF);

    var amountF = inputRow('Gönderilecek XP', 'number', '', 'ör. 500');
    b.appendChild(amountF);

    var list = document.createElement('div');
    list.innerHTML = '<div class="pwa-empty">Kullanıcılar yükleniyor…</div>';
    b.appendChild(list);

    var users = [];
    var selected = null;

    function draw() {
      var q = qs('input', searchF).value.trim().toLowerCase();
      var shown = users.filter(function (u) {
        return !q || (u.name || '').toLowerCase().indexOf(q) > -1;
      }).slice(0, 40);

      list.innerHTML = '';
      if (!shown.length) {
        list.innerHTML = '<div class="pwa-empty">Eşleşen kullanıcı yok.</div>';
        return;
      }
      shown.forEach(function (u) {
        var r = row('👤', escapeHtml(u.name || '(isimsiz)'),
          (u.xp || 0) + ' XP · Sv ' + (Math.floor((u.xp || 0) / 200) + 1) +
          (u.realXp ? '' : ' · dokun, gerçek XP okunsun'));
        if (selected && selected.uid === u.uid) {
          r.style.borderColor = 'rgba(79,232,255,.6)';
          r.style.background = 'rgba(79,232,255,.10)';
        }
        r.onclick = function () {
          selected = u;
          draw();
          /* Gerçek XP, kişinin progress kaydında tutulur; leaderboard'daki
             kopya yalnızca "Kişisel Mod" kullanıldığında güncellenir ve çoğu
             kullanıcıda 0 kalır. Seçilen kişinin asıl değerini okuyoruz. */
          db.ref('progress/' + u.uid + '/meta/xp').once('value').then(function (sn) {
            var real = sn.val();
            if (typeof real === 'number') {
              u.xp = real;
              u.realXp = true;
              if (selected && selected.uid === u.uid) draw();
            }
          }).catch(function () {});
        };
        list.appendChild(r);
      });
    }

    qs('input', searchF).addEventListener('input', draw);

    db.ref('leaderboard').once('value').then(function (snap) {
      var val = snap.val() || {};
      users = Object.keys(val).map(function (uid) {
        return { uid: uid, name: val[uid] && val[uid].name, xp: (val[uid] && val[uid].xp) || 0 };
      }).sort(function (a, b2) { return (b2.xp || 0) - (a.xp || 0); });
      draw();
    }).catch(function (e) {
      list.innerHTML = '<div class="pwa-empty">Liste okunamadı: ' + escapeHtml((e && e.code) || 'hata') + '</div>';
    });

    var send = bigButton('XP gönder');
    send.onclick = function () {
      if (!selected) { toast('Önce bir kişi seç', { kind: 'bad' }); return; }
      var amount = parseInt(qs('input', amountF).value, 10);
      if (!amount || amount <= 0) { toast('Geçerli bir XP miktarı yaz', { kind: 'bad' }); return; }
      if (amount > 100000) { toast('Tek seferde en fazla 100.000 XP', { kind: 'bad' }); return; }

      var target = selected;

      /* Gönderimden hemen önce gerçek değeri bir kez daha oku: aradan zaman
         geçtiyse kişi XP kazanmış olabilir, üzerine yazıp geri almayalım. */
      send.disabled = true; send.textContent = 'Okunuyor…';
      db.ref('progress/' + target.uid + '/meta/xp').once('value').then(function (sn) {
        var cur = sn.val();
        if (typeof cur !== 'number') cur = target.xp || 0;
        target.xp = cur;
        target.realXp = true;
        send.disabled = false; send.textContent = 'XP gönder';
        draw();
        askAndSend(target, cur, amount);
      }).catch(function () {
        send.disabled = false; send.textContent = 'XP gönder';
        askAndSend(target, target.xp || 0, amount);
      });
    };

    function askAndSend(target, cur, amount) {
      var newXp = cur + amount;

      confirmSheet('XP gönderilsin mi?',
        escapeHtml(target.name || '(isimsiz)') + ' → ' + cur + ' XP yerine <b>' + newXp + ' XP</b> olacak.',
        function () {
          send.disabled = true; send.textContent = 'Gönderiliyor…';
          /* SADECE xp alanı yazılıyor: kişinin serisi, günlük sayacı ve
             öğrendiği kelimeler asla değiştirilmiyor. */
          /* Sıralamaya yazarken ADI da koruyoruz. Yalnızca "xp" alanı
             yazıldığında, kaydın adı boş kalırsa kişi sıralamada hiç
             görünmüyordu. */
          var lbUpdate = { xp: newXp };
          if (target.name) lbUpdate.name = target.name;
          Promise.all([
            db.ref('progress/' + target.uid + '/meta/xp').set(newXp),
            db.ref('leaderboard/' + target.uid).update(lbUpdate)
          ]).then(function () {
            target.xp = newXp;
            send.disabled = false; send.textContent = 'XP gönder';
            qs('input', amountF).value = '';
            draw();

            /* Kendine gönderdiysen: bu cihaz eski XP'yi hâlâ bellekte tutuyor
               ve düzenli aralıklarla sunucuya geri yazıyor. Sıralamanın bir
               görünüp bir kaybolmasının sebebi bu çekişme. Sayfa yenilenince
               cihaz sunucudaki yüksek değeri benimsiyor ve çekişme bitiyor. */
            var me = fbUser();
            if (me && me.uid === target.uid) {
              toast('✅ Gönderildi — yenileniyor…', { kind: 'good' });
              setTimeout(function () { location.reload(); }, 1200);
            } else {
              toast('✅ ' + amount + ' XP gönderildi. Kişi uygulamayı bir daha açtığında değer ona geçecek.',
                    { kind: 'good', duration: 7000 });
            }
          }).catch(function (e) {
            send.disabled = false; send.textContent = 'XP gönder';
            toast('Gönderilemedi: ' + ((e && e.code) || 'izin yok'), { kind: 'bad', duration: 8000 });
          });
        });
    }
    b.appendChild(send);

    b.insertAdjacentHTML('beforeend',
      '<p class="pwa-note">Kişinin cihazı, sunucudaki XP kendi kaydından yüksekse ' +
      'onu esas alır; yani gönderdiğin XP bir sonraki açılışta ona geçer. ' +
      'Serisi, günlük sayacı ve öğrendiği kelimeler değişmez.</p>');
  });
}

/* Basit onay penceresi */
function confirmSheet(title, html, onYes) {
  sheet(title, '', function (b, api) {
    b.insertAdjacentHTML('beforeend', '<p class="sheet-sub">' + html + '</p>');
    var yes = bigButton('Evet, gönder');
    yes.onclick = function () { api.close(); onYes(); };
    var no = document.createElement('button');
    no.className = 'pwa-btn ghost';
    no.type = 'button';
    no.textContent = 'Vazgeç';
    no.onclick = function () { api.close(); };
    b.appendChild(yes); b.appendChild(no);
  });
}

/* ============================== AYAR DÜĞMESİ ============================ */
/* NOT: Bu fonksiyon bir önceki düzenlemede yanlışlıkla silinmişti; ayar
   düğmesinin ekrandan kaybolmasının sebebi buydu. */
function setupFab() {
  if ($('pwa-fab')) return;
  var fab = document.createElement('div');
  fab.id = 'pwa-fab';
  fab.setAttribute('role', 'button');
  fab.setAttribute('aria-label', 'Uygulama ayarları');
  fab.title = 'Uygulama ayarları';
  fab.innerHTML = '⚙️';
  document.body.appendChild(fab);
  /* Aç/kapa: panel açıkken tekrar basınca üst üste açmak yerine kapatır. */
  fab.onclick = function () {
    if (openSheets.length) {
      while (openSheets.length) openSheets[openSheets.length - 1].close();
      return;
    }
    openSettings();
  };

  /* Açılış ekranı görünürken gizli dursun, kapanınca belirsin */
  var sp = $('splash');
  if (sp && !sp.classList.contains('hidden')) {
    fab.classList.add('hidden');
    var show = function () { fab.classList.remove('hidden'); };
    sp.addEventListener('click', function () { setTimeout(show, 400); }, { once: true });
    try {
      var obs = new MutationObserver(function () {
        if (sp.classList.contains('hidden')) { show(); obs.disconnect(); }
      });
      obs.observe(sp, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { show(); }
    /* Her ihtimale karşı: 12 sn sonra düğme kesinlikle görünür olsun */
    setTimeout(show, 12000);
  }
}

/* ---------------------- GÜNCELLEME YARDIMCILARI ------------------------ */
/* Service Worker'a sürümünü sorar (sw.js'teki GET_VERSION'a cevap verir). */
function swVersion(cb) {
  try {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) { cb(null); return; }
    var ch = new MessageChannel();
    var done = false;
    ch.port1.onmessage = function (e) {
      if (done) return;
      done = true;
      cb((e.data && e.data.version) || null);
    };
    navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
    setTimeout(function () { if (!done) { done = true; cb(null); } }, 2500);
  } catch (e) { cb(null); }
}

/* Gerçekten yeni bir sürüm var mı diye bakar. reg.update() tek başına
   yeterli değil: yeni bir worker kurulup kurulmadığını izlemek gerekiyor. */
function checkForUpdate(cb) {
  if (!swReg) { cb('error'); return; }
  var settled = false;
  var finish = function (r) { if (!settled) { settled = true; cb(r); } };

  if (swReg.waiting) { finish('new'); return; }

  swReg.update().then(function () {
    if (swReg.waiting || swReg.installing) {
      var w = swReg.waiting || swReg.installing;
      if (w.state === 'installed' || w.state === 'activated') { finish('new'); return; }
      w.addEventListener('statechange', function () {
        if (w.state === 'installed' || w.state === 'activated') finish('new');
      });
      setTimeout(function () { finish(swReg.waiting ? 'new' : 'current'); }, 6000);
    } else {
      setTimeout(function () { finish(swReg.waiting ? 'new' : 'current'); }, 1500);
    }
  }).catch(function () { finish('error'); });
}

/* Önbellekleri boşaltıp Service Worker'ı yeniden kurar ve sayfayı tazeler.
   localStorage'a DOKUNMAZ: ilerleme, favoriler ve ayarlar yerinde kalır. */
function hardRefresh(full) {
  var jobs = [];
  try {
    if (window.caches && caches.keys) {
      jobs.push(caches.keys().then(function (names) {
        return Promise.all(names.map(function (n) { return caches.delete(n); }));
      }));
    }
  } catch (e) {}
  if (full) {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }));
      }
    } catch (e) {}
  } else if (waitingWorker) {
    try { waitingWorker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {}
  }

  Promise.all(jobs).catch(function () {}).then(function () {
    var base = location.origin + location.pathname;
    location.replace(base + '?fresh=' + Date.now());
  });
}

/* ================================ AYARLAR PANELİ ======================== */
var settingsOpen = null;
function openSettings() {
  if (settingsOpen) { try { settingsOpen.close(); } catch (e) {} settingsOpen = null; return; }
  settingsOpen = sheet('⚙️ Uygulama', CONFIG.brand + ' · ' + CONFIG.appName + (isStandalone ? ' · uygulama modu' : ''), function (b) {

    var liteOn = document.documentElement.classList.contains('lite');
    var liteRow = row('⚡', 'Hafif mod',
      liteOn
        ? (liteSetting() === true ? 'Açık — süslemeler kapalı, daha akıcı'
                                  : 'Açık (cihaz zayıf olduğu için otomatik)')
        : 'Kapalı — tüm görsel efektler açık',
      '<div class="pwa-switch' + (liteOn ? ' on' : '') + '"></div>');
    liteRow.onclick = function () {
      var next = !document.documentElement.classList.contains('lite');
      applyLite(next);
      store('pwa_lite', next);
      qs('.pwa-switch', liteRow).classList.toggle('on', next);
      qs('.tx span', liteRow).textContent = next
        ? 'Açık — süslemeler kapalı, daha akıcı'
        : 'Kapalı — tüm görsel efektler açık';
      toast(next ? '⚡ Hafif mod açık — tam etki için sayfayı yenile'
                 : 'Efektler geri açıldı — yenileyince tamamlanır', { kind: 'good', duration: 5000 });
    };
    b.appendChild(liteRow);


    /* --- Bildirimler ------------------------------------------------- */
    var s = reminderSettings();
    var permOk = notifyState() === 'granted';
    var notifRow = row('🔔', 'Günlük hatırlatma',
      permOk ? (s.on ? 'Her gün ' + pad(s.hour) + ':' + pad(s.min) : 'Kapalı') : 'İzin gerekiyor',
      '<div class="pwa-switch' + (s.on && permOk ? ' on' : '') + '"></div>');
    notifRow.onclick = function () {
      askNotifyPermission().then(function (p) {
        if (p !== 'granted') { toast('Bildirim izni verilmedi', { kind: 'bad' }); return; }
        var cur = reminderSettings();
        cur.on = !cur.on;
        saveReminder(cur);
        qs('.pwa-switch', notifRow).classList.toggle('on', cur.on);
        qs('.tx span', notifRow).textContent = cur.on ? 'Her gün ' + pad(cur.hour) + ':' + pad(cur.min) : 'Kapalı';
        if (cur.on) { subscribePush(); toast('🔔 Hatırlatma açıldı', { kind: 'good' }); }
      });
    };
    b.appendChild(notifRow);

    var timeRow = row('⏰', 'Hatırlatma saati', 'Bildirimin geleceği saat',
      '<input class="pwa-time" type="time" value="' + pad(s.hour) + ':' + pad(s.min) + '">');
    var inp = qs('.pwa-time', timeRow);
    inp.onclick = function (e) { e.stopPropagation(); };
    inp.onchange = function () {
      var parts = inp.value.split(':');
      var cur = reminderSettings();
      cur.hour = parseInt(parts[0], 10) || 20;
      cur.min = parseInt(parts[1], 10) || 0;
      saveReminder(cur);
      toast('Saat güncellendi: ' + inp.value, { kind: 'good' });
    };
    b.appendChild(timeRow);

    var testRow = row('📨', 'Test bildirimi gönder', 'Çalışıyor mu diye bak');
    testRow.onclick = function () {
      askNotifyPermission().then(function (p) {
        if (p !== 'granted') { toast('Önce izin ver', { kind: 'bad' }); return; }
        showNotification('Merhaba! 👋', 'Bildirimler çalışıyor. İyi çalışmalar!', './?src=notification&tab=cards');
      });
    };
    b.appendChild(testRow);

    /* --- Çevrimdışı --------------------------------------------------- */
    var packRow = row('📦', 'Çevrimdışı paketi indir', '6 dilin tüm sözlükleri · destek rozeti gerekir');
    var bar = document.createElement('div');
    bar.className = 'pwa-progress';
    bar.innerHTML = '<i></i>';
    cacheBar = qs('i', bar);
    packRow.onclick = function () {
      if (window.LUMIRA_LOCK && !window.LUMIRA_LOCK.anyBadge('Çevrimdışı paket')) return;
      downloadOfflinePack();
    };
    b.appendChild(packRow); b.appendChild(bar);
    if (store('pwa_offline_pack')) cacheBar.style.width = '100%';

    estimateStorage().then(function (st) {
      if (!st) return;
      var r = row('💾', 'Kullanılan alan', mb(st.used) + ' / ' + mb(st.quota));
      r.style.cursor = 'default';
      b.insertBefore(r, packRow.nextSibling);
    });

    /* --- Favoriler & veri --------------------------------------------- */
    var favRow = row('⭐', 'Favorilerim', favs().length + ' kelime');
    favRow.onclick = function () { openFavorites(); };
    b.appendChild(favRow);

    var check = row('🔍', 'Verilerim duruyor mu?', 'Kayıtlı ilerleme kayıtlarını say');
    check.onclick = function () {
      var n = 0, keys = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!k) continue;
          n++;
          if (/prog|xp|streak|meta|word|badge|stat/i.test(k)) keys.push(k);
        }
      } catch (e) {}
      toast('💾 ' + n + ' kayıt var, ' + keys.length + ' tanesi ilerleme verisi', { duration: 7000 });
    };
    b.appendChild(check);

    var exp = row('⬇️', 'İlerlememi yedekle', 'JSON dosyası indir veya paylaş');
    exp.onclick = exportAllData;
    b.appendChild(exp);

    var imp = row('⬆️', 'Yedekten geri yükle', 'Daha önce indirdiğin dosyayı seç');
    imp.onclick = importData;
    b.appendChild(imp);

    var shr = row('🔗', 'Uygulamayı paylaş', 'Arkadaşlarına gönder');
    shr.onclick = shareApp;
    b.appendChild(shr);

    /* --- Kurulum / güncelleme ----------------------------------------- */
    if (!isStandalone && !isTwa) {
      var ins = row('📲', 'Ana ekrana ekle', 'Tam ekran, hızlı ve çevrimdışı');
      ins.onclick = doInstall;
      b.appendChild(ins);
    }

    var myVer = (window.PWA && window.PWA.version) ? window.PWA.version : 'bilinmiyor';
    var upd = row('🔄', 'Güncellemeleri denetle', 'Çalışan sürüm: ' + myVer);
    var updDesc = qs('.tx span', upd);
    b.appendChild(upd);

    /* Service Worker'ın kendi sürümünü de göster: ikisi farklıysa cihazda
       eski dosyalar takılı kalmış demektir. */
    swVersion(function (v) {
      if (!v) return;
      updDesc.textContent = 'Çalışan: ' + myVer + ' · önbellek: ' + v;
    });

    upd.onclick = function () {
      if (!navigator.onLine) { toast('Güncelleme için internet gerekli', { kind: 'bad' }); return; }
      updDesc.textContent = 'Denetleniyor…';
      checkForUpdate(function (state) {
        if (state === 'new') {
          updDesc.textContent = 'Yeni sürüm indirildi';
          toast('✨ Yeni sürüm hazır', {
            action: 'Şimdi yükle', duration: 14000,
            onAction: function () { hardRefresh(); }
          });
        } else if (state === 'error') {
          updDesc.textContent = 'Denetlenemedi';
          toast('Denetlenemedi', { kind: 'bad' });
        } else {
          updDesc.textContent = 'Çalışan sürüm: ' + myVer;
          toast('✅ En güncel sürümdesin', { kind: 'good' });
        }
      });
    };

    /* Takılı kalan dosyalar için kesin çözüm */
    var force = row('🧹', 'Zorla güncelle', 'Önbelleği temizler ve yeniler — verilerin silinmez');
    force.onclick = function () {
      confirmSheet('Zorla güncellensin mi?',
        'Kayıtlı dosyalar silinip yeniden indirilecek. <b>İlerlemen, favorilerin ve ayarların silinmez.</b> Uygulama bir kez yenilenecek.',
        function () { hardRefresh(true); });
    };
    b.appendChild(force);

    var net = row('📶', 'Bağlantı durumunu denetle', 'Çevrimdışı uyarısı yanlışsa buraya bak');
    net.onclick = function () { refreshOnlineState(); window.PWA.netStatus(); };
    b.appendChild(net);

    var bug = row('🐞', 'Hata raporu', 'Sorun mu var? Rapor gönder');
    bug.onclick = openErrorReport;
    b.appendChild(bug);

    var rate = row('💛', 'Puan ver', 'Play Store\'da değerlendir');
    rate.onclick = function () {
      store('pwa_rated', true);
      try { location.href = 'market://details?id=' + CONFIG.packageId; } catch (e) {}
      setTimeout(function () { window.open(CONFIG.playUrl, '_blank', 'noopener'); }, 700);
    };
    b.appendChild(rate);

    /* --- Yönetici (yalnızca yönetici hesabında görünür) --------------- */
    (function (adminBox) {
      function injectAdmin() {
        if (adminBox.querySelector('.pwa-admin-row')) return; /* zaten eklendi */
        adminBox.insertAdjacentHTML('beforeend',
          '<p class="pwa-note" style="margin:20px 2px 8px">Yönetici</p>');
        var adm = row('🛡️', 'Admin Panel', 'İstatistik · XP · yasaklama');
        adm.className += ' pwa-admin-row';
        adm.style.borderColor = 'rgba(255,210,59,.4)';
        adm.onclick = function () {
          if (typeof window.openAdminPanel === 'function') window.openAdminPanel();
          else toast('Yönetici paneli yüklenemedi', { kind: 'bad' });
        };
        adminBox.appendChild(adm);
      }
      /* Bayrak zaten çözülmüşse hemen; değilse /admins okunduktan sonra. */
      if (isAdmin()) injectAdmin();
      else refreshAdminFlag(function (ok) { if (ok) injectAdmin(); });
    })(b);

    /* --- Profil (en altta) ------------------------------------------- */
    b.insertAdjacentHTML('beforeend',
      '<p class="pwa-note" style="margin:20px 2px 8px">Hesap</p>');
    var prof = row('👤', 'Profilim', 'Adını ve şifreni değiştir · 3. seviye gerekir');
    prof.onclick = function () {
      if (window.LUMIRA_LOCK && !window.LUMIRA_LOCK.level(3, 'Profilim')) return;
      openProfile();
    };
    b.appendChild(prof);

    var pdfRow = row('📄', 'Kelimeleri PDF olarak indir', 'Kitap düzeninde kelime listesi · rozet gerekir');
    pdfRow.onclick = function () {
      if (typeof window.openPdfExport === 'function') window.openPdfExport();
    };
    b.appendChild(pdfRow);

    var priv = row('🔒', 'Gizlilik Politikası', 'Hangi veriler saklanıyor?');
    priv.onclick = function () { window.open('privacy/', '_blank', 'noopener'); };
    b.appendChild(priv);

    var supRow = row('❤️', 'Lumira\'yı Destekle', 'Rozet kazan, gelişime katkıda bulun');
    supRow.style.borderColor = 'rgba(255,95,184,.32)';
    supRow.onclick = function () {
      if (typeof window.openSupport === 'function') window.openSupport();
    };
    b.appendChild(supRow);

    b.insertAdjacentHTML('beforeend',
      '<p class="pwa-note">' + CONFIG.brand + ' · ' + CONFIG.appName +
      ' — çevrimdışı çalışır, verilerin cihazında saklanır.<br>' +
      'Toplam açılış: ' + (store('pwa_opens') || 1) + '</p>');
  });
}
function pad(n) { return String(n).padStart(2, '0'); }

/* ============================================================ BAŞLAT ==== */

/* Splash'taki ✦ işaretini "I" harfinin tam üstüne, harfin GERÇEK çizim
   konumuna göre yerleştirir.
   Önceki sürüm harf genişliklerini canvas ile tahmin ediyordu; sistem yazı
   tipi (-apple-system) canvas'ta farklı bir yazı tipine düştüğü için ölçüm
   tutmuyor, yıldız kayıyordu. Range API doğrudan ekranda çizilmiş harfin
   dikdörtgenini verir — tahmin yok. */
function placeBrandSpark() {
  try {
    var h = qs('.brand-name');
    var sp = qs('.brand-spark');
    if (!h || !sp) return;

    var node = null;
    for (var i = 0; i < h.childNodes.length; i++) {
      if (h.childNodes[i].nodeType === 3 && h.childNodes[i].nodeValue.indexOf('I') > -1) {
        node = h.childNodes[i]; break;
      }
    }
    if (!node) return;

    var pos = node.nodeValue.indexOf('I');       /* LUM[I]RA */
    if (pos < 0) return;

    var r = document.createRange();
    r.setStart(node, pos);
    r.setEnd(node, pos + 1);
    var box = r.getBoundingClientRect();
    var host = h.getBoundingClientRect();
    if (!box.width || !host.width) return;

    /* harfin yatay ortası, başlığın sol kenarına göre */
    var center = box.left - host.left + box.width / 2;
    sp.style.left = center.toFixed(1) + 'px';

    /* --- Gradyanı yazıyla hizala ---------------------------------------
       Başlıktaki gradyan 220% genişliğinde ve animasyonla sağa-sola kayıyor.
       Yıldızın kendi kutusu küçük olduğu için aynı gradyan ona verildiğinde
       farklı bir renkte kalırdı. Burada yıldızın gradyanı, başlığınkiyle
       aynı ölçeğe getirilip yıldızın bulunduğu noktaya kaydırılıyor:
       böylece her an "I" harfiyle birebir aynı rengi gösteriyor. */
    var W = h.clientWidth;
    if (W > 0) {
      var bgW = W * 2.2;                       /* background-size:220% */
      var travel = bgW - W;                    /* animasyonun kat ettiği yol */
      var x = center - sp.offsetWidth / 2;     /* translateX(-50%) sonrası sol kenar */
      sp.style.backgroundSize = bgW.toFixed(1) + 'px 100%';
      sp.style.setProperty('--sp-a', (-x).toFixed(1) + 'px');
      sp.style.setProperty('--sp-b', (-x - travel).toFixed(1) + 'px');
      sp.classList.add('aligned');
    }
  } catch (e) {}
}

/* Eksik kalan efekt: "Sonraki" düğmesinin işleyicisi sky.js'teki
   spawnShootingStar()'ı çağırıyordu. O dosya kaldırıldığı için her tıklamada
   ReferenceError atıyor ve HEMEN ARDINDAKİ saveCardPosition() çalışmıyordu
   (kart konumu bu yüzden hiç kaydedilmiyordu). Hafif bir sürüm burada. */
if (typeof window.spawnShootingStar !== 'function') {
  window.spawnShootingStar = function () {
    try {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var s = document.createElement('div');
      s.className = 'pwa-shoot';
      s.style.left = (Math.random() * 55 + 20) + 'vw';
      s.style.top  = (Math.random() * 22 + 6) + 'vh';
      document.body.appendChild(s);
      setTimeout(function () { s.remove(); }, 1200);
    } catch (e) {}
  };
}

function boot() {
  try {
    /* açılış sayacı */
    var opens = (store('pwa_opens') || 0) + 1;
    store('pwa_opens', opens);
    if (!store('pwa_first_open')) store('pwa_first_open', Date.now());

    setupErrorReporting();
    placeBrandSpark();
    addEventListener('resize', placeBrandSpark);
    addEventListener('orientationchange', function () { setTimeout(placeBrandSpark, 250); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(placeBrandSpark).catch(function () {});
    }
    [120, 400, 900, 1800].forEach(function (ms) { setTimeout(placeBrandSpark, ms); });
    registerSW();
    setupShell();
    setupBackButton();
    setupInstall();
    setupFab();
    setupTransitions();
    setupWelcome();
    initLite();
    scheduleReminder();

    /* Kart alanı hazır olunca favori yıldızını ekle */
    setTimeout(setupFavButton, 1200);
    setTimeout(function () { updateWidgetData(pickDailyWord()); }, 3000);

    /* Kaldığın yeri kaydet — tıklama işleyicileri bittikten SONRA çalışsın,
       yoksa idx bir adım geride kaydedilir. */
    document.addEventListener('click', function () {
      setTimeout(function () { try { saveResume(); } catch (e) {} }, 120);
    }, false);
    document.addEventListener('visibilitychange', function () {
      try { saveResume(); } catch (e) {}
    });
    addEventListener('pagehide', saveResume);

    /* Deep link / kısayol / paylaşım */
    route(new URLSearchParams(location.search));

    /* Splash kapandıktan sonraki nazik davranışlar */
    var sp = $('splash');
    var afterSplash = function () {
      setTimeout(offerResume, 1400);
      maybeAskRating();
    };
    if (sp) {
      sp.addEventListener('click', afterSplash, { once: true });
      if (sp.classList.contains('hidden')) afterSplash();
    } else afterSplash();

  } catch (e) { logError(e); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* ============================================================ PUBLIC ==== */
window.PWA = {
  config: CONFIG,
  toast: toast,
  sheet: sheet,
  openSettings: openSettings,
  openFavorites: openFavorites,
  showDailyWord: showDailyWord,
  install: doInstall,
  share: shareApp,
  saveFile: saveFile,
  shareFile: shareOrSave,
  exportData: exportAllData,
  importData: importData,
  notify: showNotification,
  askNotifyPermission: askNotifyPermission,
  downloadOfflinePack: downloadOfflinePack,
  favorites: favs,
  addFavorite: addFavorite,
  logError: logError,
  openProfile: openProfile,
  hardRefresh: hardRefresh,
  netStatus: function () {
    probeConnection(function (ok) {
      toast('navigator.onLine: ' + navigator.onLine + ' · sunucu testi: ' + (ok ? 'başarılı' : 'başarısız'), { duration: 7000 });
    });
    return { onLine: navigator.onLine, badgeVisible: !!(document.getElementById('pwa-offline') || {}).classList && document.getElementById('pwa-offline').classList.contains('in') };
  },
  version: '1.7.22',
  isStandalone: function () { return isStandalone; }
};

})();
