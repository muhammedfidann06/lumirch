/* ============================================================================
   support-badges.js — Lumira | Dil Kartları
   ----------------------------------------------------------------------------
   · ❤️ Destek ekranı (bağış tutarları — ödeme Play Store üzerinden yapılacak)
   · Destek rozetleri ve XP ödülleri
   · Seviye/rozet kilitleri (Profilim, Çevrimdışı paket, PDF)
   · Kelime listesini kitap düzeninde PDF olarak dışa aktarma

   NOT: Ödeme altyapısı henüz bağlı değil. Butonlar şu an bilgilendirme
   gösterir; Play Store yayınından sonra "In-App Purchase" akışı buraya
   bağlanacak (bkz. grantSupportTier).
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'lumira_support_v1';

  /* --------------------------------------------------------- rozet tablosu */
  var TIERS = [
    { amount: 1,   badge: '👍🏻', name: 'Teşekkür',  xp: 10,   try_: '59,95',   sku: 'lumira_support_1'   },
    { amount: 5,   badge: '☕️', name: 'Kahve',     xp: 50,   try_: '299,95',  sku: 'lumira_support_5'   },
    { amount: 10,  badge: '❤️', name: 'Destekçi',  xp: 100,  try_: '599,95',  sku: 'lumira_support_10'  },
    { amount: 25,  badge: '💛', name: 'Dost',      xp: 250,  try_: '1499,95', sku: 'lumira_support_25'  },
    { amount: 50,  badge: '⭐️', name: 'Yıldız',    xp: 500,  try_: '2999,95', sku: 'lumira_support_50'  },
    { amount: 100, badge: '👑', name: 'Kral',    xp: 1000, try_: '5999,95', sku: 'lumira_support_100' }
  ];
  /* PDF için gereken rozetler */
  var PDF_BADGES = ['💛', '⭐️', '👑'];

  function store(k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
      localStorage.setItem(k, JSON.stringify(v)); return v;
    } catch (e) { return null; }
  }
  function myBadges() { return store(KEY) || []; }
  function hasBadge(b) { return myBadges().indexOf(b) > -1; }
  function hasAnyPdfBadge() { return PDF_BADGES.some(hasBadge); }
  function myLevel() {
    try { return (typeof window.PR_getLevel === 'function') ? window.PR_getLevel() : 1; }
    catch (e) { return 1; }
  }
  function toast(m, o) {
    if (window.PWA && window.PWA.toast) return window.PWA.toast(m, o);
    return function () {};
  }

  /* Ödeme onaylandığında çağrılacak tek kapı.
     Play Store satın alma akışı buraya bağlanacak. */
  window.grantSupportTier = function (amount) {
    var t = null;
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].amount === amount) t = TIERS[i];
    if (!t) return false;
    var list = myBadges();
    if (list.indexOf(t.badge) === -1) { list.push(t.badge); store(KEY, list); }
    try { if (typeof window.PR_addXp === 'function') window.PR_addXp(t.xp, t.name + ' rozeti'); } catch (e) {}
    toast(t.badge + ' ' + t.name + ' rozeti kazandın · +' + t.xp + ' XP', { kind: 'good', duration: 6000 });
    return true;
  };
  window.LUMIRA_BADGES = { list: myBadges, has: hasBadge, tiers: TIERS };

  /* ============================================== SATIN ALMA (Play Billing)
     Yalnızca Play Store üzerinden (TWA) çalışır — web sürümünde ödeme
     alınmaz, bilgi mesajı gösterilir. Google Play Console'da her tier için
     TIERS[].sku ile BİREBİR AYNI ürün kimliğiyle "Yönetilmeyen ürün"
     (managed in-app product, tek seferlik) oluşturulmuş olmalı. */
  function purchaseTier(t) {
    /* isTwa yerine DOĞRUDAN gerçek yeteneği kontrol ediyoruz: PaymentRequest +
       getDigitalGoodsService sadece gerçek, Play Billing'e bağlı bir TWA
       içinde var olur. isTwa referrer'a dayandığı için bazı Android/Chrome
       sürümlerinde yanlışlıkla false çıkabiliyordu (bilinen sorun) — bu,
       gerçek satın alma kararını etkilememesi için doğrudan API varlığına
       bakıyoruz, daha güvenilir. */
    if (!window.PaymentRequest || typeof window.getDigitalGoodsService !== 'function') {
      toast('Bu satın alma yalnızca Play Store\'dan indirilen uygulamada kullanılabilir. ' +
            'Web sürümünde ödeme alınmıyor.', { duration: 7000 });
      return;
    }
    var methodData = [{ supportedMethods: 'https://play.google.com/billing', data: { sku: t.sku } }];
    var details = { total: { label: 'Toplam', amount: { currency: 'TRY', value: '0' } } };
    var request;
    try { request = new PaymentRequest(methodData, details); }
    catch (e) { toast('Satın alma başlatılamadı.', { kind: 'bad' }); return; }

    request.show().then(function (response) {
      var token = (response.details && (response.details.token || response.details.purchaseToken)) || null;
      return response.complete('success').then(function () {
        return window.getDigitalGoodsService('https://play.google.com/billing').then(function (service) {
          if (service && token && service.acknowledge) {
            return service.acknowledge(token, 'onetime').catch(function () {});
          }
        });
      });
    }).then(function () {
      window.grantSupportTier(t.amount);
      if (window.openSupport) { setTimeout(window.openSupport, 300); } /* rozeti göstermek için yeniden aç */
    }).catch(function (e) {
      /* kullanıcı iptal ettiyse sessiz geç, gerçek hataysa bilgilendir */
      var msg = String((e && e.message) || e || '');
      if (msg.toLowerCase().indexOf('cancel') === -1) {
        toast('Satın alma tamamlanamadı.', { kind: 'bad', duration: 6000 });
      }
    });
  }
  window.purchaseSupportTier = purchaseTier;

  /* ============================================================ DESTEK OL */
  function openSupport() {
    if (!(window.PWA && window.PWA.sheet)) return;
    window.PWA.sheet('❤️ Lumira\'yı Destekle', '', function (b) {
      var grid = document.createElement('div');
      grid.className = 'sup-grid';

      TIERS.forEach(function (t) {
        var owned = hasBadge(t.badge);
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'sup-item' + (owned ? ' owned' : '');
        el.innerHTML =
          '<span class="sup-amount">' + t.try_ + ' ₺</span>' +
          '<span class="sup-eur">~' + t.amount + ' €</span>' +
          '<span class="sup-badge">' + t.badge + '</span>' +
          '<span class="sup-xp">+' + t.xp + ' XP</span>';
        el.onclick = function () { purchaseTier(t); };
        grid.appendChild(el);
      });
      b.appendChild(grid);

      var mine = myBadges();
      if (mine.length) {
        b.insertAdjacentHTML('beforeend',
          '<p class="pwa-note" style="text-align:center;font-size:15px;margin:14px 0 0">' +
          'Rozetlerin: ' + mine.join(' ') + '</p>');
      }

      b.insertAdjacentHTML('beforeend',
        '<p class="sup-desc">Lumira\'yı herkes için ücretsiz sunmaya devam etmek istiyoruz. ' +
        'Eğer uygulamayı faydalı bulduysanız, tamamen isteğe bağlı bir destekle yeni ' +
        'özelliklerin geliştirilmesine katkıda bulunabilirsiniz. Her katkı bizim için ' +
        'çok değerli. ❤️ 🇹🇷</p>');
    });
  }
  window.openSupport = openSupport;

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#supportBtn') : null;
    if (t) { e.preventDefault(); openSupport(); }
  });

  /* ======================================================== KİLİT UYARILARI */
  function lockNotice(title, msg) {
    if (!(window.PWA && window.PWA.sheet)) { alert(msg); return; }
    window.PWA.sheet('🔒 ' + title, '', function (b) {
      b.insertAdjacentHTML('beforeend', '<p class="lock-msg">' + msg + '</p>');
    });
  }
  window.LUMIRA_LOCK = {
    level: function (need, featureName) {
      var lvl = myLevel();
      if (lvl >= need) return true;
      lockNotice(featureName,
        'Bu özelliği kullanmak için en az <b>' + need + '. seviye</b> olmalısın. ' +
        'Şu anki seviyen: <b>' + lvl + '</b>.<br><br>' +
        '🎯 <b>Kişisel</b> sekmesinden çalışarak seviyeni yükseltebilirsin.');
      return false;
    },
    pdfBadge: function () {
      if (hasAnyPdfBadge()) return true;
      lockNotice('Kelime listesi PDF',
        'Bu özellik için <b>💛</b>, <b>⭐️</b> veya <b>👑</b> rozetlerinden birine ' +
        'sahip olman gerekiyor.<br><br>Rozetleri ❤️ <b>Lumira\'yı Destekle</b> ' +
        'bölümünden edinebilirsin.');
      return false;
    },
    /* Herhangi bir destek rozeti yeterli olan özellikler için genel kilit
       (Çevrimdışı paket, Favoriler). En küçük rozet (👍🏻 Teşekkür) bile yeter. */
    anyBadge: function (featureName) {
      if (myBadges().length > 0) return true;
      lockNotice(featureName,
        'Bu özelliği kullanmak için herhangi bir destek rozetine sahip olman ' +
        'gerekiyor — en küçüğü bile (👍🏻 Teşekkür) yeterli.<br><br>Rozetleri ' +
        '❤️ <b>Lumira\'yı Destekle</b> bölümünden edinebilirsin.');
      return false;
    }
  };

  /* ============================================ KELİME LİSTESİ → PDF */
  var LANG_INFO = {
    de: { ad: 'Almanca',    yerel: 'Deutsch',  renk: '#c8901e', rtl: false },
    en: { ad: 'İngilizce',  yerel: 'English',  renk: '#1f63c8', rtl: false },
    ar: { ad: 'Arapça',     yerel: 'العربية',  renk: '#0f7a4e', rtl: true  },
    fr: { ad: 'Fransızca',  yerel: 'Français', renk: '#a3247c', rtl: false },
    es: { ad: 'İspanyolca', yerel: 'Español',  renk: '#c2410c', rtl: false },
    ru: { ad: 'Rusça',      yerel: 'Русский',  renk: '#5b34b3', rtl: false }
  };

  function collectWords(lang, level) {
    var out = [];
    try {
      var V = (typeof VOCAB !== 'undefined') ? VOCAB : null;
      if (!V) {
        V = new Function('try{return typeof VOCAB!=="undefined"?VOCAB:null}catch(e){return null}')();
      }
      if (!V) return out;
      for (var i = 0; i < V.length; i++) {
        var v = V[i];
        if (v.lang !== lang) continue;
        if (level !== 'TÜMÜ' && v.level !== level) continue;
        out.push({ w: v.w, tr: v.tr, cat: v.cat, level: v.level });
      }
    } catch (e) {}
    out.sort(function (a, b2) {
      return String(a.w).localeCompare(String(b2.w), 'tr', { sensitivity: 'base' });
    });
    return out;
  }

  function buildPdfHtml(lang, level, words) {
    var info = LANG_INFO[lang] || LANG_INFO.de;
    var bugun = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

    var rows = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      rows += '<div class="entry">' +
                '<span class="src">' + esc(w.w) + '</span>' +
                '<span class="dots"></span>' +
                '<span class="tr">' + esc(w.tr) + '</span>' +
              '</div>';
    }

    return '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">' +
      '<title>Lumira ' + info.ad + ' Kelime Listesi</title>' +
      '<style>' +
      '@page{size:A4;margin:18mm 16mm 20mm;}' +
      '*{box-sizing:border-box;}' +
      'body{margin:0;font-family:"Georgia","Times New Roman",serif;color:#1a1a1a;' +
      '     -webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.cover{height:100vh;display:flex;flex-direction:column;align-items:center;' +
      '       justify-content:center;text-align:center;page-break-after:always;}' +
      '.cover .brand{font-size:13pt;letter-spacing:.42em;color:' + info.renk + ';' +
      '       text-transform:uppercase;margin-bottom:26px;}' +
      '.cover h1{font-size:34pt;margin:0 0 6px;font-weight:700;letter-spacing:-.01em;}' +
      '.cover h2{font-size:15pt;margin:0;font-weight:400;color:#555;font-style:italic;}' +
      '.cover .rule{width:120px;height:2px;background:' + info.renk + ';margin:26px 0;}' +
      '.cover .meta{font-size:10.5pt;color:#666;line-height:1.9;}' +
      '.cover .foot{position:absolute;bottom:24mm;font-size:9pt;color:#888;}' +
      'h3.sec{font-size:11pt;letter-spacing:.28em;text-transform:uppercase;' +
      '       color:' + info.renk + ';border-bottom:1.5px solid ' + info.renk + ';' +
      '       padding-bottom:6px;margin:0 0 14px;}' +
      '.cols{column-count:2;column-gap:12mm;column-rule:.5pt solid #ddd;}' +
      '.entry{display:flex;align-items:baseline;font-size:10.5pt;line-height:1.62;' +
      '       break-inside:avoid;page-break-inside:avoid;padding:1.5px 0;}' +
      '.src{color:' + info.renk + ';font-weight:700;white-space:nowrap;' +
      (info.rtl ? 'direction:rtl;unicode-bidi:isolate;font-size:12pt;' : '') + '}' +
      '.dots{flex:1 1 auto;border-bottom:1px dotted #bbb;margin:0 5px;transform:translateY(-3px);}' +
      '.tr{color:#111;white-space:nowrap;}' +
      '@media print{.noprint{display:none !important;}}' +
      '.noprint{position:fixed;top:0;left:0;right:0;background:#0d1226;color:#fff;' +
      '   padding:12px 16px;font-family:system-ui,sans-serif;font-size:14px;text-align:center;z-index:9;}' +
      '.noprint button{font:inherit;font-weight:700;margin-left:10px;padding:8px 18px;' +
      '   border:0;border-radius:8px;background:#4fe8ff;color:#04050a;cursor:pointer;}' +
      '</style></head><body>' +
      '<div class="noprint">PDF olarak kaydetmek için yazdır penceresinden ' +
      '“PDF olarak kaydet” seçeneğini seçin.<button onclick="window.print()">Yazdır / PDF</button></div>' +
      '<div class="cover">' +
        '<div class="brand">Lumira · Dil Kartları</div>' +
        '<h1>' + info.ad + ' Kelime Listesi</h1>' +
        '<h2>' + esc(info.yerel) + ' — Türkçe</h2>' +
        '<div class="rule"></div>' +
        '<div class="meta">Seviye: <b>' + esc(level) + '</b><br>' +
          'Toplam <b>' + words.length + '</b> kelime<br>' + bugun + '</div>' +
        '<div class="foot">lumira-tr.com</div>' +
      '</div>' +
      '<h3 class="sec">' + info.ad + ' — Türkçe · ' + esc(level) + '</h3>' +
      '<div class="cols">' + rows + '</div>' +
      '</body></html>';
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function openPdfExport() {
    if (!window.LUMIRA_LOCK.anyBadge('Kelime listesi PDF')) return;
    if (!(window.PWA && window.PWA.sheet)) return;

    window.PWA.sheet('📄 Kelimeleri PDF olarak indir',
      'Dil ve seviye seç, kitap düzeninde bir kelime listesi oluşturulsun.', function (b) {

      var lang = 'de', level = 'TÜMÜ';

      function chipRow(label, items, current, onPick) {
        var wrap = document.createElement('div');
        wrap.className = 'pdf-row';
        wrap.innerHTML = '<span class="pdf-lbl">' + label + '</span>';
        var box = document.createElement('div');
        box.className = 'pdf-chips';
        items.forEach(function (it) {
          var c = document.createElement('button');
          c.type = 'button';
          c.className = 'pdf-chip' + (it.v === current() ? ' on' : '');
          c.textContent = it.t;
          c.onclick = function () {
            onPick(it.v);
            Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('on'); });
            c.classList.add('on');
          };
          box.appendChild(c);
        });
        wrap.appendChild(box);
        return wrap;
      }

      b.appendChild(chipRow('Dil', [
        { v: 'de', t: '🇩🇪 Almanca' }, { v: 'en', t: '🇬🇧 İngilizce' },
        { v: 'ar', t: '🇸🇦 Arapça' },  { v: 'fr', t: '🇫🇷 Fransızca' },
        { v: 'es', t: '🇪🇸 İspanyolca' }, { v: 'ru', t: '🇷🇺 Rusça' }
      ], function () { return lang; }, function (v) { lang = v; }));

      b.appendChild(chipRow('Seviye', [
        { v: 'TÜMÜ', t: 'Tümü' }, { v: 'A1', t: 'A1' }, { v: 'A2', t: 'A2' },
        { v: 'B1', t: 'B1' }, { v: 'B2', t: 'B2' }
      ], function () { return level; }, function (v) { level = v; }));

      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'pwa-btn';
      go.textContent = 'Listeyi oluştur';
      go.onclick = function () {
        go.disabled = true; go.textContent = 'Hazırlanıyor…';
        var finish = function () { go.disabled = false; go.textContent = 'Listeyi oluştur'; };

        var run = function () {
          var words = collectWords(lang, level);
          if (!words.length) { finish(); toast('Bu seçimde kelime bulunamadı', { kind: 'bad' }); return; }
          var html = buildPdfHtml(lang, level, words);
          var win = window.open('', '_blank');
          if (!win) {
            /* iOS PWA'da açılır pencere sık engellenir — gizli iframe ile yazdır */
            try {
              var ifr = document.createElement('iframe');
              ifr.setAttribute('aria-hidden', 'true');
              ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
              document.body.appendChild(ifr);
              var idoc = ifr.contentWindow.document;
              idoc.open(); idoc.write(html); idoc.close();
              finish();
              setTimeout(function () {
                try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch (e) {}
                setTimeout(function () { try { ifr.remove(); } catch (e) {} }, 60000);
              }, 500);
              toast('📄 ' + words.length + ' kelime hazır — yazdır menüsünden PDF olarak kaydet',
                    { kind: 'good', duration: 8000 });
            } catch (e) {
              finish();
              toast('Açılır pencere engellendi — tarayıcı ayarlarından izin ver', { kind: 'bad', duration: 7000 });
            }
            return;
          }
          win.document.open();
          win.document.write(html);
          win.document.close();
          finish();
          toast('📄 ' + words.length + ' kelime hazır — yazdır penceresinden PDF olarak kaydet',
                { kind: 'good', duration: 7000 });
        };

        /* Seçilen dilin sözlüğü yüklü değilse önce indir */
        if (window.VOCAB_LOADED && !window.VOCAB_LOADED[lang] && typeof window.ensureVocab === 'function') {
          window.ensureVocab(lang).then(run).catch(function () {
            finish(); toast('Sözlük yüklenemedi', { kind: 'bad' });
          });
        } else run();
      };
      b.appendChild(go);

      b.insertAdjacentHTML('beforeend',
        '<p class="pwa-note">Liste alfabetik sıralanır ve iki sütunlu sözlük düzeninde ' +
        'hazırlanır. Örnek cümleler yer almaz. Açılan pencerede “Yazdır” deyip ' +
        '<b>PDF olarak kaydet</b> seçeneğini seçebilir, oradan paylaşabilirsin.</p>');
    });
  }
  window.openPdfExport = openPdfExport;

  /* ====================================== ADMIN HEDİYE ROZETİ SENKRONU
     Admin bir kullanıcıya destek rozeti verdiğinde bunu Firebase'e yazar
     (progress/<uid>/meta/supportGrants/<tutar> = true). Burada o kayıt
     okunur ve rozet yerel listeye eklenir; böylece SATIN ALMIŞ GİBİ tüm
     özellikler (PDF, Profilim vb.) açılır ve "Lumira'yı Destekle"de görünür.
     XP ödülü admin tarafında bir kez eklenir; burada tekrar eklenmez. */
  function syncSupportGrants() {
    try {
      if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return;
      var u = firebase.auth().currentUser; if (!u) return;
      firebase.database().ref('progress/' + u.uid + '/meta/supportGrants').once('value').then(function (sn) {
        var g = sn.val() || {}; var list = myBadges(); var changed = false; var got = [];
        TIERS.forEach(function (t) {
          if (g[t.amount] && list.indexOf(t.badge) === -1) {
            list.push(t.badge); changed = true; got.push(t.badge + ' ' + t.name);
          }
        });
        if (changed) {
          store(KEY, list);
          toast('🎁 Sana rozet verildi: ' + got.join(', ') + ' · özellikler açıldı', { kind: 'good', duration: 8000 });
        }
      }).catch(function () {});
    } catch (e) {}
  }
  (function initGiftSync() {
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        firebase.auth().onAuthStateChanged(function (u) { if (u) syncSupportGrants(); });
      } else { setTimeout(initGiftSync, 800); }
    } catch (e) { setTimeout(initGiftSync, 800); }
  })();
})();
