/* ============================================================================
   analytics.js — Lumira | Dil Kartları  ·  Hafif kullanım ölçümü
   ----------------------------------------------------------------------------
   Firebase Realtime Database'e yazar. Veri şekilleri admin.js'in okuduğu
   ve güvenlik kurallarının izin verdiği yapıyla BİREBİR aynıdır:

     analytics/events/<gün>/<olay>   : sayı (artan)      LUMIRA_TRACK(olay)
     analytics/funnel/<gün>/<adım>   : sayı (artan)      LUMIRA_TRACK_FUNNEL(adım)
     analytics/dau/<gün>/<uid>       : 1  (günde bir)    otomatik
     analytics/sessions/<gün>/n      : sayı (oturum)     otomatik (sekme kapanınca)
     analytics/sessions/<gün>/totalSec: sayı (saniye)    otomatik

   <gün> = yerel tarih "YYYY-MM-DD" (admin.js/dayKey ile aynı).

   ÖNEMLİ: Güvenlik kuralları yazma için "auth != null" ister. Bu yüzden ölçüm
   yalnızca OTURUM AÇMIŞ kullanıcılar için yazılır. Oturum yoksa olaylar
   tamponlanır ve giriş yapılınca gönderilir; hiç giriş olmazsa sessizce atılır
   (kurala uygun). Anonim ziyaretçileri de saymak istersen: aşağıdaki
   ANON_SIGNIN'i true yap VE Firebase Console → Authentication → Sign-in method
   → Anonymous'ı etkinleştir. (Not: anonim giriş, uygulamanın giriş akışıyla
   etkileşebilir; varsayılan kapalıdır.)
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------- ayarlar -- */
  var ANON_SIGNIN = false;   /* true + Console'da Anonymous açık = anonimleri de say */
  var MAX_QUEUE   = 200;     /* giriş beklerken tamponlanacak en fazla olay */

  /* ------------------------------------------------------------ yardımcı -- */
  function today() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /* RTDB anahtarı yasak karakterleri: . $ # [ ] /  → alt çizgiye çevir */
  function key(s) {
    return String(s == null ? '' : s).replace(/[.$#\[\]\/\x00-\x1f\x7f]/g, '_').slice(0, 80);
  }
  function hasFB() {
    return (typeof firebase !== 'undefined') && firebase.apps && firebase.apps.length;
  }
  function db()   { try { return firebase.database(); } catch (e) { return null; } }
  function user() { try { return firebase.auth().currentUser; } catch (e) { return null; } }

  /* artırma: ServerValue.increment varsa onu, yoksa transaction'ı kullan */
  function bump(path, amount) {
    var d = db(); if (!d) return;
    amount = amount || 1;
    try {
      var inc = firebase.database.ServerValue && firebase.database.ServerValue.increment;
      if (inc) { d.ref(path).set(inc(amount)); return; }
    } catch (e) {}
    /* yedek: transaction */
    d.ref(path).transaction(function (cur) {
      return (typeof cur === 'number' ? cur : 0) + amount;
    });
  }

  /* ------------------------------------------------------- yazma / tampon -- */
  var queue = [];            /* giriş yokken bekleyen işler */
  var ready = false;         /* auth != null oldu mu */

  function run(fn) {
    if (ready && user()) { try { fn(); } catch (e) {} }
    else { if (queue.length < MAX_QUEUE) queue.push(fn); }
  }
  function flush() {
    if (!(ready && user())) return;
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) {} }
  }

  /* ------------------------------------------------------------- olaylar -- */
  function trackEvent(name) {
    var k = key(name); if (!k) return;
    run(function () { bump('analytics/events/' + today() + '/' + k, 1); });
  }
  function trackFunnel(step) {
    var k = key(step); if (!k) return;
    run(function () { bump('analytics/funnel/' + today() + '/' + k, 1); });
  }

  /* günlük aktif kullanıcı: gün başına bir kez uid işaretle */
  function markDAU() {
    run(function () {
      var u = user(); if (!u) return;
      var day = today();
      var guard = 'lumira_dau_' + day;
      try { if (localStorage.getItem(guard)) return; } catch (e) {}
      db() && db().ref('analytics/dau/' + day + '/' + key(u.uid)).set(1);
      try { localStorage.setItem(guard, '1'); } catch (e) {}
    });
  }

  /* -------------------------------------------------------------- oturum -- */
  var sessionStart = Date.now();
  var sessionSent  = false;
  function endSession() {
    if (sessionSent) return;
    if (!(ready && user())) return;           /* auth yoksa yazamayız */
    sessionSent = true;
    var sec = Math.max(0, Math.round((Date.now() - sessionStart) / 1000));
    if (sec > 8 * 3600) sec = 0;              /* uçuk değerleri ele */
    var day = today();
    bump('analytics/sessions/' + day + '/n', 1);
    if (sec > 0) bump('analytics/sessions/' + day + '/totalSec', sec);
  }

  /* --------------------------------------------------------- auth durumu -- */
  var anonTried = false;
  function onAuth() {
    if (user()) {
      if (!ready) {
        ready = true;
        flush();          /* birikenleri gönder */
        markDAU();        /* günlük aktif */
      }
    }
  }

  /* mevcut arayüz öğelerini olaylara bağla — hiçbir mevcut handler'ı değiştirmez */
  function wireAuto() {
    /* tıklama delegasyonu (capture) */
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      if (t.closest('#tabQuiz'))         trackEvent('opened_quiz_tab');
      else if (t.closest('#tabCards'))   trackEvent('opened_flashcard');
      else if (t.closest('#tabPersonal')) trackEvent('opened_personal');
      if (t.closest('.lang-opt'))        trackEvent('changed_language');
      if (t.closest('#rabbitBtn') || t.closest('#turtleBtn')) trackEvent('played_pronunciation');
    }, true);

    /* global fonksiyonları sar (yüklenince) */
    function wrap(name, ev) {
      var tries = 0;
      (function attach() {
        var f = window[name];
        if (typeof f === 'function' && !f.__lumTracked) {
          var orig = f;
          window[name] = function () { trackEvent(ev); return orig.apply(this, arguments); };
          window[name].__lumTracked = true; return;
        }
        if (tries++ < 12) setTimeout(attach, 500);
      })();
    }
    wrap('openProfile', 'opened_profile');
    wrap('openSupport', 'support_clicked');

    /* PDF çıktısı = window.print */
    try {
      if (window.print && !window.print.__lumTracked) {
        var op = window.print;
        window.print = function () { trackEvent('pdf_exported'); return op.apply(this, arguments); };
        window.print.__lumTracked = true;
      }
    } catch (e) {}
  }

  function boot() {
    if (!hasFB()) { setTimeout(boot, 400); return; }   /* firebase henüz yüklenmedi */

    try { firebase.auth().onAuthStateChanged(onAuth); } catch (e) {}
    onAuth();  /* zaten oturum açıksa hemen yakala */

    /* app_opened — SEKME ömrü başına BİR KEZ. sessionStorage kullanılır çünkü
       SW güncellemesi/rozet sonrası gibi bizim tetiklediğimiz reload'lar aynı
       sekmede olur; bunlar yeni "açılış" sayılmamalı (istatistik şişmesin). */
    try {
      if (!sessionStorage.getItem('lumira_tab_opened')) {
        sessionStorage.setItem('lumira_tab_opened', '1');
        trackEvent('app_opened');
      }
    } catch (e) { trackEvent('app_opened'); }

    /* mevcut arayüzü ölçüme bağla (handler'lara dokunmadan) */
    wireAuto();

    /* isteğe bağlı anonim giriş: kısa süre sonra hâlâ oturum yoksa */
    if (ANON_SIGNIN) {
      setTimeout(function () {
        if (!user() && !anonTried) {
          anonTried = true;
          try { firebase.auth().signInAnonymously().catch(function () {}); } catch (e) {}
        }
      }, 1500);
    }

    /* oturumu sekme kapanınca/gizlenince yaz */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') endSession();
    });
    window.addEventListener('pagehide', endSession);
  }

  /* ------------------------------------------------------------ genel API -- */
  window.LUMIRA_TRACK        = trackEvent;    /* index.html: LUMIRA_TRACK('started_quiz') */
  window.LUMIRA_TRACK_FUNNEL = trackFunnel;   /* index.html: LUMIRA_TRACK_FUNNEL('quiz_started') */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
