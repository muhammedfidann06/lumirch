/* ============================================================================
   theme.js — "Ay Işığı Kıyısı" sahnesinin hareketli parçaları

   Arayüz mantığına dokunmaz. Eklediği şeyler:
     1. #scene-bg   manzara katmanı (+ hafif parallax)
     2. #sky-fx     EN ARKA PLAN: birkaç ateş böceği + seyrek kayan yıldız
                    (parıldayan yıldız alanı kaldırıldı — performans)
     3. #fg-desk    kahve · açık defter · kitap yığını
     4. .flutter    kelebekler (en arka planda, hızlı kanat çırpan)
     5. ilerleme satırı tek hizaya alınır
     6. dil kartlarına ülke silueti  (neon RGB halka kaldırıldı)
     7. butonlara basınca dalga (ripple) + yaylı çöküş
   ========================================================================== */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ====================================================== 1. manzara katmanı */
  function sceneLayer() {
    if (document.getElementById('scene-bg')) return document.getElementById('scene-bg');
    var bg = document.createElement('div');
    bg.id = 'scene-bg';
    bg.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bg, document.body.firstChild);
    return bg;
  }

  function parallax(bg) {
    if (!bg || reduce) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, queued = false;

    function apply() {
      queued = false;
      cx += (tx - cx) * 0.055;
      cy += (ty - cy) * 0.055;
      bg.style.transform =
        'translate3d(' + (cx * 9).toFixed(2) + 'px,' +
        (cy * 7).toFixed(2) + 'px,0) scale(1.06)';
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) req();
    }
    function req() { if (!queued) { queued = true; requestAnimationFrame(apply); } }

    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      req();
    }, { passive: true });

    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 32));
      ty = Math.max(-1, Math.min(1, ((e.beta || 42) - 42) / 32));
      req();
    }, { passive: true });

    /* Kaydırma sırasında arka plan sabit kalır: sayfa akıcı, cihaz yorulmaz. */
  }

  /* ================================ 2. ateş böcekleri + kayan yıldızlar
     Parıldayan yıldız alanı (140 adet) TAMAMEN kaldırıldı: kaydırma
     sırasında titreme yapıyor ve pili gereksiz tüketiyordu.

     Geriye iki hafif şey kaldı:
       · birkaç ateş böceği — alt yarıda salınır, sıcak sarı ışıkları
         yavaşça sönüp yanar.
       · 10–20 sn'de bir tek bir kayan yıldız — üst yarıda, kısa iz bırakır.
         Ekranda aynı anda en fazla 1 tane olur; maliyeti yok denecek kadar az.

     Katman en arkada (z-index 0) — arayüzün ve panellerin altında.
  ========================================================================= */
  var fx = null;

  function FX() {
    var cv = document.createElement('canvas');
    cv.id = 'sky-fx';
    cv.setAttribute('aria-hidden', 'true');
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1;
    var flies = [], shots = [], t0 = performance.now();
    var nextShot = performance.now() + 4000;

    function seedFlies() {
      flies.length = 0;
      /* az sayıda: telefonda ~7, geniş ekranda en fazla 9 */
      var n = Math.max(6, Math.round(Math.min(9, W / 95 + 3)));
      for (var i = 0; i < n; i++) {
        flies.push({
          x: Math.random() * W,
          y: H * 0.52 + Math.random() * H * 0.44,
          /* iki farklı frekansta salınım → düz çizgi yerine gerçek uçuş */
          ax: 12 + Math.random() * 30, ay: 8 + Math.random() * 22,
          fx: 0.16 + Math.random() * 0.30, fy: 0.22 + Math.random() * 0.36,
          px: Math.random() * 6.28, py: Math.random() * 6.28,
          dx: (Math.random() - 0.5) * 5, dy: (Math.random() - 0.5) * 2.4,
          r: 1.2 + Math.random() * 1.5,
          bs: 0.30 + Math.random() * 0.55,
          bp: Math.random() * 6.28
        });
      }
    }

    function spawnShot() {
      /* üst yarıda, aşağı-yana doğru; ince ve hızlı */
      var fromLeft = Math.random() < 0.62;
      var ang = (fromLeft ? 0.30 : 0.62) + Math.random() * 0.22;   /* radyan */
      shots.push({
        x: fromLeft ? -40 + Math.random() * W * 0.5 : W * 0.45 + Math.random() * W * 0.5,
        y: -20 + Math.random() * H * 0.24,
        vx: Math.cos(ang) * (620 + Math.random() * 420),
        vy: Math.sin(ang) * (620 + Math.random() * 420),
        life: 0,
        max: 0.62 + Math.random() * 0.4,
        len: 90 + Math.random() * 130
      });
    }

    function resize() {
      /* 1.5 üstü piksel oranı bu efekt için gereksiz — boşuna yük */
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedFlies();
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      /* ---- kayan yıldız: 10–20 sn'de bir, aynı anda tek ---- */
      if (now > nextShot) {
        if (!shots.length) spawnShot();
        nextShot = now + 10000 + Math.random() * 10000;
      }
      for (var k = shots.length - 1; k >= 0; k--) {
        var sh = shots[k];
        sh.life += 1 / 60;
        sh.x += sh.vx / 60; sh.y += sh.vy / 60;
        if (sh.life > sh.max || sh.x > W + 200 || sh.y > H * 0.7) { shots.splice(k, 1); continue; }

        var fade = 1 - sh.life / sh.max;
        var m = Math.hypot(sh.vx, sh.vy) || 1;
        var qx = sh.x - (sh.vx / m) * sh.len;
        var qy = sh.y - (sh.vy / m) * sh.len;
        var lg = ctx.createLinearGradient(sh.x, sh.y, qx, qy);
        lg.addColorStop(0, 'rgba(255,255,255,' + (0.92 * fade).toFixed(3) + ')');
        lg.addColorStop(0.35, 'rgba(190,225,255,' + (0.42 * fade).toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(160,200,255,0)');
        ctx.strokeStyle = lg;
        ctx.lineWidth = 2.1;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(qx, qy); ctx.stroke();

        var hg = ctx.createRadialGradient(sh.x, sh.y, 0, sh.x, sh.y, 9);
        hg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * fade).toFixed(3) + ')');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(sh.x, sh.y, 9, 0, 6.2832); ctx.fill();
      }

      /* ---- ateş böcekleri ---- */
      for (var j = 0; j < flies.length; j++) {
        var f = flies[j];
        var fxp = f.x + f.dx * t + Math.sin(t * f.fx * 6.28 + f.px) * f.ax;
        var fyp = f.y + f.dy * t + Math.sin(t * f.fy * 6.28 + f.py) * f.ay;

        /* kenardan çıkanı öbür taraftan geri al */
        if (fxp < -30) { f.x += W + 60; } else if (fxp > W + 30) { f.x -= W + 60; }
        if (fyp < H * 0.46) { f.y += 40; } else if (fyp > H + 30) { f.y -= 60; }

        var b = 0.5 + 0.5 * Math.sin(t * 1.5 + f.bp);
        b = Math.pow(b, 2.2) * f.bs;                 /* keskin yanıp sönme */
        if (b < 0.02) continue;

        var gg = ctx.createRadialGradient(fxp, fyp, 0, fxp, fyp, f.r * 9);
        gg.addColorStop(0, 'rgba(255,232,150,' + (b * 0.95).toFixed(3) + ')');
        gg.addColorStop(0.30, 'rgba(255,196,86,' + (b * 0.42).toFixed(3) + ')');
        gg.addColorStop(1, 'rgba(255,180,70,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(fxp, fyp, f.r * 9, 0, 6.2832); ctx.fill();

        ctx.fillStyle = 'rgba(255,246,206,' + Math.min(1, b * 1.5).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(fxp, fyp, f.r, 0, 6.2832); ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    var raf = 0;
    function start() { if (!raf) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    /* Konsoldan denemek için:
         THEME_shoot()  → hemen bir kayan yıldız gönderir
         THEME_debug()  → sahnedeki nesne sayılarını verir              */
    window.THEME_shoot = function () { spawnShot(); };
    window.THEME_debug = function () {
      return { atesbocegi: flies.length, kayan: shots.length, yildiz: 0 };
    };

    return {
      el: cv,
      mount: function () {
        var grade = document.getElementById('grade');
        if (grade && grade.parentNode) grade.parentNode.insertBefore(cv, grade);
        else document.body.insertBefore(cv, document.body.firstChild);
        resize();
        window.addEventListener('resize', resize, { passive: true });
        if (reduce) { frameOnce(); } else { start(); }
      },
      pause: stop,
      resume: function () { if (!reduce) start(); }
    };

    function frameOnce() { frame(performance.now()); stop(); }
  }

  /* ========================================================== 3. masa & eşya */
  function deskSVG() {
    var s = '';
    s +=
      '<defs>' +
        '<linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#f6f1e4"/><stop offset="100%" stop-color="#d9d2c2"/>' +
        '</linearGradient>' +
        '<linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#eee7d7"/><stop offset="100%" stop-color="#cdc5b4"/>' +
        '</linearGradient>' +
        '<linearGradient id="mug" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0" stop-color="#1b2748"/><stop offset="42%" stop-color="#33436e"/>' +
          '<stop offset="100%" stop-color="#141d3a"/>' +
        '</linearGradient>' +
        '<radialGradient id="warm">' +
          '<stop offset="0" stop-color="rgba(255,186,102,.5)"/>' +
          '<stop offset="100%" stop-color="rgba(255,170,80,0)"/>' +
        '</radialGradient>' +
      '</defs>';

    s += '<ellipse cx="128" cy="207" rx="86" ry="15" fill="rgba(3,6,18,.55)"/>';
    s += '<ellipse cx="452" cy="214" rx="215" ry="17" fill="rgba(3,6,18,.5)"/>';
    s += '<ellipse cx="768" cy="212" rx="125" ry="16" fill="rgba(3,6,18,.55)"/>';

    /* açık defter */
    s += '<path d="M258 206 L300 146 L452 158 L452 206 Z" fill="url(#pg)"/>';
    s += '<path d="M646 206 L604 146 L452 158 L452 206 Z" fill="url(#pg2)"/>';
    s += '<path d="M258 206 L300 146 L452 158 L452 206 Z" fill="none" stroke="rgba(20,16,10,.45)" stroke-width="1.6"/>';
    s += '<path d="M646 206 L604 146 L452 158 L452 206 Z" fill="none" stroke="rgba(20,16,10,.45)" stroke-width="1.6"/>';
    s += '<path d="M452 158 V206" stroke="rgba(60,50,34,.55)" stroke-width="2.4"/>';
    s += '<path d="M258 206 L452 206 L452 212 L262 212 Z" fill="rgba(222,214,196,.9)"/>';
    s += '<path d="M646 206 L452 206 L452 212 L642 212 Z" fill="rgba(210,202,184,.9)"/>';
    s += '<g stroke="rgba(46,52,74,.5)" stroke-width="1.5" stroke-linecap="round">';
    for (var i = 0; i < 5; i++) {
      var y = 168 + i * 8;
      s += '<path d="M' + (296 - i * 6) + ' ' + y + ' L' + (430 - i) + ' ' + (y + 1.4) + '"/>';
      s += '<path d="M' + (608 + i * 6) + ' ' + y + ' L' + (474 + i) + ' ' + (y + 1.4) + '"/>';
    }
    s += '</g>';

    /* kalem */
    s += '<g transform="rotate(-9 560 186)">' +
      '<path d="M498 186 h96 v7 h-96 z" fill="#1d2748"/>' +
      '<path d="M594 186 l16 3.5 -16 3.5 z" fill="#e8eefc"/>' +
      '<path d="M498 186 h12 v7 h-12 z" fill="#c8d4ee"/>' +
      '</g>';

    /* kitap yığını */
    function book(x, y, w, h, cover, edge) {
      var g = '<path d="M' + x + ' ' + y + ' h' + w + ' v' + h + ' h-' + w + ' z" fill="' + cover + '"/>';
      g += '<path d="M' + (x + 4) + ' ' + (y + 3) + ' h' + (w - 8) + '" stroke="' + edge + '" stroke-width="1.6" opacity=".55"/>';
      g += '<path d="M' + x + ' ' + (y + h - 5) + ' h' + w + '" stroke="rgba(240,232,208,.85)" stroke-width="3.4"/>';
      return g;
    }
    s += book(660, 178, 216, 30, '#20305e', 'rgba(255,214,150,.7)');
    s += book(672, 152, 196, 28, '#4a2246', 'rgba(255,214,150,.6)');
    s += '<g transform="rotate(-2.5 776 140)">' + book(682, 126, 184, 27, '#1a3a5c', 'rgba(255,214,150,.6)') + '</g>';
    s += '<g stroke="rgba(255,220,160,.28)" stroke-width="1.2">' +
         '<path d="M700 134 h150"/><path d="M700 140 h120"/></g>';

    /* kahve fincanı */
    s += '<ellipse cx="128" cy="196" rx="72" ry="16" fill="url(#warm)"/>';
    s += '<path d="M178 148 C214 146 214 186 176 184" fill="none" stroke="#22304f" stroke-width="12" stroke-linecap="round"/>';
    s += '<path d="M62 132 h124 l-11 62 a14 14 0 0 1 -14 11 h-74 a14 14 0 0 1 -14 -11 z" fill="url(#mug)"/>';
    s += '<ellipse cx="124" cy="132" rx="62" ry="14" fill="#0f1730"/>';
    s += '<ellipse cx="124" cy="132" rx="62" ry="14" fill="none" stroke="rgba(196,220,255,.5)" stroke-width="2"/>';
    s += '<ellipse cx="124" cy="134" rx="53" ry="11" fill="#31180d"/>';
    s += '<ellipse cx="124" cy="134" rx="53" ry="11" fill="none" stroke="rgba(255,190,120,.35)" stroke-width="1.4"/>';
    s += '<ellipse cx="106" cy="132" rx="18" ry="4" fill="rgba(255,208,150,.18)"/>';
    s += '<g class="steam" fill="none" stroke="rgba(220,236,255,.55)" stroke-width="3" stroke-linecap="round">' +
      '<path d="M100 118 C90 100 112 92 102 72"/>' +
      '<path d="M126 114 C116 94 138 86 128 64"/>' +
      '<path d="M152 118 C142 100 164 92 154 72"/>' +
      '</g>';

    /* taç yapraklar */
    var petals = [[212, 214], [246, 200], [330, 216], [560, 214], [640, 200], [706, 216], [880, 206]];
    for (var p = 0; p < petals.length; p++) {
      s += '<ellipse cx="' + petals[p][0] + '" cy="' + petals[p][1] + '" rx="9" ry="4.5" ' +
           'fill="rgba(226,140,196,.55)" transform="rotate(' + (p * 37 % 70 - 35) + ' ' +
           petals[p][0] + ' ' + petals[p][1] + ')"/>';
    }
    return s;
  }

  function buildDesk() {
    if (document.getElementById('fg-desk')) return;
    var host = document.createElement('div');
    host.id = 'fg-desk';
    host.setAttribute('aria-hidden', 'true');

    var el = document.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 900 226');
    el.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = deskSVG();
    host.appendChild(el);

    var grain = document.getElementById('grain');
    if (grain && grain.parentNode) grain.parentNode.insertBefore(host, grain.nextSibling);
    else document.body.insertBefore(host, document.body.firstChild);
  }

  /* ============================================================ 4. kelebekler */
  function butterflySVG(a, b, body) {
    return '' +
      '<svg viewBox="0 0 64 52" width="100%" height="100%">' +
        '<g class="wing l">' +
          '<path d="M31 26 C18 4 2 6 5 20 C7 31 20 30 31 26 Z" fill="' + a + '"/>' +
          '<path d="M31 27 C20 34 8 40 12 47 C17 52 28 41 31 30 Z" fill="' + b + '"/>' +
        '</g>' +
        '<g class="wing r">' +
          '<path d="M33 26 C46 4 62 6 59 20 C57 31 44 30 33 26 Z" fill="' + a + '"/>' +
          '<path d="M33 27 C44 34 56 40 52 47 C47 52 36 41 33 30 Z" fill="' + b + '"/>' +
        '</g>' +
        '<ellipse cx="32" cy="28" rx="2.4" ry="11" fill="' + body + '"/>' +
        '<path d="M32 18 C29 11 26 9 24 8" stroke="' + body + '" stroke-width="1.4" fill="none"/>' +
        '<path d="M32 18 C35 11 38 9 40 8" stroke="' + body + '" stroke-width="1.4" fill="none"/>' +
      '</svg>';
  }

  var FLIES = [
    { c: 'f1', x: 52, y: 13.0, w: 30, a: '#41c8ff', b: '#1f7ce0', d: '#0c2246' },
    { c: 'f2', x: 10, y: 25.5, w: 24, a: '#57d2ff', b: '#2a8de8', d: '#0c2246' },
    { c: 'f3', x: 41, y: 26.5, w: 20, a: '#8ee6ff', b: '#49a8f0', d: '#0c2246' },
    { c: 'f4', x: 6,  y: 39.0, w: 22, a: '#c08bff', b: '#7a3ee0', d: '#1a0d33' },
    { c: 'f5', x: 86, y: 39.5, w: 40, a: '#ff9d3c', b: '#e2621a', d: '#2a1206' },
    { c: 'f6', x: 80, y: 84.0, w: 30, a: '#4bcdff', b: '#2181e2', d: '#0c2246' }
  ];

  function buildFlies() {
    if (document.querySelector('.flutter')) return;
    for (var i = 0; i < FLIES.length; i++) {
      var f = FLIES[i];
      var d = document.createElement('div');
      d.className = 'flutter ' + f.c;
      d.setAttribute('aria-hidden', 'true');
      d.style.left = f.x + '%';
      d.style.top = f.y + '%';
      d.style.width = f.w + 'px';
      d.style.height = (f.w * 0.82) + 'px';
      d.innerHTML = butterflySVG(f.a, f.b, f.d);
      document.body.appendChild(d);
    }
  }

  /* ====================================================== 5. ilerleme satırı */
  function mergeProgress() {
    var rows = document.querySelectorAll('#cardsView .progress-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var bar = row.nextElementSibling;
      if (!bar || bar.className.indexOf('bar') === -1) continue;
      if (row.parentNode.querySelector('.tf-progress')) continue;

      var wrap = document.createElement('div');
      wrap.className = 'tf-progress';
      row.parentNode.insertBefore(wrap, row);

      var kids = [];
      for (var k = 0; k < row.children.length; k++) kids.push(row.children[k]);
      if (kids[0]) wrap.appendChild(kids[0]);
      wrap.appendChild(bar);
      if (kids[1]) wrap.appendChild(kids[1]);
      row.parentNode.removeChild(row);
    }
  }

  function goldCount() {
    var el = document.getElementById('cardCount');
    if (!el) return;
    var busy = false;
    function paint() {
      if (busy) return;
      var t = el.textContent || '';
      if (!t || el.querySelector('b')) return;
      var m = t.match(/^\s*([\d.,]+)\s*(\/[\s\S]*)$/);
      if (!m) return;
      busy = true;
      el.innerHTML = '<b>' + m[1] + '</b> ' + m[2];
      busy = false;
    }
    paint();
    new MutationObserver(paint).observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* ================================================ 6. ülke silueti (neon yok) */
  var LANDMARK = {
    de: '🏛️', en: '🕰️', ar: '🕌', fr: '🗼', es: '⛪', ru: '🏰',
    it: '🏟️', pt: '⛲', nl: '🌷', ja: '⛩️', zh: '🏯', ko: '🏯'
  };

  function decorateLangs() {
    var opts = document.querySelectorAll('.lang-opt');
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];

      /* eski kıvılcımlar ve eski RGB neon halkalar kaldırıldı */
      var old = o.querySelectorAll('.spark, .neon, .neon-glow');
      for (var s = 0; s < old.length; s++) old[s].parentNode.removeChild(old[s]);

      if (!o.querySelector('.landmark')) {
        var icon = LANDMARK[o.getAttribute('data-lang')];
        if (icon) {
          var m = document.createElement('span');
          m.className = 'landmark';
          m.setAttribute('aria-hidden', 'true');
          m.textContent = icon;
          o.insertBefore(m, o.firstChild);
        }
      }
    }
  }

  /* ======================================================= 7. buton dokunuşu
     Basılan noktadan yayılan bir ışık halkası + kısa yaylı çöküş. */
  var TAPPABLE = '.lang-opt, .tab, .level-opt, .chip, .sound-btn, ' +
                 '.speak-icon-btn, .opt, .ctrl, .cat-trigger';

  function tapFeedback() {
    document.addEventListener('pointerdown', function (e) {
      var el = e.target && e.target.closest ? e.target.closest(TAPPABLE) : null;
      if (!el || el.hasAttribute('disabled')) return;

      if (!reduce) {
        var r = el.getBoundingClientRect();
        var dot = document.createElement('span');
        dot.className = 'tf-ripple';
        dot.style.left = (e.clientX - r.left) + 'px';
        dot.style.top = (e.clientY - r.top) + 'px';
        el.appendChild(dot);
        setTimeout(function () { if (dot.parentNode) dot.parentNode.removeChild(dot); }, 640);

        el.classList.remove('tf-press');
        void el.offsetWidth;               /* animasyonu yeniden tetikle */
        el.classList.add('tf-press');
        setTimeout(function () { el.classList.remove('tf-press'); }, 360);
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    parallax(sceneLayer());

    fx = FX();
    fx.mount();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) fx.pause(); else fx.resume();
    });

    buildDesk();
    buildFlies();
    mergeProgress();
    goldCount();
    decorateLangs();
    tapFeedback();

    var box = document.getElementById('langBox');
    if (box) new MutationObserver(decorateLangs).observe(box, { childList: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
