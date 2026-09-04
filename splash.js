/* ============================================================================
   splash.js — Lumira | Dil Kartları
   Premium animasyonlu açılış (splash) + başlangıç kontrolleri + routing + onboarding.
   Tamamen OVERLAY olarak çalışır; mevcut uygulama mantığına dokunmaz.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__lumBootDone) return;               /* iki kez çalışmasın (race koruması) */
  window.__lumBootDone = true;

  /* MUTLAK FAILSAFE: ne olursa olsun (JS hatası, takılma) splash 8sn'de kalkar,
     böylece uygulama + liderlik asla splash altında gizli kalmaz. */
  setTimeout(function () {
    var sp = document.getElementById('lumSplash');
    if (sp && !document.getElementById('lumOnb')) {   /* onboarding açıksa dokunma */
      sp.classList.add('lms-out');
      setTimeout(function () { if (sp && sp.parentNode) sp.remove(); }, 500);
    }
  }, 8000);

  var ONBOARD_KEY = 'lumira_onboarded_v1';
  var MIN_SPLASH  = 2500;
  var MAX_SPLASH  = 4500;                          /* üst sınır; asla sonsuz değil */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* dilin kendi rengi (index.html :root ile birebir) */
  var COL = { de:'#ffd23b', en:'#4fe8ff', fr:'#ff5fb8', es:'#ff3b5c', ar:'#3dffa0', ru:'#9b7bff', tr:'#eaf0f7' };
  var GREETINGS = [
    { t:'Hallo', c:'de' }, { t:'Hello', c:'en' }, { t:'Bonjour', c:'fr' },
    { t:'Hola', c:'es' }, { t:'Привет', c:'ru' }, { t:'مرحبا', c:'ar' }, { t:'Merhaba', c:'tr' }
  ];
  var WELCOMES = [
    { t:'Hoş geldin', c:'tr' }, { t:'Welcome', c:'en' }, { t:'Willkommen', c:'de' },
    { t:'Bienvenue', c:'fr' }, { t:'Bienvenido', c:'es' }, { t:'Добро пожаловать', c:'ru' }, { t:'أهلاً', c:'ar' }
  ];
  var LANGS = [
    { c:'de', flag:'🇩🇪', name:'Almanca' }, { c:'en', flag:'🇬🇧', name:'İngilizce' },
    { c:'fr', flag:'🇫🇷', name:'Fransızca' }, { c:'es', flag:'🇪🇸', name:'İspanyolca' },
    { c:'ar', flag:'🇸🇦', name:'Arapça' }, { c:'ru', flag:'🇷🇺', name:'Rusça' }
  ];
  var LEVELS = ['A1', 'A2', 'B1', 'B2'];

  function track(ev){ try { if (window.LUMIRA_TRACK) window.LUMIRA_TRACK(ev); } catch(e){} }

  /* --------------------------------------------------------------- stil -- */
  function injectCss() {
    if (document.getElementById('lumBootCss')) return;
    var fl = document.createElement('link'); fl.rel = 'stylesheet';
    fl.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Mono:wght@400;500&display=swap';
    document.head.appendChild(fl);

    var s = document.createElement('style'); s.id = 'lumBootCss';
    s.textContent = [
      ':root{--lms-bg:#0a0d14;--lms-bg2:#0f1420;--lms-panel:#141b28;--lms-ink:#eef2f8;',
      '--lms-dim:#8791a3;--lms-line:#232c3b;--lms-acc:#6d9bff;--lms-vio:#9b7bff;--lms-r:7px;',
      '--lms-serif:"Fraunces",Georgia,serif;--lms-mono:"DM Mono",ui-monospace,monospace;}',

      '#lumSplash,#lumOnb{position:fixed;inset:0;z-index:99999;color:var(--lms-ink);',
      'background:radial-gradient(120% 90% at 50% 38%, #12192a 0%, var(--lms-bg) 62%);',
      'display:flex;align-items:center;justify-content:center;overflow:hidden;',
      'padding:calc(env(safe-area-inset-top) + 22px) 22px calc(env(safe-area-inset-bottom) + 22px);',
      'opacity:1;transition:opacity .42s ease;}',
      '#lumSplash.lms-out,#lumOnb.lms-out{opacity:0;pointer-events:none;}',

      /* dilin renginde süzülen sözcükler — HER ZAMAN en altta */
      '.lms-words{position:absolute;inset:0;z-index:0;pointer-events:none;}',
      '.lms-word{position:absolute;font-family:-apple-system,system-ui,"Segoe UI",Arial,sans-serif;',
      'font-size:14px;font-weight:500;opacity:0;white-space:nowrap;will-change:transform,opacity;text-shadow:0 0 12px currentColor;}',
      '@keyframes lbDrift{0%{opacity:0;transform:translateY(16px) scale(.96)}',
      '20%{opacity:.42}80%{opacity:.42}100%{opacity:0;transform:translateY(-16px) scale(1.02)}}',

      /* mor kelebek */
      '.lms-bfly{position:absolute;z-index:1;width:34px;height:30px;pointer-events:none;',
      'filter:drop-shadow(0 0 10px rgba(155,123,255,.55));}',
      '.lms-bfly .wg{transform-origin:50% 50%;animation:lbFlap .34s ease-in-out infinite;}',
      '.lms-bfly .wgR{animation-delay:.02s;}',
      '@keyframes lbFlap{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.52)}}',
      '@keyframes lbFly{0%{transform:translate(0,0) rotate(-6deg)}',
      '25%{transform:translate(46px,-34px) rotate(8deg)}50%{transform:translate(14px,-64px) rotate(-4deg)}',
      '75%{transform:translate(-40px,-30px) rotate(6deg)}100%{transform:translate(0,0) rotate(-6deg)}}',

      /* splash logo + künye */
      '.lms-core{position:relative;z-index:3;text-align:center;}',
      '.lms-glow{position:absolute;left:50%;top:44px;width:220px;height:220px;transform:translateX(-50%);',
      'background:radial-gradient(circle, rgba(109,155,255,.20), rgba(109,155,255,0) 68%);z-index:-1;',
      'opacity:0;animation:lbGlow 1.2s ease .2s forwards;}',
      '@keyframes lbGlow{to{opacity:1}}',
      '.lms-logo{width:128px;height:128px;border-radius:28px;display:block;margin:0 auto;',
      'opacity:0;transform:scale(.86);}',
      '.lms-core.in .lms-logo{animation:lbLogo 1050ms cubic-bezier(.2,.7,.2,1) forwards' +
        (reduce ? '' : ', lbFloat 4s ease-in-out 1050ms infinite') + ';}',
      '@keyframes lbLogo{0%{opacity:0;transform:scale(.86)}60%{opacity:1;transform:scale(1.045)}100%{opacity:1;transform:scale(1)}}',
      '@keyframes lbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}',
      '.lms-name{margin-top:22px;font-family:var(--lms-serif);font-weight:600;font-size:15px;',
      'letter-spacing:.02em;color:var(--lms-ink);opacity:0;}',
      '.lms-tag{margin-top:7px;font-family:var(--lms-mono);font-size:10.5px;letter-spacing:.32em;',
      'text-transform:uppercase;color:var(--lms-dim);opacity:0;}',
      '.lms-core.in .lms-name{animation:lbUp .6s ease .5s forwards;}',
      '.lms-core.in .lms-tag{animation:lbUp .6s ease .66s forwards;}',
      '@keyframes lbUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      /* minimal ilerleme çizgisi */
      '.lms-load{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom) + 42px);',
      'transform:translateX(-50%);width:132px;height:2px;background:var(--lms-line);border-radius:2px;overflow:hidden;}',
      '.lms-load i{display:block;height:100%;width:38%;background:var(--lms-acc);border-radius:2px;',
      'animation:lbBar 1.3s ease-in-out infinite;}',
      '@keyframes lbBar{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}',

      /* onboarding panel */
      '.lms-panel{position:relative;z-index:5;width:100%;max-width:460px;}',
      '.lms-step{opacity:0;transform:translateY(10px);transition:opacity .34s ease, transform .34s ease;display:none;}',
      '.lms-step.on{display:block;opacity:1;transform:none;}',
      '.lms-eyebrow{font-family:var(--lms-mono);font-size:11px;letter-spacing:.26em;text-transform:uppercase;',
      'color:var(--lms-acc);margin-bottom:15px;}',
      '.lms-h{font-family:var(--lms-serif);font-weight:600;font-size:35px;line-height:1.05;letter-spacing:-.01em;margin:0 0 12px;}',
      '.lms-h .em{font-style:italic;font-weight:500;}',
      '.lms-p{color:var(--lms-dim);font-size:15.5px;line-height:1.55;margin:0 0 24px;max-width:36ch;font-family:var(--lms-serif);}',
      '.lms-cta{display:block;width:100%;border:none;cursor:pointer;font-family:var(--lms-mono);font-size:14px;',
      'letter-spacing:.05em;text-transform:uppercase;color:#0a0d14;background:var(--lms-ink);',
      'border-radius:var(--lms-r);padding:16px 18px;transition:background .2s, transform .1s;}',
      '.lms-cta:hover{background:var(--lms-acc);color:#fff;}.lms-cta:active{transform:scale(.985);}',
      '.lms-cta[disabled]{opacity:.4;cursor:default;}',
      '.lms-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:24px;}',
      '.lms-opt{display:flex;align-items:center;gap:11px;padding:14px 15px;cursor:pointer;',
      'border:1px solid var(--lms-line);border-radius:var(--lms-r);background:var(--lms-panel);',
      'color:var(--lms-ink);font-family:var(--lms-serif);font-size:16px;',
      'transition:border-color .16s, background .16s, box-shadow .16s;}',
      '.lms-opt:hover{border-color:var(--lms-acc);}',
      '.lms-opt.sel{border-color:var(--lms-acc);background:#172232;box-shadow:inset 0 0 0 1px var(--lms-acc);}',
      '.lms-opt .fl{font-size:20px;line-height:1;}',
      '.lms-lv .lms-opt{justify-content:center;font-family:var(--lms-mono);letter-spacing:.1em;}',
      '.lms-steps{display:flex;gap:6px;margin-top:22px;}',
      '.lms-dot{height:3px;flex:1;background:var(--lms-line);border-radius:2px;transition:background .3s;}',
      '.lms-dot.on{background:var(--lms-acc);}',
      /* hafif mod adımı */
      '.lms-note{font-family:var(--lms-mono);font-size:11.5px;color:var(--lms-dim);margin:2px 2px 18px;line-height:1.5;}',
      '.lms-warn{color:#ff3b5c;font-family:var(--lms-mono);font-size:12px;font-weight:500;margin:0 2px 20px;line-height:1.45;}',
      '.lms-fill-row{font-family:var(--lms-serif);font-size:19px;color:var(--lms-ink);background:var(--lms-panel);border:1px solid var(--lms-line);border-radius:var(--lms-r);padding:16px;margin-bottom:14px;line-height:1.5;}',
      '.lms-input{width:100%;box-sizing:border-box;font-family:var(--lms-serif);font-size:17px;color:var(--lms-ink);background:var(--lms-panel);border:1px solid var(--lms-line);border-radius:var(--lms-r);padding:14px 16px;margin-bottom:10px;outline:none;}',
      '.lms-input:focus{border-color:var(--lms-acc);}',
      '.lms-fill-fb{min-height:18px;font-family:var(--lms-mono);font-size:12.5px;margin-bottom:14px;}',
      '.lms-fill-fb.ok{color:#3dffa0;}',
      '.lms-fill-fb.bad{color:#ff8a8a;}',
      reduce ? '.lms-word,.lms-bfly{animation:none!important;opacity:.32!important;}*{animation-duration:.001s!important;}' : ''
    ].join('');
    document.head.appendChild(s);
  }

  /* -------------------------------------------- kelebek + süzülen sözcük */
  function butterfly(host, x, y) {
    var b = document.createElement('div'); b.className = 'lms-bfly';
    b.style.left = x + '%'; b.style.top = y + '%';
    if (!reduce) b.style.animation = 'lbFly ' + (11 + Math.random()*4) + 's ease-in-out infinite';
    b.innerHTML =
      '<svg viewBox="0 0 34 30" width="34" height="30" aria-hidden="true">' +
      '<g class="wg wgL" fill="#9b7bff"><path d="M17 15C13 4 6 3 3 8c-3 5 2 11 8 11 3 0 5-2 6-4z" opacity=".92"/>' +
      '<path d="M17 15C13 22 8 27 4 24c-3-3-1-8 5-9 3-.5 6 0 8 0z" opacity=".7"/></g>' +
      '<g class="wg wgR" fill="#b79dff"><path d="M17 15C21 4 28 3 31 8c3 5-2 11-8 11-3 0-5-2-6-4z" opacity=".92"/>' +
      '<path d="M17 15C21 22 26 27 30 24c3-3 1-8-5-9-3-.5-6 0-8 0z" opacity=".7"/></g>' +
      '<rect x="16" y="6" width="2" height="18" rx="1" fill="#2a2140"/></svg>';
    host.appendChild(b);
  }
  function seedWords(host, list, edge) {
    if (reduce) { return; }
    list.forEach(function (g, i) {
      var el = document.createElement('span');
      el.className = 'lms-word'; el.textContent = g.t; el.dir = 'auto'; el.style.color = COL[g.c] || COL.tr;
      var x;
      if (edge) { x = (i % 2 === 0) ? (3 + Math.random()*15) : (74 + Math.random()*17); }  /* kenarlara yasla */
      else { x = 7 + Math.random()*74; }
      el.style.left = x + '%'; el.style.top = (8 + Math.random()*78) + '%';
      el.style.animation = 'lbDrift ' + (5.5 + Math.random()*3) + 's ease-in-out ' + (i*0.55) + 's infinite';
      host.appendChild(el);
    });
  }

  /* ------------------------------------------------ uygulamayı göster ---- */
  function revealApp() {
    var sp = document.getElementById('lumSplash');
    if (sp) { sp.classList.add('lms-out'); setTimeout(function () { sp.remove(); }, 460); }
  }

  /* ------------------------------------------- başlangıç kontrolleri ----- */
  function whenAuth(cb) {
    var done = false, fin = function () { if (!done) { done = true; cb(); } };
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        var un = firebase.auth().onAuthStateChanged(function () { try { un(); } catch (e) {} fin(); }, fin);
      } else { setTimeout(function () { whenAuth(cb); }, 250); return; }
    } catch (e) { fin(); }
    setTimeout(fin, MAX_SPLASH);
  }
  function isReturning() {
    try { return !!(typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length && firebase.auth().currentUser); }
    catch (e) { return false; }
  }
  function isOnboarded() { try { return !!localStorage.getItem(ONBOARD_KEY); } catch (e) { return false; } }
  function markOnboarded() { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {} }

  /* ---------------------------------------------------------- routing ---- */
  function decideRoute() {
    if (isReturning() || isOnboarded()) { markOnboarded(); revealApp(); return; }
    startOnboarding();
  }

  /* ------------------------------------------ hafif mod (mevcut sisteme) - */
  function applyLite(on) {
    try { localStorage.setItem('pwa_lite', JSON.stringify(!!on)); } catch (e) {}
    try { document.documentElement.classList.toggle('lite', !!on); } catch (e) {}
    if (on && typeof window.__snowStop === 'function') { try { window.__snowStop(); } catch (e) {} }
  }

  /* --------------------------------------------------------- onboarding -- */
  function applyChoice(lang, level) {
    try { var lo = document.querySelector('.lang-opt[data-lang="' + lang + '"]'); if (lo) lo.click(); } catch (e) {}
    if (level) {
      var tries = 0;
      (function setLvl() {
        var b = document.querySelectorAll('.level-opt');
        for (var i = 0; i < b.length; i++) if ((b[i].textContent || '').trim().toUpperCase() === level) { b[i].click(); return; }
        if (tries++ < 10) setTimeout(setLvl, 300);
      })();
    }
  }

  function startOnboarding() {
    markOnboarded();                 /* HATA 1 DÜZELTMESİ: gösterilir gösterilmez işaretle → bir daha görünmez */
    track('welcome_viewed');
    var sp = document.getElementById('lumSplash');
    var ob = document.createElement('div'); ob.id = 'lumOnb'; ob.setAttribute('role', 'dialog');
    var words = document.createElement('div'); words.className = 'lms-words'; ob.appendChild(words);
    var panel = document.createElement('div'); panel.className = 'lms-panel'; ob.appendChild(panel);
    var chosen = { lang: null, level: null, lite: false };
    var stepEls = [];
    function step(html) { var d = document.createElement('div'); d.className = 'lms-step'; d.innerHTML = html; panel.appendChild(d); stepEls.push(d); return d; }

    /* 0 — hoş geldin */
    step('<div class="lms-eyebrow">Lumira · Dil Kartları</div>' +
      '<h1 class="lms-h">Hoş geldin.<br><span class="em">Yeni bir dile</span> başla.</h1>' +
      '<p class="lms-p">Altı dilde 36.702 kelime kartı, örnek cümleleri ve Türkçe karşılıklarıyla. Günde on dakika yeter.</p>' +
      '<button class="lms-cta" data-go="1">Başlayalım</button>');

    /* 1 — dil */
    var s1 = step('<div class="lms-eyebrow">Adım 1 / 3</div><h1 class="lms-h">Ne öğrenmek istiyorsun?</h1>' +
      '<div class="lms-cards" id="lbLangs"></div><button class="lms-cta" data-go="2" disabled>Devam</button>');
    var lg = s1.querySelector('#lbLangs');
    LANGS.forEach(function (L) {
      var o = document.createElement('div'); o.className = 'lms-opt';
      o.innerHTML = '<span class="fl">' + L.flag + '</span>' + L.name;
      o.onclick = function () {
        chosen.lang = L.c;
        lg.querySelectorAll('.lms-opt').forEach(function (x) { x.classList.remove('sel'); x.style.boxShadow=''; x.style.borderColor=''; });
        o.classList.add('sel'); o.style.borderColor = COL[L.c]; o.style.boxShadow = 'inset 0 0 0 1px ' + COL[L.c];
        s1.querySelector('.lms-cta').removeAttribute('disabled');
      };
      lg.appendChild(o);
    });

    /* 2 — seviye */
    var s2 = step('<div class="lms-eyebrow">Adım 2 / 3</div><h1 class="lms-h">Seviyen nedir?</h1>' +
      '<div class="lms-cards lms-lv" id="lbLevels"></div><button class="lms-cta" data-go="3" disabled>Devam</button>');
    var lv = s2.querySelector('#lbLevels');
    LEVELS.forEach(function (L) {
      var o = document.createElement('div'); o.className = 'lms-opt'; o.textContent = L;
      o.onclick = function () {
        chosen.level = L;
        lv.querySelectorAll('.lms-opt').forEach(function (x) { x.classList.remove('sel'); });
        o.classList.add('sel'); s2.querySelector('.lms-cta').removeAttribute('disabled');
      };
      lv.appendChild(o);
    });

    /* 3 — hafif mod */
    var s3 = step('<div class="lms-eyebrow">Adım 3 / 3</div><h1 class="lms-h">Hafif mod</h1>' +
      '<p class="lms-p">Kar taneleri, ışıltı ve arka plan süslemelerini kapatır; uygulama daha akıcı ve daha az pil harcar. Sözlük ve quiz aynen çalışır.</p>' +
      '<div class="lms-cards" id="lbLite"></div>' +
      '<p class="lms-warn">Telefonun düşük performanslı değilse açman önerilmez.</p>' +
      '<p class="lms-note">İstediğin zaman Ayarlar › Hafif mod\u2019dan değiştirebilirsin.</p>' +
      '<button class="lms-cta" data-go="4">Devam</button>');
    var li = s3.querySelector('#lbLite');
    [['off','Kapalı kalsın'], ['on','Evet, aç']].forEach(function (P, idx) {
      var o = document.createElement('div'); o.className = 'lms-opt' + (idx === 0 ? ' sel' : ''); o.textContent = P[1];
      o.style.justifyContent = 'center';
      o.onclick = function () {
        chosen.lite = (P[0] === 'on');
        li.querySelectorAll('.lms-opt').forEach(function (x) { x.classList.remove('sel'); });
        o.classList.add('sel');
      };
      li.appendChild(o);
    });

    /* 5 — hazır */
    step('<div class="lms-eyebrow">Hazırsın</div><h1 class="lms-h">Öğrenme yolculuğun<br><span class="em">şimdi başlıyor.</span></h1>' +
      '<p class="lms-p">Seçtiğin dille ilk kartına birazdan bakacaksın. Dili ve seviyeni dilediğinde değiştirebilirsin.</p>' +
      '<button class="lms-cta" data-go="done">Lumira\u2019ya Başla</button>');

    var dots = document.createElement('div'); dots.className = 'lms-steps';
    for (var i = 0; i < 5; i++) dots.appendChild(document.createElement('i')).className = 'lms-dot';
    panel.appendChild(dots);

    function show(n) {
      stepEls.forEach(function (el, k) { el.classList.toggle('on', k === n); });
      dots.querySelectorAll('.lms-dot').forEach(function (dd, k) { dd.classList.toggle('on', k <= n); });
      if (n === 1) track('onboarding_started');
    }
    panel.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-go]'); if (!b) return;
      var go = b.getAttribute('data-go');
      if (go === 'done') { finish(); return; }
      show(parseInt(go, 10));
    });

    document.body.appendChild(ob);
    seedWords(words, WELCOMES.concat(GREETINGS), true);
    butterfly(words, 72, 20); if (!reduce) butterfly(words, 16, 60);
    if (sp) { sp.classList.add('lms-out'); setTimeout(function () { sp.remove(); }, 460); }
    requestAnimationFrame(function () { show(0); });

    function finish() {
      applyChoice(chosen.lang || 'de', chosen.level);
      applyLite(chosen.lite);
      track('language_selected'); track('level_selected'); track('onboarding_completed');
      ob.classList.add('lms-out'); setTimeout(function () { ob.remove(); }, 460);
    }
  }

  /* ------------------------------------------------------------ başlat --- */
  function run() {
    injectCss();
    var sp = document.getElementById('lumSplash');
    if (!sp) { decideRoute(); return; }
    var core  = sp.querySelector('.lms-core');
    var words = sp.querySelector('.lms-words');
    if (words) { seedWords(words, GREETINGS); butterfly(words, 68, 24); if (!reduce) butterfly(words, 20, 58); }
    if (core) core.classList.add('in');

    var t0 = Date.now(), authOk = false, lbOk = false, forced = false;
    whenAuth(function () { authOk = true; maybe(); });
    var poll = setInterval(function () { if (window.__lumLbReady) { lbOk = true; clearInterval(poll); maybe(); } }, 120);
    setTimeout(function () { forced = true; clearInterval(poll); maybe(); }, MAX_SPLASH);

    function maybe() {
      if (!(forced || (authOk && lbOk))) return;
      var wait = Math.max(0, MIN_SPLASH - (Date.now() - t0));
      setTimeout(decideRoute, wait);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
