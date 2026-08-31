/* CraneGuard ERP · Build 9.9 · interacción blindada de Reportes */
(function(){
  'use strict';
  if(window.__cgActions99) return;
  window.__cgActions99=true;

  try{
    if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
    if('caches' in window) caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).catch(()=>{});
  }catch{}

  const style=document.createElement('style');
  style.textContent=`
    .cfg-hero{position:relative!important;isolation:isolate!important}
    .cfg-hero::before,.cfg-hero::after{pointer-events:none!important}
    .cfg-hero .cfg-actions{position:relative!important;z-index:2147483000!important;pointer-events:auto!important}
    .cfg-hero .cfg-actions button{position:relative!important;z-index:2147483001!important;pointer-events:auto!important;cursor:pointer!important}
  `;
  document.head.appendChild(style);

  const $=id=>document.getElementById(id);
  const value=id=>{const n=$(id);return n?String(n.value??'').trim():''};
  const checked=id=>!!$(id)?.checked;
  const getState=()=>{try{return typeof S!=='undefined'?S:null}catch{return null}};
  let busy=false;
  let lastPointerAt=0;

  function flash(text,ok=false){
    let box=$('cg99msg');
    if(!box){box=document.createElement('div');box.id='cg99msg';box.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:min(860px,92vw);padding:15px 20px;border-radius:14px;font:800 14px/1.4 system-ui;box-shadow:0 18px 55px rgba(15,23,42,.28)';document.body.appendChild(box)}
    box.textContent=text;box.style.background=ok?'#ecfdf5':'#fff1f2';box.style.color=ok?'#065f46':'#9f1239';box.style.border=ok?'1px solid #86efac':'1px solid #fda4af';box.style.display='block';clearTimeout(box._t);box._t=setTimeout(()=>box.style.display='none',9000);
  }

  async function request(url,options={}){
    const headers={...(options.headers||{})};
    if(options.body&&typeof options.body!=='string'){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body)}
    const res=await fetch(url,{credentials:'same-origin',...options,headers});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok) throw new Error(data.error||`Error HTTP ${res.status}`);
    return data;
  }

  function activeTemplate(){const s=getState();return s?.template?(s.data?.reportV2?.templates||[]).find(t=>t.uid===s.template)||null:null}

  async function saveTemplate(){
    const s=getState(),t=activeTemplate();
    if(!s||!t) throw new Error('No se encontró la plantilla activa.');
    if(t.state!=='Borrador') throw new Error('Solo una plantilla en borrador puede modificarse.');
    const signatures=value('tplSigns').split('\n').map(x=>x.trim()).filter(Boolean);
    const body={code:value('tplCode')||t.code,name:value('tplName')||t.name,sla:Number(value('tplSla')||t.sla||4),formRefs:Array.isArray(t.formRefs)?t.formRefs:[],signatures:signatures.length?signatures:(t.signatures||[]),pdf:value('tplPdf')||t.pdf||'Cliente + interno',repeatPerEquipment:$('tplRepeat')?checked('tplRepeat'):t.repeatPerEquipment!==false,forms:t.forms||[],pdfSections:t.pdfSections||[]};
    const d=await request('/api/reporting/templates/'+encodeURIComponent(t.uid),{method:'PATCH',body});
    const i=(s.data?.reportV2?.templates||[]).findIndex(x=>x.uid===t.uid);if(i>=0)s.data.reportV2.templates[i]=d.template;s.template=d.template.uid;return d.template;
  }

  async function doSave(btn){
    if(busy)return;busy=true;const old=btn.textContent;
    try{btn.disabled=true;btn.textContent='Guardando…';const t=await saveTemplate();flash(`Plantilla ${t.code} guardada en PostgreSQL.`,true)}catch(e){console.error(e);flash('No se pudo guardar la plantilla: '+(e?.message||String(e)))}finally{busy=false;if(document.body.contains(btn)){btn.disabled=false;btn.textContent=old||'Guardar'}}
  }

  async function doPublish(btn){
    if(busy)return;busy=true;const old=btn.textContent;
    try{btn.disabled=true;btn.textContent='Publicando…';flash('Validando y publicando plantilla…',true);const saved=await saveTemplate();if(!(saved.formRefs||[]).length)throw new Error('Agrega al menos un formulario publicado antes de publicar la plantilla.');const d=await request('/api/reporting/templates/'+encodeURIComponent(saved.uid)+'/publish',{method:'POST'});const s=getState();if(s){const i=(s.data?.reportV2?.templates||[]).findIndex(x=>x.uid===saved.uid);if(i>=0)s.data.reportV2.templates[i]=d.template;s.template=d.template.uid}flash(`Plantilla ${d.template.code} ${d.template.version} publicada correctamente.`,true);try{if(typeof reportingReload==='function')await reportingReload()}catch{};try{if(typeof go==='function')go('templateBuilder')}catch{}}
    catch(e){console.error(e);flash('No se pudo publicar la plantilla: '+(e?.message||String(e)))}finally{busy=false;if(document.body.contains(btn)){btn.disabled=false;if(/Publicando/i.test(btn.textContent||''))btn.textContent=old||'Publicar'}}
  }

  function isTemplate(){return !!$('tplCode')&&!!$('tplName')}
  function actionButtons(){return [...document.querySelectorAll('button')].filter(b=>{const t=(b.textContent||'').replace(/\s+/g,' ').trim();return /^Guardar$/i.test(t)||/^Publicar$/i.test(t)})}
  function buttonAt(x,y){return actionButtons().find(b=>{const r=b.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom})}
  function activate(btn,ev){if(!btn||!isTemplate())return false;const label=(btn.textContent||'').replace(/\s+/g,' ').trim();if(!/^Guardar$|^Publicar$/i.test(label))return false;ev?.preventDefault?.();ev?.stopImmediatePropagation?.();lastPointerAt=Date.now();if(/^Guardar$/i.test(label))doSave(btn);else doPublish(btn);return true}

  window.addEventListener('pointerdown',ev=>{if(!isTemplate())return;const direct=ev.target?.closest?.('button');if(direct&&activate(direct,ev))return;const byCoords=buttonAt(ev.clientX,ev.clientY);if(byCoords)activate(byCoords,ev)},true);
  window.addEventListener('click',ev=>{if(Date.now()-lastPointerAt<700)return;if(!isTemplate())return;const direct=ev.target?.closest?.('button');if(direct)activate(direct,ev)},true);

  setTimeout(()=>{document.querySelectorAll('body *').forEach(n=>{if(n.childNodes.length!==1||n.firstChild?.nodeType!==3)return;const tx=(n.textContent||'').trim();if(/^BUILD 9\./i.test(tx))n.textContent='BUILD 9.9 · INTERACCIÓN BLINDADA';else if(/^Build 9\./i.test(tx))n.textContent='Build 9.9'})},100);
})();
