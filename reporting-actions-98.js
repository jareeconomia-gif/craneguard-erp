/* CraneGuard ERP · Build 9.8 · acciones de publicación directas */
(function(){
  'use strict';
  if (window.__cgActions98) return;
  window.__cgActions98 = true;

  // Limpieza de caches heredadas para que producción no conserve builds anteriores.
  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
    if ('caches' in window) caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).catch(()=>{});
  } catch {}

  function state(){ try { return (typeof S !== 'undefined') ? S : null; } catch { return null; } }
  function byId(id){ return document.getElementById(id); }
  function val(id){ const n=byId(id); return n ? String(n.value ?? '').trim() : ''; }
  function checked(id){ return !!byId(id)?.checked; }

  function flash(text, ok=false){
    let box=byId('cgAction98Message');
    if(!box){
      box=document.createElement('div');
      box.id='cgAction98Message';
      box.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:min(860px,92vw);padding:15px 20px;border-radius:14px;font:800 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 18px 55px rgba(15,23,42,.28)';
      document.body.appendChild(box);
    }
    box.textContent=text;
    box.style.background=ok?'#ecfdf5':'#fff1f2';
    box.style.color=ok?'#065f46':'#9f1239';
    box.style.border=ok?'1px solid #86efac':'1px solid #fda4af';
    box.style.display='block';
    clearTimeout(box._t);
    box._t=setTimeout(()=>box.style.display='none',9000);
  }

  async function request(url, options={}){
    const headers={...(options.headers||{})};
    if(options.body && typeof options.body !== 'string'){
      headers['Content-Type']='application/json';
      options.body=JSON.stringify(options.body);
    }
    const res=await fetch(url,{credentials:'same-origin',...options,headers});
    let data={};
    try { data=await res.json(); } catch {}
    if(!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
    return data;
  }

  function activeTemplate(){
    const s=state();
    if(!s?.template) return null;
    return (s.data?.reportV2?.templates||[]).find(t=>t.uid===s.template) || null;
  }

  async function saveTemplateDirect(){
    const s=state(), t=activeTemplate();
    if(!s || !t) throw new Error('No se encontró la plantilla activa.');
    if(t.state!=='Borrador') throw new Error('Solo una plantilla en borrador puede modificarse.');
    const signatures=val('tplSigns').split('\n').map(x=>x.trim()).filter(Boolean);
    const body={
      code:val('tplCode')||t.code,
      name:val('tplName')||t.name,
      sla:Number(val('tplSla')||t.sla||4),
      formRefs:Array.isArray(t.formRefs)?t.formRefs:[],
      signatures:signatures.length?signatures:(t.signatures||[]),
      pdf:val('tplPdf')||t.pdf||'Cliente + interno',
      repeatPerEquipment:byId('tplRepeat') ? checked('tplRepeat') : t.repeatPerEquipment!==false,
      forms:t.forms||[],
      pdfSections:t.pdfSections||[]
    };
    const d=await request('/api/reporting/templates/'+encodeURIComponent(t.uid),{method:'PATCH',body});
    const i=(s.data?.reportV2?.templates||[]).findIndex(x=>x.uid===t.uid);
    if(i>=0) s.data.reportV2.templates[i]=d.template;
    s.template=d.template.uid;
    return d.template;
  }

  async function publishTemplateDirect(button){
    const old=button.textContent;
    try{
      button.disabled=true;
      button.textContent='Publicando…';
      flash('Validando y publicando plantilla…',true);
      const saved=await saveTemplateDirect();
      if(!(saved.formRefs||[]).length) throw new Error('Agrega al menos un formulario publicado antes de publicar la plantilla.');
      const d=await request('/api/reporting/templates/'+encodeURIComponent(saved.uid)+'/publish',{method:'POST'});
      const s=state();
      if(s){
        const i=(s.data?.reportV2?.templates||[]).findIndex(x=>x.uid===saved.uid);
        if(i>=0) s.data.reportV2.templates[i]=d.template;
        s.template=d.template.uid;
      }
      flash(`Plantilla ${d.template.code} ${d.template.version} publicada correctamente.`,true);
      try { if(typeof reportingReload==='function') await reportingReload(); } catch {}
      try { if(typeof go==='function') go('templateBuilder'); } catch {}
    }catch(e){
      console.error('CraneGuard 9.8 template publish:',e);
      flash('No se pudo publicar la plantilla: '+(e?.message||String(e)));
    }finally{
      if(document.body.contains(button)){
        button.disabled=false;
        if(/Publicando/i.test(button.textContent||'')) button.textContent=old||'Publicar';
      }
    }
  }

  async function saveTemplateButton(button){
    const old=button.textContent;
    try{
      button.disabled=true; button.textContent='Guardando…';
      const t=await saveTemplateDirect();
      flash(`Plantilla ${t.code} guardada en PostgreSQL.`,true);
    }catch(e){
      console.error('CraneGuard 9.8 template save:',e);
      flash('No se pudo guardar la plantilla: '+(e?.message||String(e)));
    }finally{
      button.disabled=false; button.textContent=old||'Guardar';
    }
  }

  async function publishFormButton(button){
    const old=button.textContent;
    try{
      button.disabled=true; button.textContent='Publicando…';
      if(typeof window.publishConfiguredForm!=='function') throw new Error('No está cargada la función de formularios.');
      const s=state();
      if(!s?.form) throw new Error('No se encontró el formulario activo.');
      await window.publishConfiguredForm(s.form);
    }catch(e){
      console.error('CraneGuard 9.8 form publish:',e);
      flash('No se pudo publicar el formulario: '+(e?.message||String(e)));
    }finally{
      if(document.body.contains(button)){
        button.disabled=false;
        if(/Publicando/i.test(button.textContent||'')) button.textContent=old||'Publicar revisión';
      }
    }
  }

  document.addEventListener('click',function(ev){
    const btn=ev.target?.closest?.('button');
    if(!btn) return;
    const label=(btn.textContent||'').replace(/\s+/g,' ').trim();
    const inTemplate=!!byId('tplCode') && !!byId('tplName');
    const inForm=!!byId('fCode') && !!byId('fName');

    if(inTemplate && /^Publicar$/i.test(label)){
      ev.preventDefault(); ev.stopImmediatePropagation();
      publishTemplateDirect(btn); return;
    }
    if(inTemplate && /^Guardar$/i.test(label)){
      ev.preventDefault(); ev.stopImmediatePropagation();
      saveTemplateButton(btn); return;
    }
    if(inForm && /Publicar revisión/i.test(label)){
      ev.preventDefault(); ev.stopImmediatePropagation();
      publishFormButton(btn);
    }
  },true);

  // Marca una sola vez la versión realmente ejecutada.
  setTimeout(()=>{
    document.querySelectorAll('body *').forEach(n=>{
      if(n.childNodes.length!==1 || n.firstChild?.nodeType!==3) return;
      const tx=(n.textContent||'').trim();
      if(/^BUILD 9\./i.test(tx)) n.textContent='BUILD 9.8 · PUBLICACIÓN DIRECTA';
      else if(/^Build 9\./i.test(tx)) n.textContent='Build 9.8';
    });
  },100);
})();
