/* ============================================================================
   frame.js — Sahnenin ön planı

   Referanstaki atmosferin asıl taşıyıcısı arka plandaki parçacıklar değil,
   kadrajı çerçeveleyen NESNELER: sarkan mor çiçekler, sıcak bir fener,
   masadaki kitaplar ve kahve. Arayüz bunların arasında durduğu için
   "bir manzaranın içinde ders çalışıyorum" hissi doğuyor.

   Hepsi kod ile üretilmiş orijinal SVG çizimlerdir — hiçbir görsel dosya
   indirilmez. Çiçekler prosedürel üretildiği için her taç yaprağı biraz
   farklıdır; elle çizilmiş bir illüstrasyon gibi tekrar etmez.

   Katman sırası: gökyüzü(0) → tonlama(1) → grain(2) → ÇERÇEVE(2) → arayüz(3)
   Çerçeve arayüzün ARKASINDA durur; cam panellerin backdrop-filter'ı onu
   bulanıklaştırır ve buzlu cam ardında çiçek görüntüsü oluşur.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  /* deterministik rastgelelik — her yüklemede aynı kompozisyon çıksın */
  var seed = 20260801;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }
  function R(a, b) { return a + rnd() * (b - a); }

  /* ---------------------------------------------------------------- çiçek
     Taç yaprakları merkez etrafında döndürülmüş elipslerdir. Her yaprağın
     açısı ve boyu hafifçe sapar; simetri kırıldığı için canlı görünür. */
  function bloom(cx, cy, r, n, c1, c2, tilt) {
    var g = '<g transform="translate(' + cx.toFixed(1) + ',' + cy.toFixed(1) + ') rotate(' + (tilt || 0).toFixed(1) + ')">';
    for (var i = 0; i < n; i++) {
      var a = (360 / n) * i + R(-9, 9);
      /* Sakura taç yaprağı: eskisinden daha kısa ve daha geniş — yıldız
         gibi sivri değil, kiraz çiçeğine özgü yuvarlak/çentikli form. */
      var rx = r * R(0.44, 0.54);
      var ry = r * R(0.62, 0.76);
      g += '<ellipse cx="0" cy="' + (-ry * 0.62).toFixed(1) + '" rx="' + rx.toFixed(1) +
           '" ry="' + ry.toFixed(1) + '" fill="' + (i % 2 ? c1 : c2) +
           '" transform="rotate(' + a.toFixed(1) + ')"/>';
    }
    g += '<circle r="' + (r * 0.20).toFixed(1) + '" fill="#ffd98a"/>';
    g += '<circle r="' + (r * 0.10).toFixed(1) + '" fill="#fff4d0"/>';
    return g + '</g>';
  }

  function leaf(x, y, len, ang, col) {
    return '<path d="M0 0 C' + (len * .3) + ' ' + (-len * .32) + ' ' + (len * .78) + ' ' +
           (-len * .26) + ' ' + len + ' 0 C' + (len * .78) + ' ' + (len * .26) + ' ' +
           (len * .3) + ' ' + (len * .32) + ' 0 0 Z" fill="' + col +
           '" transform="translate(' + x + ',' + y + ') rotate(' + ang + ')"/>';
  }

  /* ================================================================== dallar
     Sol üstten sarkan çiçekli dal. */
  function branchTL() {
    var s = '<g>';
    /* ana dal */
    s += '<path d="M-6 -4 C40 24 70 52 96 104 C104 120 110 138 112 156" ' +
         'stroke="#0a0c1c" stroke-width="7" fill="none" stroke-linecap="round"/>';
    s += '<path d="M28 16 C52 40 58 72 54 108" stroke="#0a0c1c" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
    s += '<path d="M60 46 C92 56 118 52 146 38" stroke="#0a0c1c" stroke-width="4" fill="none" stroke-linecap="round"/>';

    var pts = [[18, 10], [40, 30], [54, 58], [50, 92], [72, 50], [98, 48],
               [124, 44], [78, 82], [92, 116], [106, 142], [34, 62], [66, 22]];
    for (var i = 0; i < pts.length; i++) {
      s += leaf(pts[i][0], pts[i][1], R(13, 20), R(-70, 70), 'rgba(10,14,30,.95)');
    }
    /* çiçekler — mor / eflatun */
    var blooms = [[16, 6, 13], [44, 26, 15], [58, 60, 12], [48, 96, 14], [76, 46, 11],
                  [102, 44, 13], [130, 38, 11], [82, 86, 12], [96, 120, 14], [110, 148, 11],
                  [30, 48, 10], [68, 14, 12]];
    for (var b = 0; b < blooms.length; b++) {
      s += bloom(blooms[b][0], blooms[b][1], blooms[b][2], 5,
        'rgba(255,214,226,.94)', 'rgba(255,178,201,.94)', R(0, 360));
    }
    return s + '</g>';
  }

  /* Alt köşelerdeki çiçek demeti — saplar aşağıdan yukarı doğru açılır. */
  function cluster(mirror) {
    var s = '<g' + (mirror ? ' transform="scale(-1,1) translate(-190,0)"' : '') + '>';
    var stems = [[24, 176, 30, 96], [52, 180, 64, 70], [84, 178, 92, 104],
                 [112, 180, 126, 62], [140, 176, 150, 98], [8, 178, 12, 128],
                 [66, 180, 42, 44], [98, 178, 112, 34]];
    for (var i = 0; i < stems.length; i++) {
      var st = stems[i];
      s += '<path d="M' + st[0] + ' ' + st[1] + ' Q' + (st[0] + R(-16, 16)) + ' ' +
           ((st[1] + st[3]) / 2) + ' ' + st[2] + ' ' + st[3] +
           '" stroke="rgba(8,12,26,.92)" stroke-width="' + R(2.2, 3.4).toFixed(1) +
           '" fill="none" stroke-linecap="round"/>';
      s += leaf(st[0] + R(-6, 6), st[1] - R(24, 54), R(14, 22), R(-80, 80), 'rgba(9,13,28,.92)');
    }
    /* zemindeki yapraklar */
    for (var j = 0; j < 9; j++) {
      s += leaf(R(0, 180), R(160, 186), R(18, 30), R(-30, 30), 'rgba(7,10,24,.95)');
    }
    /* çiçekler */
    var pal = [['rgba(255,222,232,.94)', 'rgba(255,188,208,.94)'],
               ['rgba(255,201,218,.94)', 'rgba(240,150,178,.94)'],
               ['rgba(255,235,240,.94)', 'rgba(255,202,218,.94)']];
    for (var k = 0; k < stems.length; k++) {
      var p = pal[k % pal.length];
      s += bloom(stems[k][2], stems[k][3], R(11, 17), 5, p[0], p[1], R(0, 360));
    }
    return s + '</g>';
  }

  /* ================================================================= fener */
  function lantern() {
    return '' +
      '<defs>' +
        '<radialGradient id="lampGlow">' +
          '<stop offset="0" stop-color="rgba(255,206,130,.95)"/>' +
          '<stop offset="35%" stop-color="rgba(255,176,86,.38)"/>' +
          '<stop offset="100%" stop-color="rgba(255,160,70,0)"/>' +
        '</radialGradient>' +
        '<linearGradient id="lampGlass" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="rgba(255,224,168,.95)"/>' +
          '<stop offset="100%" stop-color="rgba(255,158,66,.8)"/>' +
        '</linearGradient>' +
      '</defs>' +
      '<circle cx="60" cy="74" r="58" fill="url(#lampGlow)" class="lamp-halo"/>' +
      /* direk ve askı */
      '<path d="M60 0 V16" stroke="#0a0d1e" stroke-width="5"/>' +
      '<path d="M40 16 H80" stroke="#0a0d1e" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M46 16 L52 30 H68 L74 16 Z" fill="#0b0e20"/>' +
      /* cam gövde */
      '<path d="M50 30 L44 96 H76 L70 30 Z" fill="url(#lampGlass)" opacity=".92"/>' +
      '<path d="M50 30 L44 96 H76 L70 30 Z" fill="none" stroke="#0b0e20" stroke-width="3.4"/>' +
      '<path d="M57 44 L54 88 H66 L63 44 Z" fill="rgba(255,246,214,.9)" class="lamp-flame"/>' +
      '<path d="M40 96 H80 L76 106 H44 Z" fill="#0b0e20"/>' +
      '<path d="M56 106 H64 V118 H56 Z" fill="#0b0e20"/>';
  }

  /* ==================================================== kitaplar ve kahve */
  function desk() {
    return '' +
      '<defs>' +
        '<radialGradient id="cupGlow">' +
          '<stop offset="0" stop-color="rgba(255,196,120,.5)"/>' +
          '<stop offset="100%" stop-color="rgba(255,170,90,0)"/>' +
        '</radialGradient>' +
      '</defs>' +
      /* masa yüzeyi */
      '<path d="M0 96 H320 V140 H0 Z" fill="rgba(6,8,18,.96)"/>' +
      '<path d="M0 96 H320" stroke="rgba(190,214,255,.18)" stroke-width="1.4"/>' +
      /* açık kitap — ortada */
      '<path d="M104 96 L118 66 L160 76 L160 96 Z" fill="rgba(232,238,252,.9)"/>' +
      '<path d="M216 96 L202 66 L160 76 L160 96 Z" fill="rgba(214,224,244,.9)"/>' +
      '<path d="M104 96 L118 66 L160 76 L160 96 Z" fill="none" stroke="rgba(8,10,22,.9)" stroke-width="2"/>' +
      '<path d="M216 96 L202 66 L160 76 L160 96 Z" fill="none" stroke="rgba(8,10,22,.9)" stroke-width="2"/>' +
      '<path d="M160 76 V96" stroke="rgba(8,10,22,.8)" stroke-width="2"/>' +
      /* satırlar */
      '<g stroke="rgba(30,38,66,.45)" stroke-width="1.6">' +
        '<path d="M124 80 L152 84"/><path d="M122 86 L152 90"/>' +
        '<path d="M196 80 L168 84"/><path d="M198 86 L168 90"/>' +
      '</g>' +
      /* yığılmış kitaplar — sağda */
      '<path d="M232 96 H304 V86 H232 Z" fill="rgba(72,40,96,.95)"/>' +
      '<path d="M236 86 H300 V77 H236 Z" fill="rgba(40,64,116,.95)"/>' +
      '<path d="M240 77 H296 V69 H240 Z" fill="rgba(96,44,72,.95)"/>' +
      '<g stroke="rgba(255,214,150,.35)" stroke-width="1">' +
        '<path d="M232 88 H304"/><path d="M236 79 H300"/><path d="M240 71 H296"/>' +
      '</g>' +
      /* kahve fincanı — solda */
      '<ellipse cx="56" cy="98" rx="34" ry="9" fill="url(#cupGlow)"/>' +
      '<path d="M34 66 H78 L74 94 H38 Z" fill="rgba(20,26,54,.97)"/>' +
      '<path d="M34 66 H78" stroke="rgba(200,222,255,.4)" stroke-width="2"/>' +
      '<ellipse cx="56" cy="66" rx="22" ry="5.5" fill="rgba(58,40,30,.98)"/>' +
      '<ellipse cx="56" cy="66" rx="22" ry="5.5" fill="none" stroke="rgba(210,228,255,.35)" stroke-width="1.4"/>' +
      '<path d="M78 72 C92 72 92 88 76 88" stroke="rgba(20,26,54,.97)" stroke-width="5" fill="none"/>' +
      /* buhar */
      '<g class="steam" fill="none" stroke="rgba(214,232,255,.5)" stroke-width="2.2" stroke-linecap="round">' +
        '<path d="M46 58 C40 48 52 42 46 32"/>' +
        '<path d="M58 56 C52 44 64 38 58 26"/>' +
        '<path d="M70 58 C64 48 76 42 70 32"/>' +
      '</g>' +
      /* kalem */
      '<path d="M96 94 L146 88 L148 92 L98 98 Z" fill="rgba(30,38,70,.95)"/>' +
      '<path d="M146 88 L154 87 L148 92 Z" fill="rgba(230,238,255,.85)"/>';
  }

  /* ------------------------------------------------------------- kurulum */
  function svg(cls, viewBox, inner) {
    var el = document.createElementNS(NS, 'svg');
    el.setAttribute('class', cls);
    el.setAttribute('viewBox', viewBox);
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    el.innerHTML = inner;
    return el;
  }

  function build() {
    if (document.getElementById('scene-frame')) return;

    var host = document.createElement('div');
    host.id = 'scene-frame';
    host.setAttribute('aria-hidden', 'true');

    var branch = svg('fr fr-branch', '0 0 170 170', branchTL());
    branch.setAttribute('preserveAspectRatio', 'xMinYMin meet');

    var bl = svg('fr fr-bl', '0 0 190 190', cluster(false));
    var br = svg('fr fr-br', '0 0 190 190', cluster(true));
    var lamp = svg('fr fr-lamp', '0 0 120 130', lantern());
    var dsk = svg('fr fr-desk', '0 0 320 140', desk());

    /* Fenerin ve masanın ortama vurduğu sıcak ışık. Nesnelerin sahneye
       ait olduğu hissi, çevrelerindeki ışıktan doğar. */
    var glowLamp = document.createElement('div');
    glowLamp.className = 'fr-glow fr-glow-lamp';
    var glowDesk = document.createElement('div');
    glowDesk.className = 'fr-glow fr-glow-desk';
    host.appendChild(glowLamp);
    host.appendChild(glowDesk);

    host.appendChild(branch);
    host.appendChild(lamp);
    host.appendChild(dsk);
    host.appendChild(bl);
    host.appendChild(br);

    var grain = document.getElementById('grain');
    if (grain && grain.parentNode) grain.parentNode.insertBefore(host, grain.nextSibling);
    else document.body.insertBefore(host, document.body.firstChild);

    if (!reduceMotion) parallax(host);
  }

  /* Ön plan en fazla parallax alan katmandır — kameraya en yakın olan
     nesne en çok kayar. Bu, derinliği tek başına inandırıcı kılar. */
  function parallax(host) {
    var tx = 0, ty = 0, cx = 0, cy = 0, queued = false;
    var layers = host.querySelectorAll('.fr');

    function apply() {
      queued = false;
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      for (var i = 0; i < layers.length; i++) {
        var d = parseFloat(layers[i].getAttribute('data-depth') || '1');
        layers[i].style.transform =
          'translate3d(' + (cx * 13 * d).toFixed(2) + 'px,' + (cy * 8 * d).toFixed(2) + 'px,0)';
      }
      if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) req();
    }
    function req() { if (!queued) { queued = true; requestAnimationFrame(apply); } }

    for (var i = 0; i < layers.length; i++) {
      layers[i].setAttribute('data-depth', (0.7 + i * 0.16).toFixed(2));
    }

    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      req();
    }, { passive: true });

    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 34));
      ty = Math.max(-1, Math.min(1, ((e.beta || 42) - 42) / 34));
      req();
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
