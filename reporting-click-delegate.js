/* CraneGuard ERP · Build 9.7 · publicación por delegación de eventos */
(function(){
  if (window.__cgPublishDelegate97) return;
  window.__cgPublishDelegate97 = true;

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

  async function runFormPublish(button){
    const original=button.textContent;
    try{
      button.disabled=true;
      button.textContent='Publicando…';
      if(typeof window.publishConfiguredForm!=='function') throw new Error('La función de publicación del formulario no está cargada.');
      if(!window.S?.form) throw new Error('No se encontró el formulario activo.');
      await window.publishConfiguredForm(window.S.form);
    }catch(error){
      console.error('CraneGuard form publish delegate:',error);
      showMessage('No se pudo publicar el formulario: '+(error?.message||String(error)));
    }finally{
      if(document.body.contains(button)){
        button.disabled=false;
        if(/Publicando/i.test(button.textContent||'')) button.textContent=original||'Publicar revisión';
      }
    }
  }

  async function runTemplateSave(button){
    const original=button.textContent;
    try{
      button.disabled=true;
      button.textContent='Guardando…';
      if(typeof window.saveTemplateConfig!=='function') throw new Error('La función para guardar la plantilla no está cargada.');
      await window.saveTemplateConfig();
      showMessage('Plantilla guardada correctamente.',true);
    }catch(error){
      console.error('CraneGuard template save delegate:',error);
      showMessage('No se pudo guardar la plantilla: '+(error?.message||String(error)));
    }finally{
      if(document.body.contains(button)){
        button.disabled=false;
        if(/Guardando/i.test(button.textContent||'')) button.textContent=original||'Guardar';
      }
    }
  }

  async function runTemplatePublish(button){
    const original=button.textContent;
    try{
      button.disabled=true;
      button.textContent='Publicando…';
      if(typeof window.publishTemplate!=='function') throw new Error('La función de publicación de plantillas no está cargada.');
      if(!window.S?.template) throw new Error('No se encontró la plantilla activa.');
      const tpl = (window.S?.data?.reportV2?.templates||[]).find(t=>t.uid===window.S.template);
      if(!tpl) throw new Error('No se encontró la plantilla activa en el servidor.');
      if(!(tpl.formRefs||[]).length) throw new Error('Agrega al menos un formulario publicado antes de publicar la plantilla.');
      await window.publishTemplate(window.S.template);
      showMessage('Plantilla publicada correctamente y disponible para crear reportes.',true);
    }catch(error){
      console.error('CraneGuard template publish delegate:',error);
      showMessage('No se pudo publicar la plantilla: '+(error?.message||String(error)));
    }finally{
      if(document.body.contains(button)){
        button.disabled=false;
        if(/Publicando/i.test(button.textContent||'')) button.textContent=original||'Publicar';
      }
    }
  }

  async function runNewTemplate(button){
    const original=button.textContent;
    try{
      button.disabled=true;
      button.textContent='Creando…';
      if(typeof window.createNewTemplate!=='function') throw new Error('La función para crear plantillas no está cargada.');
      await window.createNewTemplate();
    }catch(error){
      console.error('CraneGuard new template delegate:',error);
      showMessage('No se pudo crear la plantilla: '+(error?.message||String(error)));
    }finally{
      if(document.body.contains(button)){
        button.disabled=false;
        if(/Creando/i.test(button.textContent||'')) button.textContent=original||'+ Nueva';
      }
    }
  }

  document.addEventListener('click',function(event){
    const button=event.target?.closest?.('button');
    if(!button) return;
    const label=(button.textContent||'').replace(/\s+/g,' ').trim();

    // Constructor de formularios.
    if(/Publicar revisión/i.test(label)){
      event.preventDefault();
      event.stopImmediatePropagation();
      runFormPublish(button);
      return;
    }

    // Constructor de plantillas. Se identifica por los campos exclusivos de esa pantalla.
    const isTemplateBuilder=!!document.getElementById('tplCode') && !!document.getElementById('tplName');
    if(!isTemplateBuilder) return;

    if(/^Publicar$/i.test(label)){
      event.preventDefault();
      event.stopImmediatePropagation();
      runTemplatePublish(button);
      return;
    }
    if(/^Guardar$/i.test(label)){
      event.preventDefault();
      event.stopImmediatePropagation();
      runTemplateSave(button);
      return;
    }
    if(/^\+?\s*Nueva$/i.test(label)){
      event.preventDefault();
      event.stopImmediatePropagation();
      runNewTemplate(button);
    }
  },true);

  // Marca la versión una sola vez. Sin MutationObserver para evitar congelamientos.
  function markBuild(){
    document.querySelectorAll('body *').forEach(node=>{
      if(node.childNodes.length!==1 || node.firstChild?.nodeType!==3) return;
      const text=(node.textContent||'').trim();
      if(/^BUILD 9\.\d/i.test(text) && text!=='BUILD 9.7 · FORMULARIOS + PLANTILLAS ACTIVOS') node.textContent='BUILD 9.7 · FORMULARIOS + PLANTILLAS ACTIVOS';
      if(/^Build 9\.\d/i.test(text) && text!=='Build 9.7') node.textContent='Build 9.7';
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(markBuild,0),{once:true});
  else setTimeout(markBuild,0);
})();
