/* ============================================================================
   theme.js — "Ay Işığı Kıyısı" sahnesinin hareketli parçaları

   Bu dosya arayüzün mantığına dokunmaz. Yalnızca şunları ekler:
     1. #scene-bg          → manzara katmanı (+ hafif parallax)
     2. #fg-desk           → kahve, açık defter, kitap yığını (ön plan)
     3. .flutter           → kelebekler
     4. ilerleme satırı    → sayaç • çubuk • kategori tek satıra alınır
     5. seçili dil kartına iki kıvılcım

   frame.js artık gerekmez; yüklü kalırsa CSS onu gizler.
   ========================================================================== */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ====================================================== 1. manzara katmanı */
  function sceneLayer() {
    if (document.getElementById('scene-bg')) return null;
    var bg = document.createElement('div');
    bg.id = 'scene-bg';
    bg.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bg, document.body.firstChild);
    return bg;
  }

  /* Manzara sabittir; imleç/eğim ile çok az kayar. Hareket küçük tutulur —
     amaç derinlik hissi, dikkat dağıtmak değil. */
  function parallax(bg) {
    if (!bg || reduce) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, queued = false;

    function apply() {
      queued = false;
      cx += (tx - cx) * 0.055;
      cy += (ty - cy) * 0.055;
      bg.style.transform =
        'translate3d(' + (cx * 9).toFixed(2) + 'px,' +
        (cy * 7 - sy * 0.05).toFixed(2) + 'px,0) scale(1.06)';
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) req();
    }
    function req() { if (!queued) { queued = true; requestAnimationFrame(apply); } }

    bg.style.transform = 'scale(1.06)';

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

    window.addEventListener('scroll', function () {
      sy = window.scrollY || 0;
      req();
    }, { passive: true });
  }

  /* ========================================================== 2. masa & eşya
     Zemin (ahşap teras) manzara görselinden gelir; burada yalnızca üstündeki
     nesneler çizilir: kahve, açık defter, kitap yığını, kalem, taç yaprakları. */
  function deskSVG() {
    var s = '';

    /* --- gölgeler: nesneleri zemine oturtan şey bunlar --- */
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

    /* ------------------------------------------------------- açık defter */
    /* iki sayfa, ortada dikiş; hafif perspektif için üst kenar dar */
    s += '<path d="M258 206 L300 146 L452 158 L452 206 Z" fill="url(#pg)"/>';
    s += '<path d="M646 206 L604 146 L452 158 L452 206 Z" fill="url(#pg2)"/>';
    s += '<path d="M258 206 L300 146 L452 158 L452 206 Z" fill="none" stroke="rgba(20,16,10,.45)" stroke-width="1.6"/>';
    s += '<path d="M646 206 L604 146 L452 158 L452 206 Z" fill="none" stroke="rgba(20,16,10,.45)" stroke-width="1.6"/>';
    s += '<path d="M452 158 V206" stroke="rgba(60,50,34,.55)" stroke-width="2.4"/>';
    /* sayfa kenarı kalınlığı */
    s += '<path d="M258 206 L452 206 L452 212 L262 212 Z" fill="rgba(222,214,196,.9)"/>';
    s += '<path d="M646 206 L452 206 L452 212 L642 212 Z" fill="rgba(210,202,184,.9)"/>';
    /* el yazısı satırları */
    s += '<g stroke="rgba(46,52,74,.5)" stroke-width="1.5" stroke-linecap="round">';
    for (var i = 0; i < 5; i++) {
      var y = 168 + i * 8;
      s += '<path d="M' + (296 - i * 6) + ' ' + y + ' L' + (430 - i * 1) + ' ' + (y + 1.4) + '"/>';
      s += '<path d="M' + (608 + i * 6) + ' ' + y + ' L' + (474 + i * 1) + ' ' + (y + 1.4) + '"/>';
    }
    s += '</g>';

    /* kalem — sağ sayfanın üzerinde */
    s += '<g transform="rotate(-9 560 186)">' +
      '<path d="M498 186 h96 v7 h-96 z" fill="#1d2748"/>' +
      '<path d="M594 186 l16 3.5 -16 3.5 z" fill="#e8eefc"/>' +
      '<path d="M498 186 h12 v7 h-12 z" fill="#c8d4ee"/>' +
      '</g>';

    /* --------------------------------------------------- kitap yığını (sağ) */
    function book(x, y, w, h, cover, edge) {
      var g = '<path d="M' + x + ' ' + y + ' h' + w + ' v' + h + ' h-' + w + ' z" fill="' + cover + '"/>';
      g += '<path d="M' + (x + 4) + ' ' + (y + 3) + ' h' + (w - 8) + '" stroke="' + edge + '" stroke-width="1.6" opacity=".55"/>';
      g += '<path d="M' + x + ' ' + (y + h - 5) + ' h' + w + '" stroke="rgba(240,232,208,.85)" stroke-width="3.4"/>';
      return g;
    }
    s += book(660, 178, 216, 30, '#20305e', 'rgba(255,214,150,.7)');
    s += book(672, 152, 196, 28, '#4a2246', 'rgba(255,214,150,.6)');
    s += '<g transform="rotate(-2.5 776 140)">' +
         book(682, 126, 184, 27, '#1a3a5c', 'rgba(255,214,150,.6)') + '</g>';
    /* en üstteki kitabın sırt dokusu */
    s += '<g stroke="rgba(255,220,160,.28)" stroke-width="1.2">' +
         '<path d="M700 134 h150"/><path d="M700 140 h120"/></g>';

    /* ------------------------------------------------------- kahve fincanı */
    s += '<ellipse cx="128" cy="196" rx="72" ry="16" fill="url(#warm)"/>';
    /* kulp */
    s += '<path d="M178 148 C214 146 214 186 176 184" fill="none" stroke="#22304f" stroke-width="12" stroke-linecap="round"/>';
    /* gövde */
    s += '<path d="M62 132 h124 l-11 62 a14 14 0 0 1 -14 11 h-74 a14 14 0 0 1 -14 -11 z" fill="url(#mug)"/>';
    /* ağız */
    s += '<ellipse cx="124" cy="132" rx="62" ry="14" fill="#0f1730"/>';
    s += '<ellipse cx="124" cy="132" rx="62" ry="14" fill="none" stroke="rgba(196,220,255,.5)" stroke-width="2"/>';
    /* kahve */
    s += '<ellipse cx="124" cy="134" rx="53" ry="11" fill="#31180d"/>';
    s += '<ellipse cx="124" cy="134" rx="53" ry="11" fill="none" stroke="rgba(255,190,120,.35)" stroke-width="1.4"/>';
    s += '<ellipse cx="106" cy="132" rx="18" ry="4" fill="rgba(255,208,150,.18)"/>';
    /* buhar */
    s += '<g class="steam" fill="none" stroke="rgba(220,236,255,.55)" stroke-width="3" stroke-linecap="round">' +
      '<path d="M100 118 C90 100 112 92 102 72"/>' +
      '<path d="M126 114 C116 94 138 86 128 64"/>' +
      '<path d="M152 118 C142 100 164 92 154 72"/>' +
      '</g>';

    /* --------------------------------------------------------- taç yaprak */
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

  /* ============================================================ 3. kelebek */
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

  /* Konumlar referans kadrajından alındı: başlığın çevresinde üç küçük mavi,
     dil ızgarasının iki yanında birer büyük kelebek, kartın yanında bir tane. */
  var FLIES = [
    { c: 'f1', x: 52, y: 13.0, w: 30, a: '#41c8ff', b: '#1f7ce0', d: '#0c2246' },
    { c: 'f2', x: 10, y: 25.5, w: 24, a: '#57d2ff', b: '#2a8de8', d: '#0c2246' },
    { c: 'f3', x: 41, y: 26.5, w: 20, a: '#8ee6ff', b: '#49a8f0', d: '#0c2246' },
    { c: 'f4', x: 3,  y: 39.0, w: 46, a: '#3fc4ff', b: '#1668d6', d: '#08182f' },
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

  /* ==================================================== 4. ilerleme satırı
     Referansta sayaç, ince çubuk ve kategori aynı hizada duruyor. Mevcut
     HTML'de çubuk ayrı bir satırda; üçünü tek bir flex satırına taşıyoruz. */
  function mergeProgress() {
    var rows = document.querySelectorAll('.progress-row');
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

  /* "1 / 6488" içindeki sayıyı altın renge almak için — uygulama metni her
     kart değişiminde yeniden yazdığı için gözlemci ile takip ediyoruz. */
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

  /* ============================================ 5. kıvılcım + ülke silueti */
  var LANDMARK = {
    de: '🏛️', en: '🕰️', ar: '🕌', fr: '🗼', es: '⛪', ru: '🏰',
    it: '🏟️', pt: '⛲', nl: '🌷', ja: '⛩️', zh: '🏯', ko: '🏯'
  };

  function landmarks() {
    var opts = document.querySelectorAll('.lang-opt');
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].querySelector('.landmark')) continue;
      var code = opts[i].getAttribute('data-lang');
      var icon = LANDMARK[code];
      if (!icon) continue;
      var m = document.createElement('span');
      m.className = 'landmark';
      m.setAttribute('aria-hidden', 'true');
      m.textContent = icon;
      opts[i].insertBefore(m, opts[i].firstChild);
    }
  }

  function sparkles() {
    var opts = document.querySelectorAll('.lang-opt');
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].querySelector('.spark')) continue;
      var a = document.createElement('span');
      a.className = 'spark s1'; a.textContent = '✨'; a.setAttribute('aria-hidden', 'true');
      var b = document.createElement('span');
      b.className = 'spark s2'; b.textContent = '✨'; b.setAttribute('aria-hidden', 'true');
      opts[i].appendChild(a);
      opts[i].appendChild(b);
    }
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    var bg = sceneLayer();
    parallax(bg || document.getElementById('scene-bg'));
    buildDesk();
    buildFlies();
    mergeProgress();
    goldCount();
    landmarks();
    sparkles();

    /* Dil ızgarası uygulama tarafından yeniden çizilirse süslemeleri koru */
    var box = document.getElementById('langBox');
    if (box) {
      new MutationObserver(function () { landmarks(); sparkles(); })
        .observe(box, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
