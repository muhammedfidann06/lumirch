/* ============================================================================
   voice.js — Seslendirme güvenilirliği

   ── ÖNEMLİ NOT ──────────────────────────────────────────────────────────
   SES SEÇİMİ orijinal hâlindedir: index.html içindeki pickVoice() devrede,
   bu dosya ona dokunmaz. Burada yalnızca "nasıl konuşulduğu" iyileştirilir:
     · Chrome'un cancel() + speak() yarış durumu (cümlenin sessizce düşmesi)
     · ~15 sn sonra sentezleyicinin kendiliğinden duraklaması
     · Hızlı kart geçişinde kelimenin ortasında kesilme
     · Yavaş mod (🐢)
   ========================================================================== */
(function () {
  'use strict';

  if (!('speechSynthesis' in window)) return;
  var synth = window.speechSynthesis;

  /* ======================================================================
     YAVAŞ MOD (kaplumbağa) — iki kat yavaşlatıldı

     Önceki değer 0.70 idi; istek üzerine yarıya indirildi: 0.35. Bu, tane
     tane bir okuma verir. Bu kadar düşük hızlarda bazı motorlar sesi
     titretebildiği için iki küçük önlem alınıyor:

       · Kelimenin sonuna nokta eklenir → motor kelimeyi aceleyle kesmek
         yerine tamamlanmış bir ifade gibi bitirir.
       · Native TTS 2.5 sn içinde başlamazsa Google TTS yedeğine düşülür
         (o da ttsspeed=0.24 ile zaten yavaş okur).

     Cihazında boğuk gelirse tek yapman gereken bu sayıyı yükseltmek:
     0.35 → 0.45 belirgin şekilde daha temiz, hâlâ eskisinden yavaştır.
     ==================================================================== */
  var SLOW_RATE = 0.35;
  var NORMAL_RATE = 0.92;      /* orijinal değer — değiştirilmedi */

  var keepAlive = null;
  function startKeepAlive() {
    if (keepAlive) return;
    keepAlive = setInterval(function () {
      if (!synth.speaking) { stopKeepAlive(); return; }
      try { if (synth.paused) synth.resume(); } catch (e) {}
    }, 4000);
  }
  function stopKeepAlive() {
    if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && synth.paused) { try { synth.resume(); } catch (e) {} }
  });

  var token = 0;
  var pending = null;

  function speakNative(text, lang, rate, onResult) {
    var myToken = ++token;
    var done = false;

    function finish(ok) {
      if (done || myToken !== token) return;
      done = true;
      stopKeepAlive();
      if (onResult) onResult(ok);
    }

    if (!text) { finish(false); return; }

    var slow = rate && rate < 0.8;
    var spoken = String(text);
    if (slow && !/[.!?]$/.test(spoken)) spoken += '.';

    if (pending) { clearTimeout(pending); pending = null; }
    try { synth.cancel(); } catch (e) {}

    pending = setTimeout(function () {
      pending = null;
      if (myToken !== token) return;

      try {
        var u = new SpeechSynthesisUtterance(spoken);

        /* Ses seçimi orijinal fonksiyona bırakılır. */
        var v = null;
        try { if (typeof window.pickVoice === 'function') v = window.pickVoice(lang); } catch (e) {}
        if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = lang; }

        u.rate = slow ? SLOW_RATE : (rate || NORMAL_RATE);
        u.pitch = 1.0;
        u.volume = 1.0;

        var started = false;
        u.onstart = function () { started = true; startKeepAlive(); };
        u.onend = function () { finish(true); };
        u.onerror = function (e) {
          /* kullanıcı yeni kelimeye geçtiyse bu hata değil */
          if (e && (e.error === 'interrupted' || e.error === 'canceled')) { done = true; return; }
          finish(false);
        };

        synth.speak(u);

        setTimeout(function () {
          if (!started && !done && myToken === token) {
            try { synth.cancel(); } catch (e2) {}
            finish(false);          /* → Google TTS yedeğine geçer */
          }
        }, 2500);
      } catch (err) {
        finish(false);
      }
    }, 0);
    /* NOT: değer bilerek 60ms'den 0ms'e indirildi. 0ms bile asenkron
       olduğu için Chrome'un cancel()+speak() aynı-tick yarış hatasını
       hâlâ önlüyor, ama iOS Safari'nin çok kısa ömürlü kullanıcı-dokunuşu
       (user-gesture) iznini artık kaçırmıyor — "bazen ses hiç çalmıyor"
       şikayetinin kök nedeni buydu. */
  }

  function warmUpSpeech() {
    try {
      if (typeof window.loadVoices === 'function') window.loadVoices();
      var u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.rate = 1;
      synth.speak(u);
      setTimeout(function () { try { synth.cancel(); } catch (e) {} }, 250);
    } catch (e) {}
  }

  /* Sadece bu ikisi devralınır. pickVoice'a DOKUNULMAZ. */
  window.speakNative = speakNative;
  window.warmUpSpeech = warmUpSpeech;

  window.VOICE_debug = function () {
    var list = [];
    try { list = synth.getVoices() || []; } catch (e) {}
    var out = [];
    ['de-DE', 'en-US', 'ar-SA', 'fr-FR', 'es-ES', 'ru-RU'].forEach(function (l) {
      var v = null;
      try { v = window.pickVoice(l); } catch (e) {}
      out.push({ dil: l, secilen: v ? v.name : '— yok —', kod: v ? v.lang : '' });
    });
    if (console.table) console.table(out); else console.log(out);
    console.log('Toplam ses sayısı:', list.length);
    return out;
  };
})();
