/* CraneGuard ERP · Build 10.0 · limpieza única de entrega */
(function(){
  'use strict';
  const KEY='cg_client_clean_100_done';
  try {
    if(localStorage.getItem(KEY)!=='1'){
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(KEY,'1');
      if('caches' in window){
        caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).finally(()=>location.reload());
      }else{
        location.reload();
      }
      return;
    }
  }catch{}

  // Mostrar claramente que es el build limpio de producción.
  setTimeout(()=>{
    document.querySelectorAll('body *').forEach(n=>{
      if(n.childNodes.length!==1 || n.firstChild?.nodeType!==3) return;
      const tx=(n.textContent||'').trim();
      if(/^BUILD 9\./i.test(tx) || /^BUILD 10\./i.test(tx)) n.textContent='BUILD 10.0 · PRODUCCIÓN LIMPIA';
      else if(/^Build 9\./i.test(tx) || /^Build 10\./i.test(tx)) n.textContent='Build 10.0';
    });
  },500);
})();
