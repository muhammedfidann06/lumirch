/* ============================================================================
   motion.js — Etkileşim, koreografi ve kültürel siluetler
   · Dil kartlarına ülke siluetlerini basar
   · Giriş sahnesini (splash sonrası) sıralı olarak açar
   · Görünüm (Kartlar/Quiz/Kişisel) geçişlerini yumuşatır
   · İmleç/parmak ışığı, manyetik butonlar, dokunsal geri bildirim

   Tüm kütüphaneler isteğe bağlıdır: GSAP veya Lenis yüklenmezse arayüz
   hiçbir şey kaybetmeden çalışmaya devam eder.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ======================================================================
     1 · KÜLTÜREL SİLUETLER
     Her yapı elle çizilmiş, tek renk, cam gibi. Amaç dekorasyon değil,
     kartın kimliğini bir bakışta okutmak.
     ==================================================================== */
  var LM = {};

  /* Almanya · Brandenburg Kapısı (üstünde Quadriga ile) */
  LM.de =
    '<path d="M6 62h88v4H6z"/>' +
    '<path d="M8 27h84v5H8z"/>' +
    '<path d="M30 21.5h40V27H30z"/>' +
    '<path d="M12 32h5.5v30H12zM26.4 32h5.5v30h-5.5zM40.8 32h5.5v30h-5.5z' +
      'M55.2 32h5.5v30h-5.5zM69.6 32h5.5v30h-5.5zM84 32h5.5v30H84z"/>' +
    /* quadriga: dört at + arabacı */
    '<g>' +
    '<path d="M36 21.5v-5.2l1.4-1 .7-2.3 1.6.5-.4 1.9 1.5 1.2v4.9h-1.5v-3.1h-1.8v3.1z"/>' +
    '<path d="M41.5 21.5v-5.2l1.4-1 .7-2.3 1.6.5-.4 1.9 1.5 1.2v4.9H45v-3.1h-1.8v3.1z"/>' +
    '<path d="M47 21.5v-5.2l1.4-1 .7-2.3 1.6.5-.4 1.9 1.5 1.2v4.9h-1.5v-3.1h-1.8v3.1z"/>' +
    '<path d="M52.5 21.5v-5.2l1.4-1 .7-2.3 1.6.5-.4 1.9 1.5 1.2v4.9H56v-3.1h-1.8v3.1z"/>' +
    '<path d="M58.5 21.5v-6h6.4v6z"/>' +
    '<circle cx="61.7" cy="18.6" r="2.6" fill="none" stroke="currentColor" stroke-width="1"/>' +
    '<path d="M60.6 15.5v-4.2h2.2v4.2z"/>' +
    '<circle cx="61.7" cy="9.6" r="1.7"/>' +
    '</g>';

  /* İngiltere · Big Ben + Parlamento */
  LM.en =
    '<path d="M4 66h92v2H4z"/>' +
    /* parlamento gövdesi */
    '<path d="M10 50h48v16H10z"/>' +
    '<path d="M12 46h3v4h-3zM20 46h3v4h-3zM28 46h3v4h-3zM36 46h3v4h-3zM44 46h3v4h-3zM52 46h3v4h-3z"/>' +
    /* victoria kulesi */
    '<path d="M12 36h13v30H12z"/><path d="M11 36l7.5-9 7.5 9z"/>' +
    /* big ben */
    '<path d="M60 30h22v36H60z"/>' +
    '<path d="M61.5 24h19v6h-19z"/>' +
    '<path d="M62 24l9-19 9 19z"/>' +
    '<path d="M70 5.5h2V1h-2z"/>' +
    '<path fill-rule="evenodd" d="M71 29.5a7.4 7.4 0 1 1 0 14.8 7.4 7.4 0 0 1 0-14.8zm0 2a5.4 5.4 0 1 0 0 10.8 5.4 5.4 0 0 0 0-10.8z"/>' +
    '<path d="M70.4 33h1.2v4.2h-1.2zM71 36.4h4v1.2h-4z"/>' +
    '<path d="M62 46h18v2H62zM62 52h18v2H62z"/>';

  /* Fransa · Eyfel Kulesi */
  LM.fr =
    '<path d="M4 66h92v2H4z"/>' +
    '<path d="M20 66C28 46 40 30 46 9h8c6 21 18 37 26 57h-12C62 46 56 31 52 14h-4C44 31 38 46 32 66z"/>' +
    '<path d="M28 42h44v3.6H28zM38 26h24v3.2H38zM45 15h10v2.6H45z"/>' +
    '<path d="M30 62q20-20 40 0h-6q-14-13-28 0z"/>' +
    '<path d="M49 9h2V0h-2z"/>' +
    '<g opacity=".55">' +
    '<path d="M33 60l34-.2v1.1l-34 .2zM36 54l28-.2v1l-28 .2zM39.5 48l21-.2v1l-21 .2z"/>' +
    '<path d="M41 42.5l6 16.5-1 .4-6-16.5zM59 42.5l-6 16.5 1 .4 6-16.5z"/>' +
    '<path d="M43 29.5l3.6 11.5-1 .3L42 29.8zM57 29.5L53.4 41l1 .3L58 29.8z"/>' +
    '</g>';

  /* İspanya · Sagrada Família */
  LM.es =
    '<path d="M4 66h92v2H4z"/>' +
    '<path d="M20 52h72v14H20z"/>' +
    '<path d="M24 66V30l3.5-7 3.5 7v36zM38 66V19l4-8 4 8v47zM53 66V13l4.5-9 4.5 9v53zM70 66V24l3.8-7.5L77.6 24v42zM83 66V34l3.2-6.4L89.4 34v32z"/>' +
    '<g opacity=".6">' +
    '<path d="M24 40h7v1.6h-7zM24 48h7v1.6h-7zM38 32h8v1.6h-8zM38 42h8v1.6h-8z' +
      'M53 26h9v1.6h-9zM53 37h9v1.6h-9zM70 36h7.6v1.6H70zM83 44h6.4v1.6H83z"/>' +
    '</g>' +
    '<circle cx="27.5" cy="21" r="1.5"/><circle cx="42" cy="9.5" r="1.7"/>' +
    '<circle cx="57.5" cy="2.6" r="1.9"/><circle cx="73.8" cy="15" r="1.6"/>' +
    '<circle cx="86.2" cy="26" r="1.4"/>' +
    /* kemerli giriş */
    '<path d="M52 66V58a6 6 0 0 1 12 0v8z" opacity=".45"/>';

  /* Rusya · Aziz Vasil Katedrali */
  LM.ru =
    '<path d="M4 66h92v2H4z"/>' +
    '<path d="M14 52h74v14H14z"/>' +
    /* merkez çadır kule */
    '<path d="M43 52V30h14v22z"/>' +
    '<path d="M50 8l9 22H41z"/>' +
    '<path d="M49.2 8h1.6V3.4h-1.6zM47.6 5h4.8v1.5h-4.8z"/>' +
    /* soğan kubbeler */
    '<path d="M22 46c-6-4-7-9-3-12.5 2.4-2 4.6-3.4 5.5-6.5.9 3.1 3.1 4.5 5.5 6.5 4 3.5 3 8.5-3 12.5z"/>' +
    '<path d="M24 27h1.5v-4H24zM22.7 24.4h4.1v1.4h-4.1z"/>' +
    '<path d="M22 46h6v6h-6z"/>' +
    '<path d="M70 48c-5.4-3.6-6.3-8.1-2.7-11.2 2.2-1.8 4.1-3.1 4.9-5.8.8 2.7 2.7 4 4.9 5.8 3.6 3.1 2.7 7.6-2.7 11.2z"/>' +
    '<path d="M71.7 31h1.4v-3.6h-1.4zM70.5 28.7h3.8v1.3h-3.8z"/>' +
    '<path d="M70 48h5.4v4h-5.4z"/>' +
    '<path d="M85 52c-4.4-2.9-5.1-6.6-2.2-9.1 1.8-1.5 3.3-2.5 4-4.7.7 2.2 2.2 3.2 4 4.7 2.9 2.5 2.2 6.2-2.2 9.1z"/>' +
    '<path d="M86.1 38h1.2v-3h-1.2z"/>' +
    '<path d="M36 52c-4.4-2.9-5.1-6.6-2.2-9.1 1.8-1.5 3.3-2.5 4-4.7.7 2.2 2.2 3.2 4 4.7 2.9 2.5 2.2 6.2-2.2 9.1z"/>' +
    '<path d="M37.1 38h1.2v-3h-1.2z"/>' +
    '<g opacity=".5"><path d="M14 56h74v1.6H14zM20 61h62v1.4H20z"/></g>';

  /* Arapça · Riyad silüeti — Kingdom Centre, kubbe, minareler, kum tepeleri */
  LM.ar =
    '<path d="M0 66h100v2H0z"/>' +
    /* Kingdom Centre */
    '<path fill-rule="evenodd" d="M60 66V30c0-11 24-11 24 0v36h-6V34c0-6-12-6-12 0v32z"/>' +
    '<path d="M60 24.5h24V28H60z"/>' +
    /* kubbe + gövde */
    '<path d="M20 52h24v14H20z"/>' +
    '<path d="M20.5 52a11.5 11.5 0 0 1 23 0z"/>' +
    '<path d="M31.4 40.5h1.4v-4h-1.4z"/>' +
    '<path d="M28 66v-7a4 4 0 0 1 8 0v7z" opacity=".45"/>' +
    /* minareler */
    '<path d="M13 34h4.4v32H13z"/><path d="M12.4 34a2.8 2.8 0 0 1 5.6 0z"/>' +
    '<path d="M47 38h3.6v28H47z"/><path d="M46.5 38a2.3 2.3 0 0 1 4.6 0z"/>' +
    /* kum tepeleri */
    '<path d="M0 66Q18 57.5 36 62.5Q54 67.5 70 60Q86 53.5 100 60V70H0Z" opacity=".5"/>';

  function injectLandmarks() {
    var cards = document.querySelectorAll('.lang-opt');
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      var code = el.getAttribute('data-lang');
      if (!code || !LM[code] || el.querySelector('.lang-lm')) continue;

      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'lang-lm');
      svg.setAttribute('viewBox', '0 0 100 68');
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('preserveAspectRatio', 'xMaxYMax meet');
      svg.innerHTML = LM[code];
      el.insertBefore(svg, el.firstChild);

      /* seçiliyken çalışan ışık / sis / parçacık katmanı */
      var fx = document.createElement('div');
      fx.className = 'lm-fx';
      fx.setAttribute('aria-hidden', 'true');
      fx.innerHTML = '<span class="shine"></span><span class="haze"></span><i></i><i></i><i></i>';
      el.insertBefore(fx, el.firstChild);
    }
  }

  /* ======================================================================
     2 · İMLEÇ IŞIĞI VE MANYETİK BUTONLAR — KALDIRILDI

     Bu iki özellik iki sebeple çıkarıldı:

     1) Tasarım kararı: Hover artık sadece hafif translateY + gölge +
        ince kenar aydınlatması yapıyor (sky.css Bölüm 5). Kalıcı olarak
        imleci izleyen bir ışık veya butonun imlece doğru kayması,
        "sakin ve premium" yerine "dikkat çeken efekt" hissi veriyordu.

     2) Gerçek bir performans hatası: magnetize() her .ctrl butonuna
        THROTTLE'SIZ bir pointermove dinleyicisi bağlıyor ve her olayda
        doğrudan inline transform yazıyordu. Fare hareketi genelde
        requestAnimationFrame'den çok daha sık tetiklenir; bu da saniyede
        yüzlerce gereksiz stil güncellemesi ve — komşu öğelerdeki
        backdrop-filter ile birleşince — masaüstünde hissedilir bir
        "kasma" anlamına geliyordu. Kaldırılması hem tasarım hem
        performans için doğruydu.
     ==================================================================== */

  function haptic(ms) {
    if (navigator.vibrate && !reduceMotion) { try { navigator.vibrate(ms || 8); } catch (e) {} }
  }
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('.lang-opt, .tab, .level-opt, .chip, .ctrl, #card')) haptic(7);
  }, { passive: true });

  /* ======================================================================
     5 · GÖRÜNÜM GEÇİŞLERİ
     Mevcut setDisplay() sarmalanır: bir bölüm görünür olduğunda aşağıdan
     yumuşakça belirir. Uygulama mantığına hiç dokunulmaz.
     ==================================================================== */
  function wrapSetDisplay() {
    var original = window.setDisplay;
    if (typeof original !== 'function' || original.__wrapped) return;

    var wrapped = function (id, val) {
      var el = document.getElementById(id);
      var wasHidden = el && (el.style.display === 'none' || getComputedStyle(el).display === 'none');
      original(id, val);
      if (el && wasHidden && val !== 'none' && !reduceMotion) {
        el.classList.remove('view-enter');
        void el.offsetWidth;             // reflow → animasyon yeniden başlar
        el.classList.add('view-enter');
      }
    };
    wrapped.__wrapped = true;
    window.setDisplay = wrapped;
  }

  /* ======================================================================
     6 · GİRİŞ KOREOGRAFİSİ
     Splash kapandığında arayüz tek parça halinde değil, katman katman gelir.
     GSAP varsa yay eğrisiyle; yoksa CSS ile aynı sıra korunur.
     ==================================================================== */
  var entranceDone = false;

  function entrance() {
    if (entranceDone) return;
    entranceDone = true;

    var groups = [
      document.querySelector('.top-row'),
      document.getElementById('langPair'),
      document.querySelector('.sub'),
      document.getElementById('levelBox'),
      document.querySelector('.tabs'),
      document.getElementById('chips'),
      document.querySelector('.progress-row'),
      document.querySelector('.bar')
    ].filter(Boolean);

    if (reduceMotion) return;

    if (window.gsap) {
      var tl = window.gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from(groups, {
        y: 26, opacity: 0, duration: .9, stagger: .075, clearProps: 'all'
      });
      /* dil kartları tek tek, hafif ölçek ile */
      var cards = document.querySelectorAll('.lang-opt');
      if (cards.length) {
        tl.from(cards, {
          y: 18, opacity: 0, scale: .94, duration: .7,
          stagger: { each: .045, from: 'start' }, clearProps: 'all'
        }, '-=.65');
      }
      var stage = document.querySelector('.stage');
      if (stage) tl.from(stage, { y: 34, opacity: 0, duration: 1, clearProps: 'all' }, '-=.55');
    } else {
      for (var i = 0; i < groups.length; i++) {
        groups[i].style.animation = 'viewEnter .8s cubic-bezier(.16,1,.3,1) both';
        groups[i].style.animationDelay = (i * 0.07).toFixed(2) + 's';
      }
    }

    /* sahneye giriş anını bir kayan yıldızla işaretle */
    setTimeout(function () {
      if (window.spawnShootingStar) window.spawnShootingStar();
    }, 900);
  }

  function watchSplash() {
    var splash = document.getElementById('splash');
    if (!splash) { entrance(); return; }

    var check = function () {
      var s = getComputedStyle(splash);
      if (s.display === 'none' || s.opacity === '0' || s.visibility === 'hidden' ||
          splash.classList.contains('hidden') || !splash.isConnected) {
        entrance();
        return true;
      }
      return false;
    };
    if (check()) return;

    var mo = new MutationObserver(function () {
      if (check()) mo.disconnect();
    });
    mo.observe(splash, { attributes: true, attributeFilter: ['style', 'class'] });
    if (splash.parentNode) mo.observe(splash.parentNode, { childList: true });

    /* güvenlik ağı: gözlemci kaçırırsa tıklamadan kısa süre sonra çalıştır */
    splash.addEventListener('click', function () { setTimeout(entrance, 700); }, { once: true });
  }

  /* ======================================================================
     7 · DİL DEĞİŞİMİ ANI
     Yeni dil seçildiğinde kart bir kez "nefes alır" ve gökyüzünden bir
     yıldız kayar. Seçim geri bildirimi görsel olarak ödüllendirici olur.
     ==================================================================== */
  function bindLanguageMoment() {
    var box = document.getElementById('langBox');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.lang-opt') : null;
      if (!card || reduceMotion) return;
      haptic(12);
      card.classList.remove('lang-pop');
      void card.offsetWidth;
      card.classList.add('lang-pop');
      if (window.spawnShootingStar) setTimeout(window.spawnShootingStar, 160);
    }, { passive: true });
  }

  /* ======================================================================
     8 · YUMUŞAK KAYDIRMA (yalnızca imleçli cihazlar)
     Mobilde native momentum kaydırma her zaman daha iyidir; orada devreye
     girmez.
     ==================================================================== */
  function initLenis() {
    if (!fine || reduceMotion || !window.Lenis) return;
    try {
      var lenis = new window.Lenis({
        duration: 1.05,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        smoothTouch: false
      });
      var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    } catch (e) {}
  }

  /* ======================================================================
     9 · QUIZ GERİ BİLDİRİMİ
     Doğru cevap ödüllendirici, yanlış cevap uyarıcı ama cezalandırıcı
     olmayan bir his vermeli. Görsel kısmı CSS'te; burada zamanlama,
     titreşim ve gökyüzü tepkisi var.
     ==================================================================== */
  function bindQuizFeedback() {
    var box = document.getElementById('options');
    if (!box) return;

    box.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('.opt') : null;
      if (!opt) return;
      /* sınıflar uygulama tarafından bu tıklamadan hemen sonra eklenir */
      setTimeout(function () {
        if (opt.classList.contains('correct')) {
          haptic(16);
          if (window.spawnShootingStar) window.spawnShootingStar();
          var pill = document.getElementById('scorePill');
          if (pill && !reduceMotion) {
            pill.classList.remove('pulse');
            void pill.offsetWidth;
            pill.classList.add('pulse');
          }
        } else if (opt.classList.contains('wrong')) {
          if (navigator.vibrate && !reduceMotion) {
            try { navigator.vibrate([10, 55, 10]); } catch (err) {}
          }
        }
      }, 40);
    }, { passive: true });
  }

  /* ======================================================================
     10 · KART IŞIĞI
     Kelime kartı çevrildiğinde yüzeyinden bir ışık geçer — çevirme
     hareketine ağırlık ve malzeme hissi katar.
     ==================================================================== */
  function bindCardSweep() {
    var card = document.getElementById('card');
    if (!card || reduceMotion) return;
    card.addEventListener('click', function () {
      card.classList.remove('sweep');
      void card.offsetWidth;
      card.classList.add('sweep');
    }, { passive: true });
  }

  /* ======================================================================
     11 · LİSTELERİN SIRAYLA BELİRMESİ
     Quiz şıkları ve kategori listesi çalışma anında üretiliyor. Hepsinin
     aynı anda "patlaması" yerine sırayla gelmesi ekranı okunur kılar.
     ==================================================================== */
  function stagger(container, selector, step) {
    if (!container || reduceMotion) return;
    var items = container.querySelectorAll(selector);
    for (var i = 0; i < items.length && i < 24; i++) {
      (function (el, idx) {
        el.style.animation = 'viewEnter .5s cubic-bezier(.16,1,.3,1) both';
        el.style.animationDelay = (idx * (step || 0.045)).toFixed(3) + 's';
        /* Satır içi animation, stil sayfasındaki .opt.correct / .opt.wrong
           animasyonlarından daha güçlüdür. Giriş bitince temizlenmezse
           cevap geri bildirimi hiç oynamaz. */
        var clear = function () {
          el.style.animation = '';
          el.style.animationDelay = '';
          el.removeEventListener('animationend', clear);
        };
        el.addEventListener('animationend', clear);
        setTimeout(clear, 1400);   // animationend kaçarsa güvenlik ağı
      })(items[i], i);
    }
  }

  function watchDynamicLists() {
    if (reduceMotion) return;
    [['options', '.opt', 0.05], ['catGrid', '.chip', 0.02]].forEach(function (cfg) {
      var host = document.getElementById(cfg[0]);
      if (!host) return;
      var mo = new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          if (recs[i].addedNodes && recs[i].addedNodes.length) {
            stagger(host, cfg[1], cfg[2]);
            return;
          }
        }
      });
      mo.observe(host, { childList: true });
    });
  }

  /* ------------------------------------------------------------- başlangıç */
  function init() {
    document.documentElement.classList.add('motion-ready');
    injectLandmarks();
    wrapSetDisplay();
    bindLanguageMoment();
    bindQuizFeedback();
    bindCardSweep();
    watchDynamicLists();
    initLenis();
    watchSplash();

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
