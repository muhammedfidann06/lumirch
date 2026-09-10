/* Keyboard access for the existing controls; no layout replacement. */
(function(){
  'use strict';
  const selector='.tab,.lang-opt,.level-opt,.chip,.cat-close,.pm-lang-card,.nb-diff-opt,#pwEye';
  function decorate(){
    if(!window.document || !document.body) return;
    document.querySelectorAll(selector).forEach(el=>{
      if(el.matches('button,input,select,a')) return;
      el.setAttribute('role','button');
      el.tabIndex=el.style.pointerEvents === 'none' ? -1 : 0;
      if(el.classList.contains('tab')) el.setAttribute('aria-pressed',String(el.classList.contains('active')));
    });
  }
  document.addEventListener('keydown',e=>{
    if(e.target.matches(selector) && (e.key==='Enter'||e.key===' ') && !e.defaultPrevented){
      e.preventDefault();e.target.click();return;
    }
    if(e.key==='Escape'){
      const category=document.getElementById('catOverlay');
      if(category && category.classList.contains('open')){
        document.getElementById('catClose').click();
        document.getElementById('catTrigger').focus();
      }
    }
  });
  let queued=false;
  new MutationObserver(()=>{
    if(queued)return;queued=true;
    queueMicrotask(()=>{queued=false;decorate();});
  }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',()=>queueMicrotask(decorate));
  decorate();
})();
