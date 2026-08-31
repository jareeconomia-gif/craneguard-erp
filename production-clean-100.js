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

  function cleanInternalLabels(){
    document.querySelectorAll('body *').forEach(n=>{
      if(n.childNodes.length!==1 || n.firstChild?.nodeType!==3) return;
      const tx=(n.textContent||'').replace(/\s+/g,' ').trim();
      if(/^BUILD\s+\d/i.test(tx) || /^Build\s+\d/i.test(tx)){
        n.style.display='none';
        return;
      }
      if(/^(ERP\s*V\d+\s*·\s*)?RENDER\s*\+\s*POSTGRESQL$/i.test(tx) || /^ERP\s*V\d+\s*·\s*RENDER\s*\+\s*POSTGRESQL$/i.test(tx)){
        n.style.display='none';
      }
    });
  }

  // La interfaz se renderiza dinámicamente; limpiar etiquetas internas durante los primeros segundos.
  let runs=0;
  const timer=setInterval(()=>{
    cleanInternalLabels();
    runs+=1;
    if(runs>=12) clearInterval(timer);
  },400);
})();
