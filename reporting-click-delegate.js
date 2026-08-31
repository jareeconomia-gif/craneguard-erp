/* CraneGuard ERP · Build 9.6 · publicación por delegación de eventos */
(function(){
  if (window.__cgPublishDelegate96) return;
  window.__cgPublishDelegate96 = true;

  function showMessage(text, ok=false){
    let box=document.getElementById('cgPublishDelegateMessage');
    if(!box){
      box=document.createElement('div');
      box.id='cgPublishDelegateMessage';
      box.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:100000;max-width:min(820px,92vw);padding:14px 18px;border-radius:14px;font:700 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 18px 50px rgba(15,23,42,.25)';
      document.body.appendChild(box);
    }
    box.textContent=text;
    box.style.background=ok?'#ecfdf5':'#fff1f2';
    box.style.color=ok?'#065f46':'#9f1239';
    box.style.border=ok?'1px solid #a7f3d0':'1px solid #fecdd3';
    box.style.display='block';
    clearTimeout(box._timer);
    box._timer=setTimeout(()=>box.style.display='none',9000);
  }

  async function runPublish(button){
    const original=button.textContent;
    try{
      button.disabled=true;
      button.textContent='Publicando…';
      if(typeof window.publishConfiguredForm!=='function'){
        throw new Error('La función de publicación no está cargada.');
      }
      if(!window.S?.form){
        throw new Error('No se encontró el formulario activo.');
      }
      await window.publishConfiguredForm(window.S.form);
    }catch(error){
      console.error('CraneGuard publish delegate:',error);
      showMessage('No se pudo publicar: '+(error?.message||String(error)));
    }finally{
      if(document.body.contains(button)){
        button.disabled=false;
        if(/Publicando/i.test(button.textContent||'')) button.textContent=original||'Publicar revisión';
      }
    }
  }

  document.addEventListener('click',function(event){
    const button=event.target?.closest?.('button');
    if(!button) return;
    const label=(button.textContent||'').replace(/\s+/g,' ').trim();
    if(!/Publicar revisión/i.test(label)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runPublish(button);
  },true);

  // Indicador inequívoco de que este fix está realmente cargado.
  function markBuild(){
    document.querySelectorAll('body *').forEach(node=>{
      if(node.childNodes.length!==1 || node.firstChild?.nodeType!==3) return;
      const text=(node.textContent||'').trim();
      if(/^BUILD 9\.\d/i.test(text)) node.textContent='BUILD 9.6 · EVENTO PUBLICAR ACTIVO';
      if(/^Build 9\.\d/i.test(text)) node.textContent='Build 9.6';
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',markBuild);
  else markBuild();
  const observer=new MutationObserver(markBuild);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
