/* ================================================================
   PROGRESS.JS - "Kişisel Mod": isme özel ilerleme takibi (v2)
   - Bir kelime quiz'de doğru cevaplanınca bilindiği varsayılır, bir
     daha normal çalışmada karşımıza çıkmaz (self-report yalanı yok).
   - Çalışmaya Başla: aynı kategoriden 10 kelime -> kart (tanışma) ->
     yazılı quiz -> dinleme quizi. İki turda da doğruysa bilinir;
     yanlışsa bir sonraki değil ondan sonraki oturumda tekrar çıkar.
   - Genel Tekrar: seviye grubunda (A1-A2/B1-B2) bilinen kelimeleri
     tekrar sorar; yanlışsa bilinmiyor listesine geri düşer.
   - Görevler + XP sistemi, günlük tekrar kuyruğu (dün öğrenilenler).
================================================================ */
(function(){

  const BADGE_THRESHOLDS = [50, 100, 250, 500, 1000];
  const PM_FLAGS = { de:'🇩🇪', en:'🇬🇧', ar:'🇸🇦', fr:'🇫🇷', es:'🇪🇸', ru:'🇷🇺' };
  const DEFAULT_DAILY_GOAL = 100;
  const BATCH_SIZE = 10;
  const RETRY_SESSION_GAP = 1; // 1: hemen bir sonraki oturumu atlar, ondan sonraki oturumda tekrar çıkar
  const XP_PER_NEW_WORD = 5;
  const TASK_XP = { t1:25, t2:100, t3:300, t5:200 };
  const TASK5_SECONDS = 60*60;

  let currentName = '';
  let currentKey = '';
  let dataLoaded = false;
  let wordProgress = {};
  let meta = null;

  let batch = [];
  let batchResult = {};
  let cardIdx = 0, quizIdx = 0, listenIdx = 0, fillIdx = 0;
  let quizOrder = [], listenOrder = [], fillOrder = [];
  let sessionStats = { total:0, correct:0, wrong:0, xp:0, newKnown:0, newBadges:[], mistakes:[] };
  let currentAnswered = false;
  let reviewMode = null;

  const root = document.getElementById('personalView');

  function sanitizeKeyFallback(name){
    return String(name).trim().toLowerCase().replace(/\s+/g,'_').slice(0,20).replace(/[.#$\/\[\]]/g,'_');
  }
  function getKey(name){
    return (window.LB_sanitizeKey ? window.LB_sanitizeKey(name) : sanitizeKeyFallback(name));
  }
  function dbRef(path){
    const db = window.LB_getDb ? window.LB_getDb() : null;
    return db ? db.ref(path) : null;
  }
  function safeLocalGet(k){
    try{ const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
  }
  function safeLocalSet(k, val){
    try{ localStorage.setItem(k, JSON.stringify(val)); }catch(e){}
  }
  function todayStr(){
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function dayDiff(a,b){
    const da = new Date(a+'T00:00:00');
    const db_ = new Date(b+'T00:00:00');
    return Math.round((db_-da)/86400000);
  }
  function defaultMeta(){
    return {
      xp:0, streak:0, lastStudyDate:null, todayDate:null, todayCount:0,
      dailyGoal:DEFAULT_DAILY_GOAL, badges:{}, dailyCounts:{},
      studySessionCount:0,
      tasksDate:null, tasks:{t1:false,t2:false,t3:false,t4:false,t5:false},
      lastDueCount:0
    };
  }
  function wordKeyFor(v){
    const raw = v.lang+'_'+v.level+'_'+v.w;
    return raw.toLowerCase()
      .replace(/[.#$\[\]\/\s]+/g,'_')
      .replace(/[^a-z0-9_aoubcdefghijklmnopqrstuvwxyz]/gi,'_')
      .slice(0,120);
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    return arr;
  }
  function pmSpeak(text, langCode, slow){
    if(typeof soundOn !== 'undefined' && !soundOn) return;
    try{
      if(slow && typeof speakSlow === 'function'){ speakSlow(text, langCode); return; }
      if(typeof speak === 'function'){ speak(text, langCode); return; }
    }catch(e){}
  }

  // Firebase'den gelen kelime kayıtlarını, hafızadaki (henüz Firebase'e
  // ulaşmamış olabilecek) daha taze ilerlemenin ÜZERİNE KÖRÜ KÖRÜNE
  // YAZMAK yerine, her kelime için hangi kayıt daha güncelse (lastSeen'e
  // göre) onu koruyarak birleştirir. Bu, "bilinen kelimeler sıfırlandı"
  // hatasının kök nedenini (loadUserData'nın tekrar tetiklenip henüz
  // senkronize olmamış Firebase verisiyle hafızayı ezmesi) engeller.
  function mergeWordProgress(localWords, remoteWords){
    const merged = Object.assign({}, remoteWords || {});
    Object.keys(localWords || {}).forEach(key=>{
      const l = localWords[key];
      const r = merged[key];
      if(!r){ merged[key] = l; return; }
      const lTime = l.lastSeen || 0;
      const rTime = r.lastSeen || 0;
      // Eşitlik durumunda (ör. iki tarafta da lastSeen yoksa) yerelde
      // "known" varsa onu koru — veri kaybını asla tercih etme.
      if(lTime > rTime || (lTime === rTime && l.known && !r.known)){
        merged[key] = l;
      }
    });
    return merged;
  }

  function loadUserData(name, cb){
    currentName = name;
    currentKey = getKey(name);
    dataLoaded = false;
    const local = safeLocalGet('pm_data_'+currentKey);
    const localWords = (local && local.words) ? local.words : {};
    const localMeta = (local && local.meta) ? local.meta : null;
    wordProgress = localWords;
    meta = localMeta;

    const ref = dbRef('progress/'+currentKey);
    if(ref){
      ref.once('value').then(snap=>{
        const val = snap.val();
        if(val){
          if(val.words) wordProgress = mergeWordProgress(localWords, val.words);
          // meta için de veri kaybını önle: hangi taraf daha ilerideyse
          // (xp daha yüksekse) onu esas al; xp yoksa/eşitse yereli koru.
          if(val.meta){
            const localXp = (localMeta && localMeta.xp) || 0;
            const remoteXp = val.meta.xp || 0;
            meta = (remoteXp >= localXp) ? val.meta : localMeta;
          }
        }
        finalizeLoad(cb);
      }).catch(()=> finalizeLoad(cb));
    } else {
      finalizeLoad(cb);
    }
  }
  function finalizeLoad(cb){
    wordProgress = wordProgress || {};
    meta = Object.assign(defaultMeta(), meta || {});
    if(!meta.tasks) meta.tasks = {t1:false,t2:false,t3:false,t4:false,t5:false};
    ensureDailyRollover();
    persistLocalMirror();
    dataLoaded = true;
    // Bu oturumda hiç XP kazanılmasa bile (ör. kullanıcı sadece göz atıyor),
    // seviye liderlik tablosunun güncel kalması için mevcut XP'yi bildir.
    if(window.LB_updateXp) window.LB_updateXp(meta.xp||0);
    if(cb) cb();
  }
  function persistLocalMirror(){
    safeLocalSet('pm_data_'+currentKey, { words: wordProgress, meta: meta });
  }
  function persistMeta(){
    persistLocalMirror();
    const ref = dbRef('progress/'+currentKey+'/meta');
    if(ref){
      /* Sunucudaki XP bu cihazınkinden yüksekse (başka bir cihazda çalışılmış
         ya da yöneticiden XP gelmişse) onu EZMEYELİM: önce yükseğe hizalanıp
         öyle yazıyoruz. Aksi hâlde iki cihaz birbirinin değerini sürekli geri
         alıyor ve sıralama oynuyordu. */
      ref.transaction(function(cur){
        var remoteXp = (cur && typeof cur.xp === 'number') ? cur.xp : 0;
        if(remoteXp > (meta.xp||0)) meta.xp = remoteXp;
        /* Sunucudaki özel rozetleri (admin verdiği ya da başka cihazda kazanılan)
           KORU — yoksa bu cihazın kaydı onları silebilir. */
        if(cur && cur.awards){ meta.awards = Object.assign({}, cur.awards, meta.awards||{}); }
        /* İlk kayıt zamanı bir kez yazılır, bir daha değişmez — ileride
           "ilk N kişi" gibi kayıt-sırası bazlı işler için gerekli. */
        meta.joinedAt = (cur && cur.joinedAt) ? cur.joinedAt : Date.now();
        return meta;
      }, function(){ persistLocalMirror(); }, false);
    }
    // Seviye liderlik tablosu 'leaderboard/{uid}/xp' alanını okur; her meta
    // kaydında (görev tamamlama, XP kazanma, oturum bitişi vb.) burayı da
    // güncel tutuyoruz ki ayrı bir okuma yapmadan tek dinleyiciyle hem süre
    // hem seviye sıralaması hesaplanabilsin.
    if(window.LB_updateXp) window.LB_updateXp(meta.xp||0);
  }
  function ensureDailyRollover(){
    const t = todayStr();
    if(meta.todayDate !== t){ meta.todayDate = t; meta.todayCount = 0; }
    if(meta.tasksDate !== t){ meta.tasksDate = t; meta.tasks = {t1:false,t2:false,t3:false,t4:false,t5:false}; meta.todayActiveSeconds = 0; }
  }
  function markStudyToday(){
    const t = todayStr();
    if(meta.lastStudyDate !== t){
      const diff = meta.lastStudyDate ? dayDiff(meta.lastStudyDate, t) : null;
      meta.streak = (diff === 1) ? (meta.streak||0)+1 : 1;
      meta.lastStudyDate = t;
    }
    meta.dailyCounts = meta.dailyCounts || {};
    meta.dailyCounts[t] = (meta.dailyCounts[t]||0) + 1;
    const keys = Object.keys(meta.dailyCounts).sort();
    while(keys.length > 30){ delete meta.dailyCounts[keys.shift()]; }
  }
  function checkBadges(){
    const known = Object.values(wordProgress).filter(r=>r.known).length;
    BADGE_THRESHOLDS.forEach(t=>{
      if(known>=t && !(meta.badges && meta.badges[t])){
        meta.badges = meta.badges || {};
        meta.badges[t] = true;
        sessionStats.newBadges.push(t);
        showToast('Rozet kazandın: '+t+' kelime öğrenildi!');
      }
    });
    checkStreakAwards();
  }
  /* Seri (streak) kilometre taşı başarımları → meta.awards (özel rozetlerle aynı yer) */
  function checkStreakAwards(){
    const s = meta.streak||0;
    const STREAK_AWARDS = [[3,'🔥','3 Gün Seri'],[7,'⚡','7 Gün Seri'],[14,'🌙','14 Gün Seri'],
                           [30,'🏅','30 Gün Seri'],[60,'💎','60 Gün Seri'],[100,'👑','100 Gün Seri']];
    meta.awards = meta.awards || {};
    STREAK_AWARDS.forEach(a=>{
      const key = 'streak'+a[0];
      if(s>=a[0] && !meta.awards[key]){
        meta.awards[key] = { e:a[1], n:a[2], ts:Date.now() };
        showToast('Başarım açıldı: '+a[2]+' 🎉');
      }
    });
  }
  function addXp(amount, reason){
    if(amount <= 0) return;
    meta.xp = (meta.xp||0) + amount;
    if(reason) showToast('+'+amount+' XP - '+reason);
  }
  function showToast(msg){
    let layer = document.getElementById('pmToastLayer');
    if(!layer){
      layer = document.createElement('div');
      layer.id = 'pmToastLayer';
      layer.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
      document.body.appendChild(layer);
    }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'background:linear-gradient(135deg,#1a1235,#0a0715);border:1px solid rgba(79,232,255,0.6);color:#eef4ff;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:700;box-shadow:0 6px 22px rgba(0,0,0,0.4),0 0 18px rgba(79,232,255,0.3);opacity:0;transform:translateY(-8px);transition:opacity .35s ease, transform .35s ease;';
    layer.appendChild(t);
    requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='translateY(0)'; });
    setTimeout(()=>{
      t.style.opacity='0'; t.style.transform='translateY(-8px)';
      setTimeout(()=>t.remove(), 400);
    }, 3200);
  }
  function getRecord(v){ return wordProgress[wordKeyFor(v)] || null; }

  function checkThresholdTasks(){
    const t = meta.todayCount||0;
    if(t>=10 && !meta.tasks.t1){ meta.tasks.t1 = true; addXp(TASK_XP.t1, 'Görev: bugün 10 yeni kelime'); }
    if(t>=50 && !meta.tasks.t2){ meta.tasks.t2 = true; addXp(TASK_XP.t2, 'Görev: bugün 50 yeni kelime'); }
    if(t>=100 && !meta.tasks.t3){ meta.tasks.t3 = true; addXp(TASK_XP.t3, 'Görev: bugün 100 yeni kelime'); }
  }
  let _t5SessionBaseline = 0; /* bu sayfa yüklemesinde en son okunan oturum süresi (yinelemeyi önlemek için) */
  function checkTask5(){
    ensureDailyRollover();
    if(meta.tasks.t5) return;
    /* DÜZELTME: eskiden var olmayan window.APP_getActiveSeconds çağrılıyordu,
       bu yüzden süre her zaman 0 okunup görev asla tamamlanamıyordu. Doğru
       fonksiyon window.LB_getActiveSeconds (leaderboard.js). Ayrıca artık
       tek bir oturuma bağlı değil — GÜNLÜK toplam aktif süreye göre çalışır:
       uygulamayı gün içinde birden çok kez açıp kapatsa bile birikir. */
    const sessionSecs = (window.LB_getActiveSeconds ? window.LB_getActiveSeconds() : 0);
    const delta = Math.max(0, sessionSecs - _t5SessionBaseline);
    _t5SessionBaseline = sessionSecs;
    if(delta > 0){
      meta.todayActiveSeconds = (meta.todayActiveSeconds||0) + delta;
    }
    if((meta.todayActiveSeconds||0) >= TASK5_SECONDS){
      meta.tasks.t5 = true; addXp(TASK_XP.t5, 'Görev: günde 60dk çalışma');
      persistMeta();
    }
  }
  function awardTask4(reviewedCount){
    if(meta.tasks.t4 || reviewedCount<=0) return;
    meta.tasks.t4 = true;
    addXp(reviewedCount*2, 'Görev: günlük tekrarı tamamla');
  }

  function levelGroups(){
    const levels = LANGS[activeLang].levels;
    const groups = [];
    for(let i=0;i<levels.length;i+=2){
      const chunk = levels.slice(i, i+2);
      groups.push({ name: chunk.join('-'), levels: chunk });
    }
    return groups;
  }

  function poolForActiveLang(){ return VOCAB.filter(v => v.lang === activeLang); }
  function poolForActiveFilter(){
    return (activeLevel === 'TUMU' || activeLevel === 'TÜMÜ') ? poolForActiveLang() : poolForActiveLang().filter(v=>v.level===activeLevel);
  }
  function knownCountIn(list){
    return list.filter(v=>{ const r=getRecord(v); return r && r.known; }).length;
  }
  function totalStudiedCount(){
    return Object.values(wordProgress).filter(r=>(r.seen||0) > 0).length;
  }
  function accuracyOverall(){
    let c=0,w=0;
    Object.values(wordProgress).forEach(r=>{ c+=r.correct||0; w+=r.wrong||0; });
    const tot = c+w;
    return tot>0 ? Math.round((c/tot)*100) : null;
  }
  function categoryAccuracy(){
    const byCat = {};
    Object.values(wordProgress).forEach(r=>{
      const cat = r.cat || '-';
      byCat[cat] = byCat[cat] || {c:0,w:0};
      byCat[cat].c += r.correct||0; byCat[cat].w += r.wrong||0;
    });
    let best=null,worst=null;
    Object.keys(byCat).forEach(cat=>{
      const tot = byCat[cat].c+byCat[cat].w;
      if(tot < 3) return;
      const acc = byCat[cat].c/tot;
      if(!best || acc>best.acc) best = {cat, acc};
      if(!worst || acc<worst.acc) worst = {cat, acc};
    });
    return {best, worst};
  }
  // ESKİ (dahili) mekanik: bir çalışma oturumunda yanlış yapılan kelimeler,
  // bir sonraki oturumu atlayıp ondan sonraki oturumda normal çalışma
  // havuzuna geri döner. Bu, kullanıcıya AYRI bir "kuyruk" olarak GÖSTERİLMEZ,
  // sadece pickBatch() içinde sessizce çalışır.
  function sessionRetryDueWords(){
    const pool = poolForActiveFilter();
    const out = [];
    pool.forEach(v=>{
      const r = getRecord(v);
      if(r && !r.known && r.retryAfterSession != null && r.retryAfterSession <= meta.studySessionCount){
        out.push(v);
      }
    });
    return out;
  }
  // YENİ Günlük Tekrar: DÜN öğrenilmiş (bilinen işaretlenmiş) kelimeleri bugün
  // tekrar sormak için. Aktif dile göre (seviye filtresinden bağımsız).
  function yesterdayStr(){
    const d = new Date();
    d.setDate(d.getDate()-1);
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function dailyReviewWords(){
    const y = yesterdayStr();
    return poolForActiveLang().filter(v=>{
      const r = getRecord(v);
      return r && r.known && r.learnedDate === y;
    });
  }

  function injectStyles(){
    if(document.getElementById('pmStyles')) return;
    const style = document.createElement('style');
    style.id = 'pmStyles';
    style.textContent = `
      .pm-root{
        --pm-accent:#4fe8ff; --pm-accent2:#ff5fb8; --pm-accent3:#9b7bff; --pm-good:#3dffa0; --pm-bad:#ff5f7a;
        --pm-panel: linear-gradient(160deg, rgba(18,14,38,0.38), rgba(10,8,22,0.42));
        --pm-border: rgba(79,232,255,0.35);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      }
      .pm-root .pm-head{
        text-align:center;padding:18px 14px 22px;border-radius:22px;margin-bottom:16px;
        background: radial-gradient(circle at 50% -10%, rgba(79,232,255,0.16), transparent 60%), var(--pm-panel);
        border:1px solid var(--pm-border);
        box-shadow:0 8px 30px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(79,232,255,0.12);
      }
      .pm-root .pm-eyebrow{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--pm-accent);margin-bottom:6px;}
      .pm-root .pm-title{font-family:Georgia,'Iowan Old Style',serif;font-size:22px;font-weight:700;color:#eef4ff;margin-bottom:2px;}
      .pm-root .pm-sub{font-size:11.5px;color:#8291b3;}
      .pm-root .pm-pill-row{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:14px;}
      .pm-root .pm-pill{padding:6px 12px;border-radius:999px;font-size:11.5px;font-weight:700;background:rgba(79,232,255,0.1);border:1px solid var(--pm-border);color:#eef4ff;}
      .pm-root .pm-pill.flame{background:rgba(255,95,184,0.14);border-color:rgba(255,95,184,0.4);}
      .pm-root .pm-mini-select{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:14px;}
      .pm-root .pm-lang-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px;}
      .pm-root .pm-lang-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:11px 6px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(79,232,255,0.18);cursor:pointer;transition:border-color .15s,background .15s,transform .1s;}
      .pm-root .pm-cat-card{position:relative;}
      .pm-root .pm-cat-check{position:absolute;top:6px;right:6px;width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:9px;color:transparent;transition:all .15s;}
      .pm-root .pm-cat-card.sel{border-color:#3dffa0;background:rgba(61,255,160,0.08);}
      .pm-root .pm-cat-card.sel .pm-cat-check{background:#3dffa0;border-color:#3dffa0;color:#0a0d14;}
      .pm-root .pm-lang-card:active{transform:scale(.96);}
      .pm-root .pm-lang-card.active{border-color:#4fe8ff;background:rgba(79,232,255,0.10);}
      .pm-root .pm-lang-card .fl{font-size:22px;line-height:1;}
      .pm-root .pm-lang-card .nm{font-size:11.5px;font-weight:700;color:#8291b3;}
      .pm-root .pm-lang-card.active .nm{color:#eef4ff;}
      .pm-root .pm-level-seg{display:flex;gap:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(79,232,255,0.18);border-radius:14px;padding:5px;margin-top:10px;}
      .pm-root .pm-level-seg .lvl{flex:1;text-align:center;padding:8px 0;border-radius:10px;font-size:12.5px;font-weight:700;letter-spacing:.04em;color:#8291b3;cursor:pointer;transition:all .2s;}
      .pm-root .pm-level-seg .lvl:active{transform:scale(.94);}
      .pm-root .pm-level-seg .lvl.active{background:rgba(79,232,255,0.16);color:#eef4ff;}
      .pm-root .pm-sup-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
      .pm-root .pm-sup-badge{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 6px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);}
      .pm-root .pm-sup-badge .e{font-size:26px;line-height:1;filter:grayscale(1);opacity:.32;transition:filter .2s,opacity .2s;}
      .pm-root .pm-sup-badge.owned{border-color:rgba(255,210,59,0.35);background:rgba(255,210,59,0.08);}
      .pm-root .pm-sup-badge.owned .e{filter:none;opacity:1;}
      .pm-root .pm-sup-badge .lock{position:absolute;top:7px;right:8px;font-size:13px;opacity:.75;}
      .pm-root .pm-sup-badge .nm{font-size:10.5px;font-weight:700;color:#8291b3;text-align:center;}
      .pm-root .pm-sup-badge.owned .nm{color:#ffe9a8;}
      .pm-root .pm-chip{padding:6px 11px;border-radius:10px;font-size:11.5px;font-weight:700;color:#8291b3;background:rgba(255,255,255,0.03);border:1px solid rgba(79,232,255,0.18);cursor:pointer;transition:transform .15s ease, border-color .15s ease, background .15s ease, color .15s ease;}
      .pm-root .pm-chip:hover{border-color:rgba(79,232,255,0.4);color:#eef4ff;}
      .pm-root .pm-chip:active{transform:scale(.94);}
      .pm-root .pm-chip.active{
        color:#0a0715;
        background:linear-gradient(120deg,var(--pm-accent),var(--pm-accent3),var(--pm-accent2));
        background-size:250% 250%;
        animation:pmNeonShift 6s ease-in-out infinite;
        border-color:transparent;
        box-shadow:0 0 14px rgba(79,232,255,0.35);
      }
      .pm-root .pm-goal-wrap{margin-top:14px;text-align:left;}
      .pm-root .pm-goal-row{display:flex;justify-content:space-between;font-size:11px;color:#8291b3;margin-bottom:5px;}
      .pm-root .pm-bar{height:6px;border-radius:6px;background:rgba(255,255,255,0.08);overflow:hidden;}
      .pm-root .pm-bar-fill{height:100%;background:linear-gradient(90deg,var(--pm-accent),var(--pm-accent2));transition:width .3s ease;}
      .pm-root .pm-card{
        background:var(--pm-panel);border:1px solid var(--pm-border);border-radius:18px;padding:16px;margin-bottom:12px;
        box-shadow:0 6px 22px rgba(0,0,0,0.3);
      }
      .pm-root .pm-card h4{margin:0 0 10px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--pm-accent);}
      .pm-root .pm-level-row{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:#eef4ff;margin-bottom:8px;}
      .pm-root .pm-level-row .pm-bar{flex:1;margin:0 10px;}
      .pm-root .pm-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
      .pm-root .pm-stat-box{background:rgba(255,255,255,0.03);border:1px solid rgba(79,232,255,0.14);border-radius:12px;padding:10px 12px;}
      .pm-root .pm-stat-num{font-size:19px;font-weight:800;color:#eef4ff;font-family:Georgia,serif;}
      .pm-root .pm-stat-label{font-size:10.5px;color:#8291b3;margin-top:2px;}
      .pm-root .pm-badges{display:flex;gap:8px;flex-wrap:wrap;}
      .pm-root .pm-awards{display:flex;gap:8px;flex-wrap:wrap;}
      .pm-root .pm-award{display:flex;align-items:center;gap:7px;padding:7px 12px 7px 9px;border-radius:999px;background:rgba(255,210,59,0.10);border:1px solid rgba(255,210,59,0.35);}
      .pm-root .pm-award-e{font-size:17px;line-height:1;}
      .pm-root .pm-award-n{font-size:12.5px;font-weight:700;color:#ffe9a8;white-space:nowrap;}
      .pm-root .pm-badge{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;background:rgba(79,232,255,0.12);border:1px solid var(--pm-border);}
      .pm-root .pm-badge.locked{opacity:.25;filter:grayscale(1);}
      .pm-root .pm-task{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(79,232,255,0.12);}
      .pm-root .pm-task:last-child{border-bottom:none;}
      .pm-root .pm-task-icon{font-size:16px;width:22px;text-align:center;flex-shrink:0;}
      .pm-root .pm-task-body{flex:1;min-width:0;}
      .pm-root .pm-task-label{font-size:12.5px;color:#eef4ff;}
      .pm-root .pm-task-ring{position:relative;width:40px;height:40px;min-width:40px;max-width:40px;flex:none;display:flex;align-items:center;justify-content:center;}
      .pm-root .pm-task-ring-svg{position:absolute;inset:0;width:40px;height:40px;display:block;}
      .pm-root .pm-task-ring span{position:relative;z-index:1;font-size:9px;font-weight:800;color:#eef4ff;}
      .pm-root .pm-task-sub{font-size:10.5px;color:#8291b3;margin-top:2px;}
      .pm-root .pm-task.done .pm-task-label{color:var(--pm-good);text-decoration:line-through;opacity:.8;}
      .pm-root .pm-due-banner{
        display:flex;justify-content:space-between;align-items:center;gap:10px;
        background:rgba(255,95,122,0.1);border:1px solid rgba(255,95,122,0.4);border-radius:14px;padding:12px 14px;margin-bottom:12px;
      }
      .pm-root .pm-due-banner .pm-due-text{font-size:12.5px;color:#ffd2d9;}
      .pm-root .pm-due-banner button{flex-shrink:0;padding:8px 14px;border-radius:10px;border:1px solid rgba(255,95,122,0.5);background:rgba(255,95,122,0.18);color:#ffd2d9;font-size:12px;font-weight:700;cursor:pointer;transition:transform .15s ease, background .15s ease;}
      .pm-root .pm-due-banner button:hover{background:rgba(255,95,122,0.3);}
      .pm-root .pm-due-banner button:active{transform:scale(.94);}
      .pm-root .pm-group-row{display:flex;gap:8px;margin-top:8px;}
      .pm-root .pm-group-btn{flex:1;padding:12px 6px;border-radius:12px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid var(--pm-border);color:#eef4ff;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .15s ease, border-color .15s ease, box-shadow .15s ease;}
      .pm-root .pm-group-btn:hover{transform:translateY(-2px);border-color:rgba(79,232,255,0.45);box-shadow:0 6px 16px rgba(0,0,0,0.3);}
      .pm-root .pm-group-btn:active{transform:scale(.96);}
      .pm-root .pm-group-btn .g-count{display:block;font-size:10px;color:#8291b3;font-weight:400;margin-top:2px;}
      .pm-root button.pm-btn{
        width:100%;padding:14px 0;border-radius:14px;border:1px solid var(--pm-border);
        background:rgba(255,255,255,0.03);color:#eef4ff;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px;
        transition:transform .15s ease, box-shadow .2s ease, opacity .15s ease;
      }
      .pm-root button.pm-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,0.3);}
      .pm-root button.pm-btn.primary{
        position:relative;overflow:hidden;
        background:linear-gradient(120deg, var(--pm-accent), var(--pm-accent3), var(--pm-accent2), var(--pm-accent));
        background-size:300% 300%;
        animation:pmNeonShift 5s ease-in-out infinite;
        color:#04050a;border:none;font-weight:800;
        box-shadow:0 6px 24px rgba(79,232,255,0.35), 0 0 34px rgba(255,95,184,0.28);
      }
      @keyframes pmNeonShift{
        0%{background-position:0% 50%;}
        50%{background-position:100% 50%;}
        100%{background-position:0% 50%;}
      }
      .pm-root button.pm-btn.primary:hover{box-shadow:0 10px 32px rgba(79,232,255,0.5), 0 0 44px rgba(255,95,184,0.4);}
      .pm-root button.pm-btn:active{opacity:.7;transform:scale(.98);}
      .pm-root button.pm-btn.small{padding:10px 0;font-size:12.5px;}
      .pm-root .pm-session-bar{display:flex;justify-content:space-between;font-size:11.5px;color:#8291b3;margin-bottom:8px;}
      .pm-root .pm-study-card{
        background:var(--pm-panel);border:1px solid var(--pm-border);border-radius:20px;padding:26px 20px;text-align:center;margin-bottom:16px;
        box-shadow:0 10px 30px rgba(0,0,0,0.35);cursor:pointer;transition:transform .2s ease, box-shadow .2s ease;
      }
      .pm-root .pm-study-card:hover{transform:translateY(-2px);box-shadow:0 14px 38px rgba(0,0,0,0.42);}
      .pm-root .pm-study-card:active{transform:scale(.99);}
      .pm-root .pm-mode-tag{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--pm-accent);margin-bottom:10px;}
      .pm-root .pm-word{font-size:27px;font-weight:700;font-family:Georgia,'Iowan Old Style',serif;color:#eef4ff;margin-bottom:6px;}
      .pm-root .pm-word-sub{font-size:12px;color:#8291b3;margin-bottom:8px;}
      .pm-root .pm-speak-row{display:flex;justify-content:center;gap:10px;margin:10px 0 4px;}
      .pm-root .pm-fill-row{font-family:Georgia,'Iowan Old Style',serif;font-size:19px;color:#eef4ff;background:var(--pm-panel);border:1px solid var(--pm-border);border-radius:14px;padding:16px;margin-bottom:0;line-height:1.6;}
      .pm-root .pm-fill-input{width:100%;box-sizing:border-box;font-family:Georgia,'Iowan Old Style',serif;font-size:16px;color:#eef4ff;background:var(--pm-panel);border:1px solid var(--pm-border);border-radius:14px;padding:14px 16px;outline:none;}
      .pm-root .pm-fill-input:focus{border-color:var(--pm-accent);}
      .pm-root .pm-fill-fb{min-height:20px;font-size:12.5px;margin:10px 0 4px;font-weight:600;}
      .pm-root .pm-fill-fb.ok{color:#3dffa0;}
      .pm-root .pm-fill-fb.bad{color:#ff8a8a;}
      .pm-root .pm-speak-caption{
        text-align:center;margin-bottom:8px;
        font-size:10.5px;font-weight:600;letter-spacing:.03em;
        color:#9b7bff;
        opacity:.85;
      }
      @supports ((background-clip:text) or (-webkit-background-clip:text)){
        .pm-root .pm-speak-caption{
          background:linear-gradient(90deg,#4fe8ff,#ff5fb8,#9b7bff);
          -webkit-background-clip:text;background-clip:text;
          -webkit-text-fill-color:transparent;color:transparent;
          filter:drop-shadow(0 0 4px rgba(155,123,255,0.35));
        }
      }
      .pm-root .pm-speak-btn{
        display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;font-size:19px;
        background:rgba(79,232,255,0.14);border:1px solid var(--pm-border);cursor:pointer;
        transition:transform .15s ease, box-shadow .15s ease;
      }
      .pm-root .pm-speak-btn:hover{transform:translateY(-1px);box-shadow:0 0 12px rgba(79,232,255,0.35);}
      .pm-root .pm-speak-btn:active{transform:scale(.88);}
      .pm-root .pm-options{display:flex;flex-direction:column;gap:9px;margin-top:6px;}
      .pm-root .pm-opt{padding:12px 14px;border-radius:12px;border:1px solid var(--pm-border);background:rgba(255,255,255,0.03);color:#eef4ff;font-size:14px;text-align:left;cursor:pointer;transition:transform .15s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease;}
      .pm-root .pm-opt:hover:not([disabled]){border-color:rgba(79,232,255,0.5);background:rgba(79,232,255,0.08);transform:translateX(2px);}
      .pm-root .pm-opt:active:not([disabled]){transform:scale(.98);}
      .pm-root .pm-opt.correct{background:rgba(61,255,160,0.14);border-color:var(--pm-good);color:var(--pm-good);box-shadow:0 0 14px rgba(61,255,160,0.25);}
      .pm-root .pm-opt.wrong{background:rgba(255,95,122,0.14);border-color:var(--pm-bad);color:var(--pm-bad);box-shadow:0 0 14px rgba(255,95,122,0.25);}
      .pm-root .pm-opt[disabled]{cursor:default;}
      .pm-root .pm-weak-item{background:var(--pm-panel);border:1px solid var(--pm-border);border-radius:14px;padding:14px 16px;margin-bottom:10px;text-align:left;}
      .pm-root .pm-weak-word{font-size:16px;font-weight:700;color:#eef4ff;}
      .pm-root .pm-weak-meta{font-size:11px;color:#8291b3;margin-top:4px;line-height:1.6;}
      .pm-root .pm-known-item{display:flex;justify-content:space-between;gap:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(79,232,255,0.16);border-radius:10px;padding:8px 12px;margin-bottom:6px;font-size:12.5px;}
      .pm-root .pm-known-item b{color:#eef4ff;}
      .pm-root .pm-known-item span{color:#8291b3;}
      .pm-root .pm-empty{text-align:center;padding:30px 10px;color:#8291b3;font-size:13px;}
      .pm-root .pm-loading{text-align:center;padding:40px 10px;color:#8291b3;font-size:13px;}
      .pm-root .pm-back-link{display:block;text-align:center;font-size:11.5px;color:#8291b3;margin-top:4px;cursor:pointer;text-decoration:underline;}
    `;
    document.head.appendChild(style);
  }

  function renderHome(){
    injectStyles();
    if(!dataLoaded){
      root.innerHTML = '<div class="pm-root"><div class="pm-loading">Kişisel alan yükleniyor...</div></div>';
      return;
    }
    checkTask5();
    persistMeta();

    const L = LANGS[activeLang];
    const filterPool = poolForActiveFilter();
    const filterKnown = knownCountIn(filterPool);
    const filterPct = filterPool.length ? Math.round((filterKnown/filterPool.length)*100) : 0;
    const today = meta.todayCount||0;
    const goal = meta.dailyGoal||DEFAULT_DAILY_GOAL;
    const goalPct = Math.min(100, Math.round((today/goal)*100));
    const acc = accuracyOverall();
    const totalStudied = totalStudiedCount();
    const totalKnownLang = knownCountIn(poolForActiveLang());
    const catInfo = categoryAccuracy();
    const due = dailyReviewWords();

    let levelRows = '';
    L.levels.forEach(lv=>{
      const list = poolForActiveLang().filter(v=>v.level===lv);
      const known = knownCountIn(list);
      const pct = list.length ? Math.round((known/list.length)*100) : 0;
      levelRows += '<div class="pm-level-row"><span>'+lv+'</span><div class="pm-bar"><div class="pm-bar-fill" style="width:'+pct+'%"></div></div><span>'+pct+'%</span></div>';
    });

    let badgeRow = '';
    BADGE_THRESHOLDS.forEach(t=>{
      const earned = meta.badges && meta.badges[t];
      badgeRow += '<div class="pm-badge '+(earned?'':'locked')+'" title="'+t+' kelime">'+(earned?'🏅':'🔒')+'</div>';
    });

    const groups = levelGroups();
    let groupRow = '';
    groups.forEach(g=>{
      const glist = poolForActiveLang().filter(v=>g.levels.includes(v.level));
      const gknown = knownCountIn(glist);
      groupRow += '<div class="pm-group-btn" data-group="'+g.name+'">'+g.name+'<span class="g-count">'+gknown+' bilinen</span></div>';
    });

    const t = meta.tasks;
    const t4Sub = t.t4
      ? ('Tamamlandı · +'+(due.length*2)+' XP')
      : (due.length>0 ? (due.length+' kelime bekliyor · kelime başına +2 XP') : '[Geçen gün öğrenilen kelime yok]');
    const taskDefs = [
      { icon:'📋', label:'Günlük tekrarı tamamla', sub: t4Sub, done:t.t4, pct: t.t4?100:0 },
      { icon:'💵', label:'Bugün 10 yeni kelime öğren', sub:Math.min(today,10)+'/10 · +'+TASK_XP.t1+' XP', done:t.t1, pct:Math.min(100,Math.round(today/10*100)) },
      { icon:'💰', label:'Bugün 50 yeni kelime öğren', sub:Math.min(today,50)+'/50 · +'+TASK_XP.t2+' XP', done:t.t2, pct:Math.min(100,Math.round(today/50*100)) },
      { icon:'🏆', label:'Bugün 100 yeni kelime öğren', sub:Math.min(today,100)+'/100 · +'+TASK_XP.t3+' XP', done:t.t3, pct:Math.min(100,Math.round(today/100*100)) },
      { icon:'⏱️', label:'Bugün 60 dakika çalış', sub:Math.min(60,Math.floor((meta.todayActiveSeconds||0)/60))+'/60 dk · +'+TASK_XP.t5+' XP', done:t.t5, pct:t.t5?100:Math.min(100,Math.round(((meta.todayActiveSeconds||0)/TASK5_SECONDS)*100)) },
    ];

    try{document.body.classList.add('pm-active');}catch(e){}
    try{['langBox','langPair','levelBox','chips'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});}catch(e){}
    let html = '<div class="pm-root">';
    html += '<div class="pm-head">';
    html += '<div class="pm-eyebrow">Kişisel Öğrenme Alanı</div>';
    html += '<div class="pm-title">👤 '+escapeHtml(currentName)+'\'e Özel</div>';
    html += '<div class="pm-sub">'+L.native+' öğrenimi - ilerlemen tüm cihazlarında senkron</div>';
    html += '<div class="pm-lang-grid" id="pmLangSelect">';
    Object.keys(LANGS).forEach(code=>{
      html += '<div class="pm-lang-card '+(code===activeLang?'active':'')+'" data-lang="'+code+'"><span class="fl">'+(PM_FLAGS[code]||'🌐')+'</span><span class="nm">'+LANGS[code].label+'</span></div>';
    });
    html += '</div>';
    html += '<div class="pm-level-seg" id="pmLevelSelect">';
    html += '<div class="lvl '+(activeLevel==='TÜMÜ'?'active':'')+'" data-level="TÜMÜ">TÜMÜ</div>';
    L.levels.forEach(lv=>{
      html += '<div class="lvl '+(lv===activeLevel?'active':'')+'" data-level="'+lv+'">'+lv+'</div>';
    });
    html += '</div>';
    html += '<div class="pm-pill-row"><div class="pm-pill flame">🔥 '+(meta.streak||0)+' günlük seri</div><div class="pm-pill">⭐ Seviye '+(Math.floor((meta.xp||0)/200)+1)+' - '+(meta.xp||0)+' XP</div></div>';
    html += '<div class="pm-goal-wrap"><div class="pm-goal-row"><span>Bugün öğrenilen</span><span>'+today+' / '+goal+' kelime</span></div><div class="pm-bar"><div class="pm-bar-fill" style="width:'+goalPct+'%"></div></div></div>';
    html += '</div>';

    if(due.length > 0 && !t.t4){
      html += '<div class="pm-due-banner"><div class="pm-due-text">📋 Dün öğrendiğin <b>'+due.length+'</b> kelimenin günlük tekrarı var</div><button id="pmDueBtn">Tekrar Et</button></div>';
    }

    html += '<div class="pm-card"><h4>İlerleme - '+activeLevel+' - '+filterKnown+' / '+filterPool.length+' kelime (%'+filterPct+')</h4>';
    html += levelRows || '<div class="pm-empty">Bu dil icin henuz seviye tanimli degil.</div>';
    html += '</div>';

    html += '<div class="pm-card"><h4>Genel Tekrar</h4><div class="pm-weak-meta">Bildiğini varsaydığımız kelimeleri tekrar sorar; yanlış yaparsan çalışma listene geri döner.</div><div class="pm-group-row" id="pmGroupRow">'+groupRow+'</div></div>';

    html += '<div class="pm-card"><h4>Istatistikler</h4><div class="pm-stat-grid">';
    html += '<div class="pm-stat-box"><div class="pm-stat-num">'+totalKnownLang+'</div><div class="pm-stat-label">Öğrenilen ('+L.label+')</div></div>';
    html += '<div class="pm-stat-box"><div class="pm-stat-num">'+today+'</div><div class="pm-stat-label">Bugün öğrenilen</div></div>';
    html += '<div class="pm-stat-box"><div class="pm-stat-num">'+totalStudied+'</div><div class="pm-stat-label">Toplam çalışılan</div></div>';
    html += '<div class="pm-stat-box"><div class="pm-stat-num">'+(acc===null?'-':acc+'%')+'</div><div class="pm-stat-label">Doğruluk oranı</div></div>';
    html += '</div>';
    html += '<div class="pm-weak-meta" style="margin-top:10px;">'+(catInfo.best ? ('💪 En guclu kategori: <b>'+escapeHtml(catInfo.best.cat)+'</b>') : 'Henuz yeterli veri yok.')+'<br>'+(catInfo.worst ? ('🎯 Gelistirilecek kategori: <b>'+escapeHtml(catInfo.worst.cat)+'</b>') : '')+'</div>';
    html += '<div class="pm-weak-meta" id="pmTotalTime" style="margin-top:6px;">⏱ Toplam çalışma süresi yükleniyor...</div>';
    html += '</div>';

    html += '<div class="pm-card"><h4>Bugünkü Görevler</h4>';
    taskDefs.forEach(td=>{
      const rp = Math.max(0, Math.min(100, td.pct||0));
      const R = 16, C = 2*Math.PI*R, off = C - (C*rp/100);
      const ringColor = td.done ? '#3dffa0' : '#4fe8ff';
      const svg = '<svg width="40" height="40" viewBox="0 0 40 40" class="pm-task-ring-svg">'+
        '<circle cx="20" cy="20" r="'+R+'" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="4"></circle>'+
        '<circle cx="20" cy="20" r="'+R+'" fill="none" stroke="'+ringColor+'" stroke-width="4" '+
        'stroke-linecap="round" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+off.toFixed(2)+'" '+
        'transform="rotate(-90 20 20)"></circle></svg>';
      html += '<div class="pm-task '+(td.done?'done':'')+'"><div class="pm-task-icon">'+(td.done?'✅':td.icon)+'</div><div class="pm-task-body"><div class="pm-task-label">'+td.label+'</div><div class="pm-task-sub">'+td.sub+'</div></div><div class="pm-task-ring">'+svg+'<span>'+rp+'%</span></div></div>';
    });
    html += '</div>';

    /* Rozetler (destek) + Başarımlar — mistakes butonunun ALTINA taşınacak (Başarımlar → Rozetler) */
    var _tiers = (window.LUMIRA_BADGES && window.LUMIRA_BADGES.tiers) || [];
    var supHtml = '';
    if(_tiers.length){
      var supRow = '';
      _tiers.forEach(function(t){
        var owned = !!(window.LUMIRA_BADGES && window.LUMIRA_BADGES.has(t.badge));
        supRow += '<div class="pm-sup-badge'+(owned?' owned':'')+'"><span class="e">'+t.badge+'</span>'+(owned?'':'<span class="lock">🔒</span>')+'<span class="nm">'+String(t.name||'').replace(/</g,'')+'</span></div>';
      });
      supHtml = '<div class="pm-card"><h4>Rozetler</h4><div class="pm-sup-grid">'+supRow+'</div></div>';
    }
    var awHtml = '';
    const awards = meta.awards || {};
    const awardKeys = Object.keys(awards);
    if(awardKeys.length){
      awardKeys.sort((x,y)=>(awards[x].ts||0)-(awards[y].ts||0));
      let awRow = '';
      awardKeys.forEach(k=>{
        const a = awards[k] || {};
        awRow += '<div class="pm-award" title="'+String(a.n||'').replace(/"/g,'')+'"><span class="pm-award-e">'+(a.e||'🏅')+'</span><span class="pm-award-n">'+String(a.n||'').replace(/</g,'')+'</span></div>';
      });
      awHtml = '<div class="pm-card"><h4>Başarımlar</h4><div class="pm-awards">'+awRow+'</div></div>';
    }

    html += '<button class="pm-btn primary" id="pmStartBtn">🚀 Çalışmaya Başla</button>';
    html += '<button class="pm-btn small" id="pmLevelTestBtn">🎓 Seviye Tespit Sınavı</button>';
    html += '<button class="pm-btn small" id="pmKnownBtn">✅ Öğrendiğim Kelimeler ('+totalKnownLang+')</button>';
    html += '<button class="pm-btn small" id="pmWeakBtn">📉 Hata Yaptığım Kelimeler</button>';
    html += awHtml;    /* Başarımlar (mistakes butonunun altında) */
    html += supHtml;   /* Rozetler */
    html += '</div>';

    root.innerHTML = html;

    document.querySelectorAll('#pmLangSelect .pm-lang-card').forEach(el=>{
      el.onclick = () => {
        activeLang = el.dataset.lang;
        activeLevel = 'TÜMÜ';
        if(typeof renderLangPair==='function') renderLangPair();
        if(typeof rebuildLevelBox==='function') rebuildLevelBox();
        if(typeof rebuildChips==='function') rebuildChips();
        if(typeof applyFilter==='function') applyFilter();
        renderHome();
      };
    });
    document.querySelectorAll('#pmLevelSelect .lvl').forEach(el=>{
      el.onclick = () => {
        activeLevel = el.dataset.level;
        if(typeof rebuildLevelBox==='function') rebuildLevelBox();
        if(typeof rebuildChips==='function') rebuildChips();
        if(typeof applyFilter==='function') applyFilter();
        renderHome();
      };
    });
    document.querySelectorAll('#pmGroupRow .pm-group-btn').forEach(el=>{
      el.onclick = () => startGeneralReview(el.dataset.group);
    });
    document.getElementById('pmStartBtn').onclick = startSession;
    document.getElementById('pmLevelTestBtn').onclick = openLevelTestPicker;
    document.getElementById('pmKnownBtn').onclick = renderKnownWords;
    document.getElementById('pmWeakBtn').onclick = renderWeakWords;
    const dueBtn = document.getElementById('pmDueBtn');
    if(dueBtn) dueBtn.onclick = startDailyReview;

    if(window.LB_getTotalSeconds){
      window.LB_getTotalSeconds(currentName, (secs)=>{
        const el = document.getElementById('pmTotalTime');
        if(!el) return;
        const s = Math.floor(secs);
        const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
        el.textContent = '⏱ Toplam çalışma süresi: '+(h>0?h+'s ':'')+m+'dk';
      });
    }
  }

  function pickBatch(){
    const pool = poolForActiveFilter();
    const unknown = pool.filter(v=>{ const r=getRecord(v); return !(r && r.known); });
    const due = unknown.filter(v=>{
      const r = getRecord(v);
      return r && r.retryAfterSession != null && r.retryAfterSession <= meta.studySessionCount;
    });
    const fresh = unknown.filter(v=> !due.includes(v));

    function bestCategoryFrom(list){
      const byCat = {};
      list.forEach(v=>{ (byCat[v.cat] = byCat[v.cat]||[]).push(v); });
      let bestCat = null, bestList = [];
      Object.keys(byCat).forEach(cat=>{
        if(byCat[cat].length > bestList.length){ bestCat = cat; bestList = byCat[cat]; }
      });
      return bestCat;
    }

    let chosenCat = bestCategoryFrom(due.length ? due : fresh);
    if(!chosenCat) return [];

    const inCat = unknown.filter(v=>v.cat===chosenCat);
    const dueInCat = inCat.filter(v=>{
      const r=getRecord(v); return r && r.retryAfterSession!=null && r.retryAfterSession<=meta.studySessionCount;
    });
    const freshInCat = inCat.filter(v=> !dueInCat.includes(v));
    shuffle(freshInCat);
    let chosen = dueInCat.concat(freshInCat).slice(0, BATCH_SIZE);

    if(chosen.length < BATCH_SIZE){
      const rest = unknown.filter(v=>v.cat!==chosenCat);
      const restDue = rest.filter(v=>{
        const r=getRecord(v); return r && r.retryAfterSession!=null && r.retryAfterSession<=meta.studySessionCount;
      });
      shuffle(restDue);
      chosen = chosen.concat(restDue.slice(0, BATCH_SIZE-chosen.length));
    }
    return chosen.map(v=>({v, key:wordKeyFor(v)}));
  }

  /* ============================================ SEVİYE TESPİT SINAVI
     A1-B2 seçilir → o seviyedeki (aktif dilde) kelimelerden 20 soruluk quiz.
     Doğru cevaplanan kelimeler doğrudan "bilinen" sayılır. Tamamlama ödülü
     sabit +100 XP. Her seviye İÇİN AYRI AYRI haftada bir kez girilebilir
     (A1'i tamamlamak A2'yi bekletmez; bir seviyeyi TEKRAR yapmak için o
     seviyenin son tamamlanmasından itibaren 7 gün geçmesi gerekir). */
  const LT_COOLDOWN_MS = 24*60*60*1000; /* 24 saat (önceden 3 gün) */
  let ltState = null; // { level, order:[...], idx, correct, learnedKeys:[] }

  function ltProgressKey(){ return 'lumira_lt_inprogress_'+activeLang; }
  function ltSaveProgress(){
    if(!ltState) return;
    safeLocalSet(ltProgressKey(), {
      level: ltState.level,
      categories: ltState.categories||null,
      orderKeys: ltState.order.map(wordKeyFor), /* hafif: sadece anahtarlar saklanır */
      idx: ltState.idx,
      correct: ltState.correct,
      learnedKeys: ltState.learnedKeys
    });
  }
  function ltLoadProgress(level){
    const saved = safeLocalGet(ltProgressKey());
    if(!saved || saved.level !== level || !Array.isArray(saved.orderKeys)) return null;
    /* anahtarlardan gerçek kelime nesnelerini VOCAB'dan geri kur */
    const byKey = {};
    VOCAB.filter(v=>v.lang===activeLang && v.level===level).forEach(v=>{ byKey[wordKeyFor(v)] = v; });
    const order = saved.orderKeys.map(k=>byKey[k]).filter(Boolean);
    if(order.length !== saved.orderKeys.length) return null; /* veri tutarsızsa güvenli şekilde vazgeç */
    return { level, categories: saved.categories||null, order, idx: saved.idx, correct: saved.correct, learnedKeys: saved.learnedKeys||[] };
  }
  function ltClearProgress(){ safeLocalSet(ltProgressKey(), null); }

  function ltKey(level){ return activeLang+'_'+level; }
  function ltCooldownLeft(level){
    const rec = (meta.levelTest||{})[ltKey(level)];
    if(!rec || !rec.ts) return 0;
    const left = LT_COOLDOWN_MS - (Date.now() - rec.ts);
    return left > 0 ? left : 0;
  }
  function ltFmtLeft(ms){
    const d = Math.ceil(ms / (24*60*60*1000));
    return d <= 1 ? '1 gün' : d+' gün';
  }
  function ltWordCount(level){
    return VOCAB.filter(v=>v.lang===activeLang && v.level===level).length;
  }

  function openLevelTestPicker(){
    let html = '<div class="pm-root"><div class="pm-head"><div class="pm-eyebrow">Seviye Tespit Sınavı</div>'+
      '<div class="pm-title">🎓 Seviyeni Test Et</div>'+
      '<div class="pm-sub">Bir seviye seç · o seviyedeki TÜM kelimeler sorulur · tamamlayınca +100 XP · doğru bildiğin kelimeler bilinenler listene eklenir</div></div>';
    html += '<div class="pm-lang-grid" style="grid-template-columns:1fr 1fr;">';
    LANGS[activeLang].levels.forEach(lv=>{
      const left = ltCooldownLeft(lv);
      const locked = left > 0;
      const cnt = ltWordCount(lv);
      const inProgress = !locked && ltLoadProgress(lv);
      let sub;
      if(locked) sub = '🔒 '+ltFmtLeft(left);
      else if(inProgress) sub = '▶ Devam et · '+inProgress.idx+'/'+inProgress.order.length;
      else sub = cnt+' kelime';
      html += '<div class="pm-lang-card lt-lv-opt'+(locked?' locked':'')+(inProgress?' active':'')+'" data-level="'+lv+'" style="'+(locked?'opacity:.5;cursor:default;':'cursor:pointer;')+'">'+
        '<span class="nm" style="font-size:16px;font-weight:800;">'+lv+'</span>'+
        '<span class="nm" style="font-size:10px;">'+sub+'</span></div>';
    });
    html += '</div>';
    html += '<button type="button" class="ctrl primary" id="pmBackHome" style="width:100%;margin-top:18px;">← Ana Sayfaya Dön</button></div>';
    root.innerHTML = html;
    document.getElementById('pmBackHome').onclick = renderHome;
    document.querySelectorAll('.lt-lv-opt').forEach(el=>{
      if(el.classList.contains('locked')) return;
      el.onclick = () => {
        const saved = ltLoadProgress(el.dataset.level);
        if(saved){ ltState = saved; renderLevelTestQuestion(); }
        else openLevelTestCategoryPicker(el.dataset.level);
      };
    });
  }

  /* ============================== SEVİYE TESPİT — KATEGORİ SEÇİMİ
     Kullanıcı isterse seviyenin TÜMÜNDEN, isterse seçtiği bir veya birden
     fazla kategoriden sınava girebilir. Sadece seçilen kategorilerdeki
     kelimeler sorulur ve doğru bilinenler bilinenler listesine geçer. */
  function openLevelTestCategoryPicker(level){
    const pool = VOCAB.filter(v=>v.lang===activeLang && v.level===level);
    const catCounts = {};
    pool.forEach(v=>{ const c = v.cat||'Genel'; catCounts[c] = (catCounts[c]||0)+1; });
    const cats = Object.keys(catCounts).sort((a,b)=>catCounts[b]-catCounts[a]);
    const selected = new Set();

    let html = '<div class="pm-root"><div class="pm-head">'+
      '<div class="pm-eyebrow">🎓 '+level+' · Adım 2/2</div>'+
      '<div class="pm-title">Kategori Seç</div>'+
      '<div class="pm-sub">İstediğin kategorileri seç, ya da tümünden sınava gir. Sadece seçtiğin kategorilerin kelimeleri test edilir.</div></div>';
    html += '<button type="button" class="ctrl primary" id="pmLtAllCats" style="width:100%;margin-bottom:14px;">🎯 Tüm Kategorilerden Gir ('+pool.length+' kelime)</button>';
    html += '<div class="pm-lang-grid" id="pmLtCatGrid">';
    cats.forEach(c=>{
      const emoji = (window.CAT_EMOJI && window.CAT_EMOJI[c]) || '📖';
      html += '<div class="pm-lang-card pm-cat-card" data-cat="'+escapeHtml(c)+'">'+
        '<span class="pm-cat-check">✓</span>'+
        '<span class="fl">'+emoji+'</span>'+
        '<span class="nm">'+escapeHtml(c)+'</span>'+
        '<span class="nm" style="font-size:9.5px;opacity:.7;">'+catCounts[c]+' kelime</span></div>';
    });
    html += '</div>';
    html += '<button type="button" class="ctrl primary" id="pmLtStartCats" style="width:100%;margin-top:16px;opacity:.4;" disabled>Sınava Başla</button>';
    html += '<button type="button" class="ctrl primary" id="pmBackLevels" style="width:100%;margin-top:10px;">← Seviye Seçime Dön</button></div>';
    root.innerHTML = html;

    document.getElementById('pmBackLevels').onclick = openLevelTestPicker;
    document.getElementById('pmLtAllCats').onclick = () => startLevelTest(level, null);

    const startBtn = document.getElementById('pmLtStartCats');
    function refreshStartBtn(){
      const n = selected.size;
      startBtn.textContent = n>0 ? ('Sınava Başla ('+n+' kategori)') : 'Sınava Başla';
      startBtn.disabled = n===0;
      startBtn.style.opacity = n>0 ? '1' : '.4';
    }
    document.querySelectorAll('.pm-cat-card').forEach(el=>{
      el.onclick = () => {
        const c = el.dataset.cat;
        if(selected.has(c)){ selected.delete(c); el.classList.remove('sel'); }
        else { selected.add(c); el.classList.add('sel'); }
        refreshStartBtn();
      };
    });
    startBtn.onclick = () => { if(selected.size>0) startLevelTest(level, Array.from(selected)); };
  }

  function startLevelTest(level, categories){
    let pool = VOCAB.filter(v=>v.lang===activeLang && v.level===level);
    if(categories && categories.length){
      pool = pool.filter(v=>categories.includes(v.cat));
    }
    if(pool.length < 4){
      showToast('Bu seçimde yeterli kelime yok'); openLevelTestCategoryPicker(level); return;
    }
    const order = shuffle(pool.slice());
    ltState = { level, categories: categories||null, order, idx:0, correct:0, learnedKeys:[] };
    ltSaveProgress();
    renderLevelTestQuestion();
  }

  function renderLevelTestQuestion(){
    if(!ltState) return;
    if(ltState.idx >= ltState.order.length){ finishLevelTest(); return; }
    const v = ltState.order[ltState.idx];
    const distractors = pickCategoryDistractors(v, 3);
    const opts = shuffle([v.tr].concat(distractors.map(d=>d.tr)));
    let answered = false;
    const barHtml = '<div class="pm-session-bar"><span>Soru '+(ltState.idx+1)+' / '+ltState.order.length+'</span><span>🎓 '+ltState.level+' Seviye Tespit</span></div>'+
      '<div class="pm-bar" style="margin-bottom:14px;"><div class="pm-bar-fill" style="width:'+Math.round((ltState.idx/ltState.order.length)*100)+'%"></div></div>';
    root.innerHTML = '<div class="pm-root">'+barHtml+
      '<div class="pm-study-card" style="cursor:default;"><div class="pm-mode-tag">Bu kelimenin anlami nedir?</div>'+
      '<div class="pm-word" dir="'+LANGS[v.lang].dir+'">'+escapeHtml(v.w)+'</div>'+
      '<div class="pm-word-sub">'+escapeHtml(v.cat||v.pos||'')+'</div></div>'+
      '<div class="pm-options" id="pmOptions"></div>'+
      '<button type="button" class="ctrl primary" id="pmLtExit" style="width:100%;margin-top:16px;">← Kaydet ve Çık</button></div>';
    const wrap = document.getElementById('pmOptions');
    document.getElementById('pmLtExit').onclick = () => { ltSaveProgress(); ltState = null; renderHome(); };
    opts.forEach(o=>{
      const b = document.createElement('button');
      b.className = 'pm-opt'; b.textContent = o;
      b.onclick = () => {
        if(answered) return;
        answered = true;
        const ok = (o === v.tr);
        if(ok){
          ltState.correct++;
          ltState.learnedKeys.push(wordKeyFor(v));
        }
        document.querySelectorAll('#pmOptions .pm-opt').forEach(x=>{
          x.disabled = true;
          if(x.textContent === v.tr) x.classList.add('correct');
          else if(x===b && !ok) x.classList.add('wrong');
        });
        setTimeout(()=>{ ltState.idx++; ltSaveProgress(); renderLevelTestQuestion(); }, 650);
      };
      wrap.appendChild(b);
    });
  }

  function finishLevelTest(){
    const { level, categories, order, correct, learnedKeys } = ltState;
    ltClearProgress();
    /* doğru cevaplanan kelimeler doğrudan "bilinen" listesine geçer */
    const y = todayStr();
    learnedKeys.forEach(k=>{
      const v = order.find(x=>wordKeyFor(x)===k);
      let rec = wordProgress[k] || { seen:0, correct:0, wrong:0, known:false, lang:v?v.lang:activeLang, level:v?v.level:level, cat:v?v.cat:null };
      rec.seen = (rec.seen||0)+1;
      rec.correct = (rec.correct||0)+1;
      if(!rec.known){ rec.known = true; rec.learnedDate = y; }
      wordProgress[k] = rec;
    });
    meta.levelTest = meta.levelTest || {};
    meta.levelTest[ltKey(level)] = { ts: Date.now(), lastScore: correct, lastTotal: order.length };
    addXp(100, 'Seviye tespit sınavı: '+level+' tamamlandı');
    persistMeta();
    try{
      const ref = dbRef('progress/'+currentKey+'/words');
      if(ref) learnedKeys.forEach(k=>ref.child(k).set(wordProgress[k]).catch(()=>{}));
    }catch(e){}

    const pct = Math.round((correct/order.length)*100);
    const scopeTxt = (categories && categories.length) ? (categories.length+' kategori') : 'tüm kategoriler';
    let html = '<div class="pm-root"><div class="pm-head"><div class="pm-eyebrow">Sınav Tamamlandı</div>'+
      '<div class="pm-title">🎓 '+level+' Seviye Sonucun</div>'+
      '<div class="pm-sub">'+correct+' / '+order.length+' doğru ('+pct+'%) · '+scopeTxt+' · +100 XP kazandın · '+learnedKeys.length+' kelime bilinenler listene eklendi</div></div>'+
      '<button type="button" class="ctrl primary" id="pmBackHome2" style="width:100%;margin-top:8px;">← Ana Sayfaya Dön</button></div>';
    root.innerHTML = html;
    document.getElementById('pmBackHome2').onclick = renderHome;
    ltState = null;
  }

  function startSession(){
    batch = pickBatch();
    if(batch.length === 0){
      root.innerHTML = '<div class="pm-root"><div class="pm-empty">🎉 Bu seviyede çalışılacak yeni kelime kalmadı - harika iş çıkardın!<br><br>İstersen Genel Tekrar yaparak bildiklerini tazeleyebilirsin.</div><span class="pm-back-link" id="pmBackHome">← Ana sayfaya dön</span></div>';
      document.getElementById('pmBackHome').onclick = renderHome;
      return;
    }
    beginBatchFlow();
  }

  function startDailyReview(){
    const list = dailyReviewWords();
    if(list.length === 0){ renderHome(); return; }
    shuffle(list);
    reviewMode = { kind:'daily', group:'Günlük Tekrar', order:list, idx:0, stats:{ total:list.length, correct:0, wrong:0 } };
    renderReviewCard();
  }

  function beginBatchFlow(){
    batchResult = {};
    batch.forEach(item => { batchResult[item.key] = { quizOk:null, listenOk:null, fillOk:null }; });
    cardIdx = 0;
    sessionStats = { total:0, correct:0, wrong:0, xp:0, newKnown:0, newBadges:[], mistakes:[] };
    renderCardsPhase();
  }

  function renderCardsPhase(){
    if(cardIdx >= batch.length){
      quizOrder = shuffle(batch.map((_,i)=>i));
      quizIdx = 0;
      renderQuizPhase();
      return;
    }
    const v = batch[cardIdx].v;
    const L = LANGS[v.lang];
    const barHtml = '<div class="pm-session-bar"><span>Tanışma '+(cardIdx+1)+' / '+batch.length+'</span><span>Adım 1/4</span></div><div class="pm-bar" style="margin-bottom:14px;"><div class="pm-bar-fill" style="width:'+Math.round((cardIdx/batch.length)*100)+'%"></div></div>';
    let flipped = false;
    const catEmoji = (window.CAT_EMOJI && window.CAT_EMOJI[v.cat]) || '📖';
    function draw(){
      let html = '<div class="pm-root">'+barHtml;
      /* Kartlar sekmesiyle BİREBİR AYNI markup/CSS/flip animasyonu (.stage/.card/.face) */
      html += '<div class="stage"><div class="card'+(flipped?' flipped':'')+'" id="pmCard">'+
        '<div class="face face-front"><div class="card-bg-emoji">'+catEmoji+'</div>'+
        '<div class="level-badge">'+(v.level||'')+'</div>'+
        '<div class="tag">'+L.native+'</div>'+
        '<div class="word" dir="'+L.dir+'">'+escapeHtml(v.w)+'</div>'+
        '<div class="pos">'+escapeHtml(v.cat||v.pos||'')+'</div>'+
        '<div class="example" dir="'+L.dir+'">'+(v.ex ? colorSplit(v.ex, v.w, v.c1, v.c2) : '')+'</div>'+
        '<div class="speak-controls">'+
          '<div class="speak-item"><button type="button" class="speak-icon-btn" id="pmRabbit" title="Normal hızda dinle">🔊</button><span class="speak-lbl">Normal</span></div>'+
          '<div class="speak-item"><button type="button" class="speak-icon-btn" id="pmTurtle" title="Yavaş dinle">🐢</button><span class="speak-lbl">Yavaş</span></div>'+
        '</div><div class="speak-caption">Dinlemek İçin Tıkla</div></div>'+
        '<div class="face face-back"><div class="card-bg-emoji">'+catEmoji+'</div>'+
        '<div class="level-badge">'+(v.level||'')+'</div>'+
        '<div class="tag">Türkçe</div>'+
        '<div class="word">'+escapeHtml(v.tr)+'</div>'+
        '<div class="example">'+(v.exTr ? escapeHtml(v.exTr) : '')+'</div></div>'+
        '</div></div>';
      html += '<div class="hint">Çevirmek için karta dokun</div>';
      html += '<button class="pm-btn primary" id="pmNextCard">Sonraki Kelime</button>';
      html += '</div>';
      root.innerHTML = html;
      // Karta her tıklandığında SADECE kelime/Türkçe arasında geçiş yapar
      // (Kartlar sekmesindeki mantıkla birebir aynı) — bir sonraki kelimeye
      // GEÇMEZ. İlerlemek için ayrı "Sonraki Kelime" butonu kullanılır.
      document.getElementById('pmCard').onclick = () => {
        flipped = !flipped;
        draw();
        if(!flipped) pmSpeak(v.w, LANGS[v.lang].voice, false);
      };
      document.getElementById('pmNextCard').onclick = (e) => {
        e.stopPropagation();
        cardIdx++;
        renderCardsPhase();
      };
      const rb = document.getElementById('pmRabbit'), tb = document.getElementById('pmTurtle');
      if(rb) rb.onclick = (e)=>{ e.stopPropagation(); pmSpeak(v.w, LANGS[v.lang].voice, false); };
      if(tb) tb.onclick = (e)=>{ e.stopPropagation(); pmSpeak(v.w, LANGS[v.lang].voice, true); };
    }
    draw();
    pmSpeak(v.w, LANGS[v.lang].voice, false);
  }

  /* ============================== ÇELDİRİCİ ÜRETİMİ (akıllı yanlış şıklar)
     Amaç: kelimeyi bilmeyen biri sadece "hangisi tanıdık" diye rastgele
     doğru cevaba basamasın. İki mod var:
     1) pickCategoryDistractors — büyük havuzlar için (Seviye Tespit,
        Günlük/Genel Tekrar): TÜM yanlış şıklar sorunun KATEGORİSİNDEN gelir.
     2) pickBatchDistractors — küçük 10 kelimelik oturum için (Kişisel
        Quiz/Dinleme): 2 şık kategoriden, 1 şık o an çalışılan diğer
        kelimelerden (tuzak) — "bugün öğrendiğim kelime" ezberiyle rastgele
        doğru cevaba basmayı zorlaştırır. */
  function pickCategoryDistractors(v, count, exclude){
    exclude = exclude || [];
    let pool = VOCAB.filter(x=>x.lang===v.lang && x.cat===v.cat && x.w!==v.w && !exclude.some(e=>e.w===x.w));
    if(pool.length < count){
      let fallback = VOCAB.filter(x=>x.lang===v.lang && x.level===v.level && x.w!==v.w &&
                                      !exclude.some(e=>e.w===x.w) && !pool.some(p=>p.w===x.w));
      shuffle(fallback);
      pool = pool.concat(fallback);
    }
    if(pool.length < count){
      let fallback2 = VOCAB.filter(x=>x.lang===v.lang && x.w!==v.w &&
                                       !exclude.some(e=>e.w===x.w) && !pool.some(p=>p.w===x.w));
      shuffle(fallback2);
      pool = pool.concat(fallback2);
    }
    shuffle(pool);
    return pool.slice(0, count);
  }
  function pickBatchDistractors(v, count, batchWords){
    const catPicks = pickCategoryDistractors(v, Math.max(0, count-1));
    let result = catPicks.slice();
    const usedWords = [v].concat(result);
    const trapPool = shuffle((batchWords||[]).filter(x=>x.w!==v.w && !usedWords.some(u=>u.w===x.w)));
    if(trapPool[0]){
      result.push(trapPool[0]);
    } else {
      const extra = pickCategoryDistractors(v, 1, result);
      if(extra[0]) result.push(extra[0]);
    }
    shuffle(result);
    return result.slice(0, count);
  }

  function renderQuizPhase(){
    if(quizIdx >= quizOrder.length){
      listenOrder = shuffle(batch.map((_,i)=>i));
      listenIdx = 0;
      renderListenPhase();
      return;
    }
    currentAnswered = false;
    const item = batch[quizOrder[quizIdx]];
    const v = item.v;
    const distractors = pickBatchDistractors(v, 3, batch.map(it=>it.v));
    const opts = shuffle([v.tr].concat(distractors.map(d=>d.tr)));
    const barHtml = '<div class="pm-session-bar"><span>Soru '+(quizIdx+1)+' / '+batch.length+'</span><span>Adım 2/4 - Anlam Testi</span></div><div class="pm-bar" style="margin-bottom:14px;"><div class="pm-bar-fill" style="width:'+Math.round((quizIdx/batch.length)*100)+'%"></div></div>';
    root.innerHTML = '<div class="pm-root">'+barHtml+
      '<div class="pm-study-card" style="cursor:default;"><div class="pm-mode-tag">Bu kelimenin anlami nedir?</div><div class="pm-word" dir="'+LANGS[v.lang].dir+'">'+escapeHtml(v.w)+'</div><div class="pm-word-sub">'+escapeHtml(v.cat||v.pos||'')+'</div><div class="speak-controls"><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmRabbit">🔊</button><span class="speak-lbl">Normal</span></div><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmTurtle">🐢</button><span class="speak-lbl">Yavaş</span></div></div><div class="speak-caption">Dinlemek İçin Tıkla</div></div>'+
      '<div class="pm-options" id="pmOptions"></div></div>';
    document.getElementById('pmRabbit').onclick = () => pmSpeak(v.w, LANGS[v.lang].voice, false);
    document.getElementById('pmTurtle').onclick = () => pmSpeak(v.w, LANGS[v.lang].voice, true);
    const wrap = document.getElementById('pmOptions');
    opts.forEach(o=>{
      const b = document.createElement('button');
      b.className = 'pm-opt'; b.textContent = o;
      b.onclick = () => {
        if(currentAnswered) return;
        currentAnswered = true;
        const ok = (o === v.tr);
        batchResult[item.key].quizOk = ok;
        document.querySelectorAll('#pmOptions .pm-opt').forEach(x=>{
          x.disabled = true;
          if(x.textContent === v.tr) x.classList.add('correct');
          else if(x===b && !ok) x.classList.add('wrong');
        });
        setTimeout(()=>{ quizIdx++; renderQuizPhase(); }, 650);
      };
      wrap.appendChild(b);
    });
  }

  function renderListenPhase(){
    if(listenIdx >= listenOrder.length){
      fillOrder = shuffle(batch.map((_,i)=>i));
      fillIdx = 0;
      renderFillPhase();
      return;
    }
    currentAnswered = false;
    const item = batch[listenOrder[listenIdx]];
    const v = item.v;
    const distractors = pickBatchDistractors(v, 3, batch.map(it=>it.v));
    const opts = shuffle([v.tr].concat(distractors.map(d=>d.tr)));
    const barHtml = '<div class="pm-session-bar"><span>Soru '+(listenIdx+1)+' / '+batch.length+'</span><span>Adım 3/4 - Dinleme</span></div><div class="pm-bar" style="margin-bottom:14px;"><div class="pm-bar-fill" style="width:'+Math.round((listenIdx/batch.length)*100)+'%"></div></div>';
    root.innerHTML = '<div class="pm-root">'+barHtml+
      '<div class="pm-study-card" style="cursor:default;"><div class="pm-mode-tag">🎧 Duydugun kelimenin anlami ne?</div><div class="pm-word" style="font-size:34px;">🎙️</div><div class="speak-controls"><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmRabbit" title="Hizli tekrar dinle">🔊</button><span class="speak-lbl">Normal</span></div><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmTurtle" title="Yavas tekrar dinle">🐢</button><span class="speak-lbl">Yavaş</span></div></div><div class="speak-caption">Dinlemek İçin Tıkla</div></div>'+
      '<div class="pm-options" id="pmOptions"></div></div>';
    const playFast = () => pmSpeak(v.w, LANGS[v.lang].voice, false);
    const playSlow = () => pmSpeak(v.w, LANGS[v.lang].voice, true);
    document.getElementById('pmRabbit').onclick = playFast;
    document.getElementById('pmTurtle').onclick = playSlow;
    playFast();
    const wrap = document.getElementById('pmOptions');
    opts.forEach(o=>{
      const b = document.createElement('button');
      b.className = 'pm-opt'; b.textContent = o;
      b.onclick = () => {
        if(currentAnswered) return;
        currentAnswered = true;
        const ok = (o === v.tr);
        batchResult[item.key].listenOk = ok;
        document.querySelectorAll('#pmOptions .pm-opt').forEach(x=>{
          x.disabled = true;
          if(x.textContent === v.tr) x.classList.add('correct');
          else if(x===b && !ok) x.classList.add('wrong');
        });
        setTimeout(()=>{ listenIdx++; renderListenPhase(); }, 650);
      };
      wrap.appendChild(b);
    });
  }

  /* ============================== ADIM 4 — BOŞLUK DOLDURMA (yazarak)
     Örnek cümledeki kelime boşluk yapılır ("İch bin ___" gibi), kullanıcı
     yazarak doldurur — tıpkı Duolingo'daki gibi. v.ex yoksa bu kelime
     atlanır (tüm kelimelerde örnek cümle olmayabilir). */
  function blankSentence(sentence, word){
    const range = (typeof findStemMatch === 'function') ? findStemMatch(sentence, word) : null;
    if(!range) return null;
    return {
      before: sentence.slice(0, range.start),
      answer: sentence.slice(range.start, range.end),
      after: sentence.slice(range.end)
    };
  }

  /* ============================== BOŞLUK DOLDURMA — AKILLI EŞLEŞTİRME
     Amaç kelimeyi doğru YAZMAK, gramer çekimini test etmek değil. Bu yüzden:
     1) Noktalama işaretleri yok sayılır ("Leihen?" ~ "leihen").
     2) Küçük yazım hataları (özellikle ä/ö/ü gibi tek harf farkları)
        tolere edilir — kelime uzunluğuna göre ölçeklenen bir eşik ile.
     3) Cümledeki çekimli hâl (ör. "bedeutet") YERİNE öğrenilen sözlük
        hâli (v.w, ör. "bedeuten") de kabul edilir. */
  function fillNormalize(s){
    return String(s||'')
      .trim()
      .toLocaleLowerCase('tr')
      .replace(/[.,!?;:"'„"«»…()\[\]]/g, '')  /* noktalama tamamen at */
      .replace(/\s+/g, ' ')
      .trim();
  }
  function levenshtein(a, b){
    if(a === b) return 0;
    const al = a.length, bl = b.length;
    if(al === 0) return bl;
    if(bl === 0) return al;
    let prev = new Array(bl+1);
    for(let j=0; j<=bl; j++) prev[j] = j;
    for(let i=1; i<=al; i++){
      const cur = [i];
      for(let j=1; j<=bl; j++){
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost);
      }
      prev = cur;
    }
    return prev[bl];
  }
  function fillWordsMatch(userRaw, correctRaw){
    const u = fillNormalize(userRaw);
    const c = fillNormalize(correctRaw);
    if(!u) return false;
    if(u === c) return true;
    /* uzunluğa göre ölçeklenen tolerans: çok kısa kelimede yazım hatası
       payı verilmez (anlamsız hâle gelir), uzun kelimede 1-2 harf affedilir */
    const maxLen = Math.max(u.length, c.length);
    const tolerance = maxLen <= 3 ? 0 : (maxLen <= 7 ? 1 : 2);
    return levenshtein(u, c) <= tolerance;
  }

  function renderFillPhase(){
    if(fillIdx >= fillOrder.length){
      finalizeBatch();
      return;
    }
    const item = batch[fillOrder[fillIdx]];
    const v = item.v;
    const blanked = v.ex ? blankSentence(v.ex, v.w) : null;
    if(!blanked){ fillIdx++; renderFillPhase(); return; } // örnek cümlesi yoksa atla

    const barHtml = '<div class="pm-session-bar"><span>Soru '+(fillIdx+1)+' / '+batch.length+'</span><span>Adım 4/4 - Boşluk Doldurma</span></div><div class="pm-bar" style="margin-bottom:14px;"><div class="pm-bar-fill" style="width:'+Math.round((fillIdx/batch.length)*100)+'%"></div></div>';
    root.innerHTML = '<div class="pm-root">'+barHtml+
      '<div class="pm-study-card" style="cursor:default;"><div class="pm-mode-tag">Boşluğu doldur</div>'+
      '<div class="pm-fill-row" id="pmFillRow" dir="'+LANGS[v.lang].dir+'">'+escapeHtml(blanked.before)+'<b>_____</b>'+escapeHtml(blanked.after)+'</div>'+
      '<div class="pm-word-sub" style="margin-top:10px;">'+escapeHtml(v.exTr||v.tr||'')+'</div>'+
      '<div class="speak-controls"><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmRabbit" title="Normal hızda dinle">🔊</button><span class="speak-lbl">Normal</span></div><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmTurtle" title="Yavaş dinle">🐢</button><span class="speak-lbl">Yavaş</span></div></div><div class="speak-caption">Cümleyi Dinlemek İçin Tıkla</div></div>'+
      '<input type="text" class="pm-fill-input" id="pmFillInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Buraya yaz…" style="margin-bottom:12px;">'+
      '<div class="pm-fill-fb" id="pmFillFb"></div>'+
      '<button class="pm-btn primary" id="pmFillCheck">Kontrol Et</button>'+
      '<button class="pm-btn primary" id="pmFillNext" style="display:none;">Devam</button></div>';

    document.getElementById('pmRabbit').onclick = () => pmSpeak(v.ex, LANGS[v.lang].voice, false);
    document.getElementById('pmTurtle').onclick = () => pmSpeak(v.ex, LANGS[v.lang].voice, true);
    pmSpeak(v.ex, LANGS[v.lang].voice, false); /* soru gelince otomatik bir kez oku */

    const input = document.getElementById('pmFillInput');
    const fb = document.getElementById('pmFillFb');
    const checkBtn = document.getElementById('pmFillCheck');
    const nextBtn = document.getElementById('pmFillNext');
    input.focus();
    function check(){
      const typed = input.value || '';
      /* Hem cümledeki çekimli hâl hem de öğrenilen sözlük hâli (v.w) kabul
         edilir — amaç kelimeyi doğru yazmak, çekimi test etmek değil. */
      const ok = fillWordsMatch(typed, blanked.answer) || fillWordsMatch(typed, v.w);
      batchResult[item.key].fillOk = ok;
      /* Kontrol Et'e basınca boşluk, doğru kelimeyle ve farklı renkte
         dolduruluyor — kelime doğru şekliyle görsel olarak pekişsin. */
      const fillRow = document.getElementById('pmFillRow');
      if(fillRow){
        fillRow.innerHTML = escapeHtml(blanked.before) +
          '<b style="color:'+(ok?'#3dffa0':'#ff8a8a')+'">'+escapeHtml(blanked.answer)+'</b>' +
          escapeHtml(blanked.after);
      }
      fb.textContent = ok ? '✅ Doğru!' : ('Doğrusu: '+blanked.answer);
      fb.className = 'pm-fill-fb ' + (ok ? 'ok' : 'bad');
      input.disabled = true; checkBtn.style.display = 'none'; nextBtn.style.display = '';
    }
    checkBtn.onclick = check;
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') check(); });
    nextBtn.onclick = () => { fillIdx++; renderFillPhase(); };
  }

  function finalizeBatch(){
    meta.studySessionCount = (meta.studySessionCount||0) + 1;
    const now = Date.now();
    batch.forEach(item => {
      const v = item.v, key = item.key;
      const res = batchResult[key];
      /* Bir kelime "bilinen" sayılması için Anlam Testi + Dinleme + Boşluk
         Doldurma adımlarının ÜÇÜNÜ DE geçmesi gerekir. fillOk === false
         (yanlış yazıldı) → bilinmez. fillOk === null (bu kelimenin örnek
         cümlesi yoktu, Adım 4'te hiç sorulmadı) → bu adım için nötr sayılır,
         cezalandırılmaz. */
      const bothOk = res.quizOk === true && res.listenOk === true && res.fillOk !== false;
      let rec = wordProgress[key] || { seen:0, correct:0, wrong:0, known:false, retryAfterSession:null, lang:v.lang, level:v.level, cat:v.cat };
      rec.seen = (rec.seen||0) + 1;
      sessionStats.total++;
      if(bothOk){
        rec.correct = (rec.correct||0) + 1;
        if(!rec.known){
          rec.known = true;
          rec.retryAfterSession = null;
          rec.learnedDate = todayStr();
          sessionStats.newKnown++;
          meta.todayCount = (meta.todayCount||0) + 1;
          meta.xp = (meta.xp||0) + XP_PER_NEW_WORD;
        }
        sessionStats.correct++;
      } else {
        rec.wrong = (rec.wrong||0) + 1;
        rec.known = false;
        rec.retryAfterSession = meta.studySessionCount + RETRY_SESSION_GAP;
        sessionStats.wrong++;
        sessionStats.mistakes.push({ word:v.w, tr:v.tr });
      }
      rec.lastSeen = now;
      wordProgress[key] = rec;
    });
    persistLocalMirror();
    batch.forEach(item => {
      const ref = dbRef('progress/'+currentKey+'/words/'+item.key);
      if(ref) ref.set(wordProgress[item.key]).catch(()=>{});
    });
    markStudyToday();
    checkThresholdTasks();
    checkBadges();
    sessionStats.xp = sessionStats.newKnown * XP_PER_NEW_WORD;
    persistMeta();
    renderSessionSummary();
  }

  function renderSessionSummary(){
    const s = sessionStats;
    try{document.body.classList.add('pm-active');}catch(e){}
    try{['langBox','langPair','levelBox','chips'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});}catch(e){}
    let html = '<div class="pm-root">';
    html += '<div class="pm-head"><div class="pm-eyebrow">Oturum Tamamlandı</div><div class="pm-title">🎉 Harika İş!</div><div class="pm-sub">'+s.newKnown+' yeni kelime öğrendin - +'+s.xp+' XP</div></div>';
    html += '<div class="pm-card"><h4>Sonuç</h4><div class="pm-stat-grid"><div class="pm-stat-box"><div class="pm-stat-num">'+s.newKnown+'</div><div class="pm-stat-label">Yeni öğrenilen</div></div><div class="pm-stat-box"><div class="pm-stat-num">'+s.wrong+'</div><div class="pm-stat-label">Tekrar gerekiyor</div></div></div></div>';
    if(s.newBadges.length){
      html += '<div class="pm-card"><h4>Yeni Rozetler</h4><div class="pm-weak-meta">'+s.newBadges.map(t=>'🏅 '+t+' kelime rozeti').join('<br>')+'</div></div>';
    }
    if(s.mistakes.length){
      html += '<button class="pm-btn small" id="pmSeeMistakes">Tekrar Gereken Kelimeleri Gor ('+s.mistakes.length+')</button>';
    }
    html += '<button class="pm-btn primary" id="pmBackHomeBtn">Ana Sayfaya Dön</button></div>';
    root.innerHTML = html;
    document.getElementById('pmBackHomeBtn').onclick = renderHome;
    if(s.mistakes.length){
      document.getElementById('pmSeeMistakes').onclick = () => {
        let h2 = '<div class="pm-root"><div class="pm-head"><div class="pm-title">Tekrar Gereken Kelimeler</div><div class="pm-sub">Bir sonraki oturumu atlayıp, ondan sonrasında tekrar karşına çıkacaklar.</div></div>';
        s.mistakes.forEach(m=>{
          h2 += '<div class="pm-weak-item"><div class="pm-weak-word">'+escapeHtml(m.word)+'</div><div class="pm-weak-meta">Doğrusu: '+escapeHtml(m.tr)+'</div></div>';
        });
        h2 += '<button class="pm-btn primary" id="pmBackSummary">Geri Don</button></div>';
        root.innerHTML = h2;
        document.getElementById('pmBackSummary').onclick = renderSessionSummary;
      };
    }
  }

  function startGeneralReview(groupName){
    const group = levelGroups().find(g=>g.name===groupName);
    if(!group) return;
    const list = poolForActiveLang().filter(v=>group.levels.includes(v.level));
    const known = list.filter(v=>{ const r=getRecord(v); return r && r.known; });
    if(known.length === 0){
      root.innerHTML = '<div class="pm-root"><div class="pm-empty">Bu grupta henüz bilinen kelime yok. Önce biraz çalışman gerekiyor.</div><span class="pm-back-link" id="pmBackHome">← Ana sayfaya dön</span></div>';
      document.getElementById('pmBackHome').onclick = renderHome;
      return;
    }
    shuffle(known);
    reviewMode = { kind:'level', group: groupName, order: known, idx: 0, stats: { total:known.length, correct:0, wrong:0 } };
    renderReviewCard();
  }

  function renderReviewCard(){
    if(reviewMode.idx >= reviewMode.order.length){ finalizeReview(); return; }
    currentAnswered = false;
    const v = reviewMode.order[reviewMode.idx];
    const distractors = pickCategoryDistractors(v, 3);
    const opts = shuffle([v.tr].concat(distractors.map(d=>d.tr)));
    const barHtml = '<div class="pm-session-bar"><span>Genel Tekrar ('+reviewMode.group+')</span><span>'+(reviewMode.idx+1)+' / '+reviewMode.order.length+'</span></div><div class="pm-bar" style="margin-bottom:14px;"><div class="pm-bar-fill" style="width:'+Math.round((reviewMode.idx/reviewMode.order.length)*100)+'%"></div></div>';
    root.innerHTML = '<div class="pm-root">'+barHtml+
      '<div class="pm-study-card" style="cursor:default;"><div class="pm-mode-tag">Bu kelimenin anlami nedir?</div><div class="pm-word" dir="'+LANGS[v.lang].dir+'">'+escapeHtml(v.w)+'</div><div class="pm-word-sub">'+escapeHtml(v.cat||v.pos||'')+'</div><div class="speak-controls"><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmRabbit">🔊</button><span class="speak-lbl">Normal</span></div><div class="speak-item"><button type="button" class="speak-icon-btn" id="pmTurtle">🐢</button><span class="speak-lbl">Yavaş</span></div></div><div class="speak-caption">Dinlemek İçin Tıkla</div></div>'+
      '<div class="pm-options" id="pmOptions"></div></div>';
    document.getElementById('pmRabbit').onclick = () => pmSpeak(v.w, LANGS[v.lang].voice, false);
    document.getElementById('pmTurtle').onclick = () => pmSpeak(v.w, LANGS[v.lang].voice, true);
    const wrap = document.getElementById('pmOptions');
    opts.forEach(o=>{
      const b = document.createElement('button');
      b.className = 'pm-opt'; b.textContent = o;
      b.onclick = () => {
        if(currentAnswered) return;
        currentAnswered = true;
        const ok = (o === v.tr);
        const key = wordKeyFor(v);
        let rec = wordProgress[key];
        if(rec){
          rec.seen = (rec.seen||0)+1;
          rec.lastSeen = Date.now();
          if(ok){ rec.correct=(rec.correct||0)+1; reviewMode.stats.correct++; }
          else {
            rec.wrong=(rec.wrong||0)+1;
            rec.known = false;
            rec.retryAfterSession = null;
            reviewMode.stats.wrong++;
          }
          wordProgress[key] = rec;
        }
        document.querySelectorAll('#pmOptions .pm-opt').forEach(x=>{
          x.disabled = true;
          if(x.textContent === v.tr) x.classList.add('correct');
          else if(x===b && !ok) x.classList.add('wrong');
        });
        setTimeout(()=>{ reviewMode.idx++; renderReviewCard(); }, 650);
      };
      wrap.appendChild(b);
    });
  }

  function finalizeReview(){
    persistLocalMirror();
    reviewMode.order.forEach(v=>{
      const key = wordKeyFor(v);
      const ref = dbRef('progress/'+currentKey+'/words/'+key);
      if(ref) ref.set(wordProgress[key]).catch(()=>{});
    });
    const stats = reviewMode.stats;
    const isDaily = reviewMode.kind === 'daily';
    if(isDaily){
      awardTask4(stats.total);
    }
    persistMeta();
    const titleEyebrow = isDaily ? 'Günlük Tekrar Tamamlandı' : 'Genel Tekrar Tamamlandı';
    const titleIcon = isDaily ? '📋' : '🔁';
    let html = '<div class="pm-root"><div class="pm-head"><div class="pm-eyebrow">'+titleEyebrow+'</div><div class="pm-title">'+titleIcon+' '+reviewMode.group+'</div><div class="pm-sub">'+stats.correct+' / '+stats.total+' doğru'+(isDaily ? (' · +'+(stats.total*2)+' XP') : '')+'</div></div>';
    if(stats.wrong>0){
      html += '<div class="pm-weak-meta" style="text-align:center;margin-bottom:14px;">'+stats.wrong+' kelime bilinmiyor listesine geri döndü, normal çalışmada tekrar karşına çıkacak.</div>';
    }
    html += '<button class="pm-btn primary" id="pmBackHomeBtn">Ana Sayfaya Dön</button></div>';
    root.innerHTML = html;
    document.getElementById('pmBackHomeBtn').onclick = renderHome;
    reviewMode = null;
  }

  function renderKnownWords(){
    const list = poolForActiveLang().filter(v=>{ const r=getRecord(v); return r && r.known; });
    let html = '<div class="pm-root"><div class="pm-head"><div class="pm-title">✅ Öğrendiğin Kelimeler</div><div class="pm-sub">'+list.length+' kelime ('+LANGS[activeLang].label+')</div></div>';
    if(list.length===0){
      html += '<div class="pm-empty">Henüz öğrenilmiş kelime yok - çalışmaya başla!</div>';
    } else {
      list.slice(0,300).forEach(v=>{
        html += '<div class="pm-known-item" dir="'+LANGS[v.lang].dir+'"><b>'+escapeHtml(v.w)+'</b><span>'+escapeHtml(v.tr)+'</span></div>';
      });
      if(list.length>300) html += '<div class="pm-weak-meta" style="text-align:center;">...ve '+(list.length-300)+' kelime daha</div>';
    }
    html += '<button class="pm-btn primary" id="pmBackHomeBtn" style="margin-top:14px;">Ana Sayfaya Dön</button></div>';
    root.innerHTML = html;
    document.getElementById('pmBackHomeBtn').onclick = renderHome;
  }

  function renderWeakWords(){
    const entries = Object.keys(wordProgress)
      .map(k=>({key:k, rec:wordProgress[k]}))
      .filter(e => e.rec.lang === activeLang && (e.rec.wrong||0) > 0)
      .sort((a,b)=> (b.rec.wrong||0) - (a.rec.wrong||0))
      .slice(0, 30);

    const lookup = {};
    VOCAB.forEach(v=>{ lookup[wordKeyFor(v)] = v; });

    let html = '<div class="pm-root"><div class="pm-head"><div class="pm-title">📉 Hata Yaptığın Kelimeler</div><div class="pm-sub">En çok yanlış yaptığın kelimeler</div></div>';
    if(entries.length===0){
      html += '<div class="pm-empty">Hic hata yapmamissin - harika! 🎉</div>';
    } else {
      entries.forEach(e=>{
        const v = lookup[e.key];
        if(!v) return;
        const status = e.rec.known ? '✅ Su an bilinen kelimeler arasinda' : '⏳ Tekrar bekliyor';
        html += '<div class="pm-weak-item"><div class="pm-weak-word" dir="'+LANGS[v.lang].dir+'">'+escapeHtml(v.w)+' <span style="color:var(--pm-accent);font-size:12px;">- '+escapeHtml(v.tr)+'</span></div><div class="pm-weak-meta">❌ Yanlış: '+(e.rec.wrong||0)+' - ✅ Doğru: '+(e.rec.correct||0)+' - 👁 Görülme: '+(e.rec.seen||0)+'<br>'+status+'</div></div>';
      });
    }
    html += '<button class="pm-btn primary" id="pmBackHomeBtn2">Ana Sayfaya Dön</button></div>';
    root.innerHTML = html;
    document.getElementById('pmBackHomeBtn2').onclick = renderHome;
  }

  function openPersonalMode(){
    if(!root) return;
    injectStyles();
    const name = window.LB_getUserName ? window.LB_getUserName() : '';
    if(!name){
      root.innerHTML = '<div class="pm-root"><div class="pm-empty">Kişisel alanı kullanmak için önce adını girmen gerekiyor.</div><button class="pm-btn primary" id="pmAskNameBtn">Adımı Gir</button></div>';
      document.getElementById('pmAskNameBtn').onclick = () => { if(window.LB_checkName) window.LB_checkName(); };
      return;
    }
    if(dataLoaded && currentName === name){ renderHome(); return; }
    root.innerHTML = '<div class="pm-root"><div class="pm-loading">Kişisel alan yükleniyor...</div></div>';
    loadUserData(name, renderHome);
  }

  window.LB_onNameReady = function(name){
    if(dataLoaded && currentName === name){ return; } // zaten yüklü, gereksiz yeniden yüklemeyi (ve olası veri ezmeyi) engelle
    // Kişisel panel şu an görünür değilse bile veriyi sessizce yükle: bu sayede
    // meta.xp (dolayısıyla seviye liderlik tablosu) kullanıcı "Kişisel Mod"u
    // hiç açmasa bile girişte güncellenir. Panel görünürse ayrıca render eder.
    const isVisible = root && root.style.display !== 'none';
    loadUserData(name, isVisible ? renderHome : null);
  };

  window.PM_open = openPersonalMode;

  /* Dışarıdan XP eklemek için ortak kapı: quiz doğru cevapları ve
     destek rozetleri bunu kullanır. Kaydetme ve sunucuya yazma dahil. */
  window.PR_addXp = function(amount, reason){
    try{
      amount = parseInt(amount, 10) || 0;
      if(amount <= 0) return 0;
      addXp(amount, reason || '');
      persistMeta();
      return meta.xp || 0;
    }catch(e){ return 0; }
  };
  /* Mevcut XP ve seviyeyi okumak için (Profilim / PDF kilitleri) */
  window.PR_getXp = function(){ try{ return meta.xp || 0; }catch(e){ return 0; } };
  window.PR_getLevel = function(){ try{ return Math.floor((meta.xp||0)/200) + 1; }catch(e){ return 1; } };
})();
