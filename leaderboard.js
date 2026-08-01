
/* ================================================================
   LEADERBOARD.JS — Firebase Authentication ile kullanıcı adı + şifre
   girişi, kalıcı ve tüm cihazlarda tutarlı liderlik tablosu
   ================================================================

   YENİ MİMARİ (v2):
   - Artık kimlik "isim" değil, Firebase Authentication tarafından
     verilen sabit bir UID (hesap kimliği). Bu, "aynı isim farklı
     yazılınca / boşlukla girilince ilerleme sıfırlanıyor" sınıfı
     hataların kökten önüne geçer.
   - Kullanıcı adı, biçimsel olarak geçerli bir e-postaya çevrilip
     (gerçek mail ATILMIYOR, sadece hesap anahtarı) Firebase'in
     Email/Password sağlayıcısına veriliyor. Şifreler bizim
     veritabanımızda ASLA saklanmıyor.
   - Yeni kullanıcı adı + şifre -> hesap oluşturulur (createUser).
   - Var olan kullanıcı adı + DOĞRU şifre -> o hesaba giriş yapılır.
   - Var olan kullanıcı adı + YANLIŞ şifre -> reddedilir.
   - Tarayıcı aynı kalırsa (aynı cihaz/tarayıcı), Firebase Authentication
     oturumu kendisi hatırlar; sayfa yeniden açıldığında şifre tekrar
     sorulmaz (onAuthStateChanged).
   - Eski (isim tabanlı) ilerleme/liderlik verisi varsa, ilk şifre
     belirlemede otomatik olarak yeni UID anahtarına taşınır.

   TEK YAPMAN GEREKEN ADIM:
   1) https://console.firebase.google.com > projenin var (Mhamzac).
   2) Authentication > Sign-in method > "Email/Password" sağlayıcısını
      ETKİNLEŞTİR (Enable).
   3) Realtime Database > Rules kısmına, ayrıca paylaştığım
      firebase-security-rules.json içeriğini yapıştır ve Publish et.
================================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBHgCtHuIunwlleLCxFCexErrjyZkuNYE0",
  authDomain: "mhamzac-ca73d.firebaseapp.com",
  databaseURL: "https://mhamzac-ca73d-default-rtdb.firebaseio.com",
  projectId: "mhamzac-ca73d",
  storageBucket: "mhamzac-ca73d.firebasestorage.app",
  messagingSenderId: "1002199445271",
  appId: "1:1002199445271:web:2c6620ff1db498c4679152"
};

const FAKE_EMAIL_DOMAIN = '@dilkartlari-user.app';

function initLeaderboard(){
  try{
    const isConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.indexOf('BURAYA_YAPISTIR') === -1;
    let db = null;
    let authSvc = null;

    if(isConfigured && typeof firebase !== 'undefined'){
      try{
        firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.database();
        authSvc = firebase.auth();
      }catch(e){ console.warn('Firebase başlatılamadı:', e); }
    } else if(!isConfigured){
      console.warn('Liderlik tablosu: FIREBASE_CONFIG henüz doldurulmadı.');
    } else {
      console.warn('Liderlik tablosu: Firebase SDK yüklenemedi (script src hatası olabilir).');
    }

    /* ---------------- KULLANICI ADI / ANAHTAR YARDIMCILARI ---------------- */
    function sanitizeUsername(name){
      return String(name||'').trim().toLowerCase()
        .replace(/\s+/g,'_')
        .replace(/[^a-z0-9_.]/g,'')
        .slice(0,30);
    }
    // Eski (isim tabanlı) anahtar üretimi — sadece göç (migration) amaçlı.
    function legacyKey(name){
      return String(name||'').trim().toLowerCase().replace(/\s+/g,'_').slice(0,20).replace(/[.#$/\[\]]/g, '_');
    }

    let currentUid = null;
    let currentName = '';

    // progress.js hâlâ window.LB_sanitizeKey(name) çağırıyor; artık isimden
    // bağımsız olarak DAİMA güncel UID'yi döndürüyoruz (tek doğruluk kaynağı).
    window.LB_sanitizeKey = function(name){
      return currentUid || sanitizeUsername(name);
    };

    /* ---------------- GİRİŞ FORMU (isim + şifre) ---------------- */
    const nameOverlay = document.getElementById('nameOverlay');
    const nameInput = document.getElementById('nameInput');
    const passwordInput = document.getElementById('passwordInput');
    const nameSubmit = document.getElementById('nameSubmit');
    const loginErrorEl = document.getElementById('loginError');

    function showNameModal(){ if(nameOverlay) nameOverlay.classList.add('open'); }
    function hideNameModal(){ if(nameOverlay) nameOverlay.classList.remove('open'); }
    function showLoginError(msg){ if(loginErrorEl) loginErrorEl.textContent = msg || ''; }
    function setSubmitLoading(loading){
      if(!nameSubmit) return;
      nameSubmit.disabled = loading;
      nameSubmit.textContent = loading ? 'Kontrol ediliyor…' : 'Başla';
    }

    async function migrateLegacyIfExists(oldKey, uid, displayName){
      if(!db || !oldKey) return;
      try{
        const progSnap = await db.ref('progress/'+oldKey).once('value');
        if(progSnap.exists()){
          const uidProgSnap = await db.ref('progress/'+uid).once('value');
          if(!uidProgSnap.exists()){
            await db.ref('progress/'+uid).set(progSnap.val());
          }
          // Eski kaydı sil — aksi halde aynı veri iki farklı anahtar altında
          // (eski isim + yeni uid) tekrar tekrar var olmaya devam eder.
          await db.ref('progress/'+oldKey).remove().catch(()=>{});
        }
      }catch(e){}
      try{
        const lbSnap = await db.ref('leaderboard/'+oldKey).once('value');
        if(lbSnap.exists()){
          const uidLbSnap = await db.ref('leaderboard/'+uid).once('value');
          if(!uidLbSnap.exists()){
            const val = lbSnap.val();
            if(val && typeof val === 'object') val.name = displayName;
            await db.ref('leaderboard/'+uid).set(val);
          }
          // Eski liderlik kaydını sil — çift görünmesin (ör. iki adet "M Hamza").
          await db.ref('leaderboard/'+oldKey).remove().catch(()=>{});
        }
      }catch(e){}
    }

    async function handleLoginSubmit(){
      const rawName = nameInput ? nameInput.value : '';
      const password = passwordInput ? passwordInput.value : '';
      const uname = sanitizeUsername(rawName);
      const displayName = String(rawName||'').trim();

      if(!displayName){ showLoginError('Lütfen bir kullanıcı adı yaz.'); return; }
      if(!uname){ showLoginError('Kullanıcı adında en az bir harf/rakam olmalı.'); return; }
      if(!password || password.length < 6){ showLoginError('Şifre en az 6 karakter olmalı.'); return; }
      if(!authSvc){ showLoginError('Bağlantı kurulamadı, lütfen tekrar dene.'); return; }

      showLoginError('');
      setSubmitLoading(true);
      const email = uname + FAKE_EMAIL_DOMAIN;

      try{
        const cred = await authSvc.createUserWithEmailAndPassword(email, password);
        try{ await cred.user.updateProfile({ displayName: displayName }); }catch(e){}
        onAuthSuccess(cred.user.uid, displayName);
      }catch(err){
        console.error('Giriş hatası:', err && err.code, err && err.message);
        if(err && err.code === 'auth/email-already-in-use'){
          try{
            const cred2 = await authSvc.signInWithEmailAndPassword(email, password);
            const dn = cred2.user.displayName || displayName;
            onAuthSuccess(cred2.user.uid, dn);
          }catch(err2){
            console.error('Giriş hatası (signIn):', err2 && err2.code, err2 && err2.message);
            setSubmitLoading(false);
            if(err2 && (err2.code === 'auth/wrong-password' || err2.code === 'auth/invalid-credential')){
              showLoginError('Bu kullanıcı adı zaten alınmış ve şifre yanlış. Lütfen doğru şifreyi gir.');
            } else if(err2 && err2.code === 'auth/too-many-requests'){
              showLoginError('Çok fazla yanlış deneme yapıldı. Biraz sonra tekrar dene.');
            } else {
              showLoginError('Giriş başarısız (' + (err2 && err2.code || 'bilinmeyen hata') + ').');
            }
          }
        } else if(err && err.code === 'auth/weak-password'){
          setSubmitLoading(false);
          showLoginError('Şifre çok zayıf, en az 6 karakter olmalı.');
        } else if(err && err.code === 'auth/invalid-email'){
          setSubmitLoading(false);
          showLoginError('Kullanıcı adında geçersiz karakterler var, sadece harf/rakam kullan.');
        } else if(err && (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found')){
          setSubmitLoading(false);
          showLoginError('Giriş sistemi henüz etkin değil: Firebase Console > Authentication > Sign-in method kısmından "Email/Password" sağlayıcısını etkinleştirmen gerekiyor.');
        } else if(err && err.code === 'auth/network-request-failed'){
          setSubmitLoading(false);
          showLoginError('İnternet bağlantısı sorunu, lütfen tekrar dene.');
        } else {
          setSubmitLoading(false);
          showLoginError('Hata: ' + (err && err.code || (err && err.message) || 'bilinmeyen hata'));
        }
      }
    }

    if(nameSubmit){
      nameSubmit.onclick = handleLoginSubmit;
    }
    if(passwordInput){
      passwordInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') handleLoginSubmit(); });
    }
    if(nameInput){
      nameInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){ if(passwordInput) passwordInput.focus(); }
      });
    }
    if(!nameSubmit || !nameInput){
      console.warn('Liderlik tablosu: giriş formu elementleri bulunamadı.');
    }

    function onAuthSuccess(uid, displayName){
      setSubmitLoading(false);
      hideNameModal();
      startTrackingWithUid(uid, displayName);
    }

    /* ---------------- SÜRE TAKİBİ (aktiflik bazlı, hile önleyici) ---------------- */
    let heartbeatTimer = null;
    let creditedSeconds = 0;
    let activeAccumulated = 0;
    let lastActivity = Date.now();
    let lastTick = Date.now();
    const FLUSH_MS = 5000;
    const IDLE_MS = 60000;

    const ACTIVITY_EVENTS = ['click','touchstart','touchmove','mousemove','keydown','scroll','pointerdown'];
    ACTIVITY_EVENTS.forEach(evt => {
      window.addEventListener(evt, () => { lastActivity = Date.now(); }, { passive:true });
    });

    function tickActive(){
      const now = Date.now();
      const idleFor = now - lastActivity;
      if(idleFor < IDLE_MS){
        activeAccumulated += (now - lastTick) / 1000;
      }
      lastTick = now;
    }
    setInterval(tickActive, 1000);

    function isIdleNow(){
      return (Date.now() - lastActivity) >= IDLE_MS;
    }

    async function startTrackingWithUid(uid, name){
      currentUid = uid;
      currentName = name;
      // currentUid az önce belli oldu; yeni bir veritabanı yazması beklemeden
      // önbellekteki son liderlik verisiyle "kaçıncı sıradayım" kutusunu hemen
      // güncelle (aksi halde bir sonraki veri değişikliğine kadar boş görünür).
      if(lastLbVal) processLbSnapshot(lastLbVal);
      listenOwnProfile(uid, name);
      // Göçü SADECE ilk kayıtta değil, HER girişte tekrar dene — bu sayede
      // güvenlik kuralları yeni yayınlandığında veya ilk göç bir sebeple
      // başarısız olduğunda, hesap kendi kendini bir sonraki girişte düzeltir.
      // migrateLegacyIfExists zaten "hedefte veri varsa dokunma" mantığında
      // olduğu için tekrar tekrar çağrılması güvenlidir.
      try{ await migrateLegacyIfExists(legacyKey(name), uid, name); }catch(e){}
      // progress.js (kişisel öğrenme modu) UID'nin hazır olduğu anı bekliyor;
      // burada haber veriyoruz ki kendi Firebase dinleyicilerini kursun.
      if(window.LB_onNameReady){
        try{ window.LB_onNameReady(name); }catch(e){}
      }
      if(!db) return;
      if(heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(flushElapsed, FLUSH_MS);
    }

    function listenOwnProfile(uid, name){
      const el = document.getElementById('profileTimer');
      if(!el) return;
      if(!db){
        el.textContent = `👤 ${name} — profil henüz bağlanmadı`;
        return;
      }
      db.ref('leaderboard/' + uid).on('value', (snap) => {
        const val = snap.val();
        const total = val && typeof val.totalSeconds === 'number' ? val.totalSeconds : 0;
        el.textContent = `👤 ${name} — Toplam süren: ${fmtTime(total)}`;
      });
    }

    function flushElapsed(useBeacon){
      tickActive();
      if(!currentUid) return;
      const delta = activeAccumulated - creditedSeconds;
      if(delta >= 0.5){
        addSeconds(currentUid, currentName, delta, useBeacon);
        creditedSeconds = activeAccumulated;
      }
    }

    function addSeconds(uid, name, seconds, useBeacon){
      if(!uid) return;
      if(useBeacon && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.databaseURL.indexOf('BURAYA_YAPISTIR') === -1){
        try{
          const url = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '') + '/leaderboard/' + uid + '/lastFlushAttempt.json';
          fetch(url, { method:'PUT', body: JSON.stringify(Date.now()), keepalive:true }).catch(()=>{});
        }catch(e){}
      }
      if(!db) return;
      const ref = db.ref('leaderboard/' + uid);
      ref.transaction((current) => {
        const prev = current && typeof current === 'object' ? current : { name: name, totalSeconds: 0 };
        return { name: name, totalSeconds: (prev.totalSeconds || 0) + seconds, lastSeen: Date.now() };
      });
    }

    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'hidden'){
        flushElapsed(true);
      } else {
        flushElapsed();
      }
    });
    window.addEventListener('beforeunload', () => flushElapsed(true));
    window.addEventListener('pagehide', () => flushElapsed(true));

    /* ---------------- LİDERLİK TABLOSU GÖRÜNÜMÜ (splash içinde sabit) ---------------- */
    function fmtTime(totalSeconds){
      const s = Math.max(0, Math.floor(totalSeconds || 0));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      if(h > 0) return `${h}s ${m}dk`;
      if(m > 0) return `${m}dk`;
      return `${s}sn`;
    }

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    const MEDALS = ['🥇','🥈','🥉'];

    // XP -> Seviye dönüşümü, progress.js ile BİREBİR aynı formül olmalı
    // (Math.floor(xp/200)+1). Farklı bir formül kullanılırsa kişisel modda
    // gösterilen seviye ile liderlik tablosundaki seviye tutmaz.
    function levelFromXp(xp){
      return Math.floor((xp||0) / 200) + 1;
    }

    // progress.js her meta.xp değiştiğinde (persistMeta) bunu çağırır; böylece
    // liderlik tablosu tek bir 'leaderboard' düğümünden hem süreyi hem de
    // XP/seviyeyi okuyabilir, ekstra bir veri okumasına gerek kalmaz.
    window.LB_updateXp = function(xp){
      if(!currentUid || !db) return;
      const ref = db.ref('leaderboard/' + currentUid);
      ref.transaction((current) => {
        const prev = current && typeof current === 'object' ? current : { name: currentName, totalSeconds: 0 };
        return Object.assign({}, prev, {
          name: currentName || prev.name,
          xp: xp || 0,
          lastSeen: Date.now()
        });
      });
    };
    function renderBoard(elId, entries, formatValue){
      const list = document.getElementById(elId);
      if(!list) return;
      if(!db){
        list.innerHTML = '<div class="lb-empty">Tablo henüz bağlanmadı.</div>';
        return;
      }
      if(!entries.length){
        list.innerHTML = '<div class="lb-empty">Henüz kimse yok.<br>İlk sen ol! 🎉</div>';
        return;
      }
      list.innerHTML = '';
      entries.forEach((e, i) => {
        const row = document.createElement('div');
        const isMe = e.uid === currentUid;
        row.className = 'lb-row' + (isMe ? ' me' : '');
        const rankDisplay = MEDALS[i] || (i+1);
        row.innerHTML = `
          <div class="lb-rank">${rankDisplay}</div>
          <div class="lb-name">${escapeHtml(e.name)}${isMe ? ' (sen)' : ''}</div>
          <div class="lb-time">${formatValue(e)}</div>`;
        list.appendChild(row);
      });
    }

    function renderTimeBoard(entries){
      renderBoard('splashLbTimeList', entries, e => fmtTime(e.totalSeconds));
    }
    function renderLevelBoard(entries){
      renderBoard('splashLbLevelList', entries, e => 'Sv ' + levelFromXp(e.xp));
    }

    function renderMyRanks(timeRank, timeTotal, levelRank, levelTotal){
      const box = document.getElementById('myRankBox');
      if(!box) return;
      if(!db){
        box.innerHTML = '<div class="my-rank-empty">🏅 Tablo henüz bağlanmadı.</div>';
        return;
      }
      if(!currentUid){
        box.innerHTML = '<div class="my-rank-empty">🏅 Sıralamanı görmek için giriş yap</div>';
        return;
      }
      const timeTxt = timeRank
        ? `<span class="my-rank-value">${timeRank}.</span><span class="my-rank-total"> / ${timeTotal}</span>`
        : '<span class="my-rank-pending">henüz veri yok</span>';
      const levelTxt = levelRank
        ? `<span class="my-rank-value">${levelRank}.</span><span class="my-rank-total"> / ${levelTotal}</span>`
        : '<span class="my-rank-pending">henüz veri yok</span>';
      box.innerHTML = `
        <div class="my-rank-row">
          <span class="my-rank-icon">⏱️</span>
          <span class="my-rank-label">Süre sıralaması</span>
          ${timeTxt}
        </div>
        <div class="my-rank-row">
          <span class="my-rank-icon">⭐</span>
          <span class="my-rank-label">Seviye sıralaması</span>
          ${levelTxt}
        </div>`;
    }

    let lastLbVal = null;

    function processLbSnapshot(val){
      lastLbVal = val;
      const all = Object.entries(val || {})
        .filter(([k, v]) => v && v.name)
        .map(([k, v]) => ({ uid: k, name: v.name, totalSeconds: v.totalSeconds || 0, xp: v.xp || 0 }));

      const byTime = all.slice().sort((a,b) => (b.totalSeconds||0) - (a.totalSeconds||0));
      const byLevel = all.slice().sort((a,b) => (b.xp||0) - (a.xp||0));

      renderTimeBoard(byTime.slice(0, 5));
      renderLevelBoard(byLevel.slice(0, 5));

      let timeRank = null, levelRank = null;
      if(currentUid){
        const ti = byTime.findIndex(e => e.uid === currentUid);
        const li = byLevel.findIndex(e => e.uid === currentUid);
        timeRank = ti >= 0 ? ti + 1 : null;
        levelRank = li >= 0 ? li + 1 : null;
      }
      renderMyRanks(timeRank, byTime.length, levelRank, byLevel.length);
    }

    function listenLeaderboard(){
      if(!db){
        renderTimeBoard([]);
        renderLevelBoard([]);
        renderMyRanks(null, 0, null, 0);
        return;
      }
      db.ref('leaderboard').on('value', (snap) => {
        processLbSnapshot(snap.val() || {});
      }, (err) => {
        console.warn('Liderlik verisi okunamadı:', err);
        renderTimeBoard([]);
        renderLevelBoard([]);
        renderMyRanks(null, 0, null, 0);
      });
    }

    /* ---------------- BAŞLAT ---------------- */
    listenLeaderboard();

    if(authSvc){
      authSvc.onAuthStateChanged((user) => {
        if(user){
          const dn = user.displayName || 'Kullanıcı';
          startTrackingWithUid(user.uid, dn);
        }
      });
    }

    window.LB_checkName = function(){
      if(!currentUid){ showNameModal(); }
    };
    window.LB_getActiveSeconds = () => activeAccumulated;
    window.LB_isIdle = isIdleNow;
    window.LB_getDb = () => db;
    window.LB_getUserName = () => currentName;
    window.LB_getTotalSeconds = (name, cb) => {
      if(!db || !currentUid){ cb(0); return; }
      db.ref('leaderboard/' + currentUid).once('value').then(snap=>{
        const val = snap.val();
        cb(val && typeof val.totalSeconds === 'number' ? val.totalSeconds : 0);
      }).catch(()=>cb(0));
    };
  }catch(err){
    console.error('Liderlik tablosu başlatılırken hata oluştu:', err);
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initLeaderboard);
} else {
  initLeaderboard();
}
