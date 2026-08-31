/* CraneGuard ERP · Reportes configurables reales · PostgreSQL */
(function(){
const legacy={
 formBuilder:window.formBuilder, templateBuilder:window.templateBuilder, reportWorkspace:window.reportWorkspace,
 reportCapture:window.reportCapture, reportFinding:window.reportFinding, reportReview:window.reportReview,
 reportVersions:window.reportVersions, pdfDelivery:window.pdfDelivery,
 addConfiguredQuestion:window.addConfiguredQuestion, saveQuestionConfig:window.saveQuestionConfig,
 moveQuestion:window.moveQuestion, duplicateQuestion:window.duplicateQuestion, deleteQuestion:window.deleteQuestion,
 addFormToTemplate:window.addFormToTemplate, moveTemplateForm:window.moveTemplateForm, removeTemplateForm:window.removeTemplateForm
};
function err(e){toast(e?.message||String(e));console.error(e)}
function repEmpty(t,m,a=''){title(t,m);$('view').innerHTML=`<div class="prod-empty"><b>${t}</b><span>${m}</span>${a?`<div style="margin-top:14px">${a}</div>`:''}</div>`}
async function reportingReload(){const d=await api('/api/reporting/bootstrap');S.data.reportV2.forms=d.forms||[];S.data.reportV2.templates=d.templates||[];S.data.reportV2.reports=d.reports||[];S.data.reportV2.reportFindings=d.findings||[];return d}
window.reportingReload=reportingReload;
const oldOpen=openAuthenticatedApp;openAuthenticatedApp=function(profile){oldOpen(profile);reportingReload().catch(console.error)};

formLibrary=async function(){try{await reportingReload();title('Formularios','Constructor configurable almacenado en PostgreSQL.');let fs=S.data.reportV2.forms;$('view').innerHTML=`<div class="cfg-hero"><div><div class="eyebrow">REPORTES · PRODUCCIÓN</div><h2>Biblioteca de formularios</h2><p>Crea preguntas, parámetros y reglas reutilizables. Todos los cambios se guardan en el servidor.</p></div><div class="cfg-actions"><button class="btn primary" onclick="createNewForm()">＋ Nuevo formulario</button><button class="btn" onclick="go('templateBuilder')">Plantillas</button></div></div>${fs.length?panel('Formularios','Una revisión publicada queda inmutable.',table(['Código','Nombre','Categoría','Versión','Estado','Preguntas','Acciones'],fs.map(f=>`<tr><td>${eh(f.code)}</td><td>${eh(f.name)}</td><td>${eh(f.category)}</td><td>${eh(f.version)}</td><td>${badge(f.state,f.state==='Publicado'?'green':f.state==='Obsoleto'?'gray':'yellow')}</td><td>${(f.questions||[]).length}</td><td><button class="btn sm" onclick="S.form='${f.uid}';go('formBuilder')">Abrir</button> ${f.state==='Publicado'?`<button class="btn sm" onclick="createFormRevision('${f.uid}')">Nueva revisión</button>`:''}</td></tr>`))):`<div class="prod-empty"><b>Aún no hay formularios</b><span>Crea el primero; después podrás agregar preguntas sin modificar código.</span><div style="margin-top:14px"><button class="btn primary" onclick="createNewForm()">Crear primer formulario</button></div></div>`}`;}catch(e){err(e)}};
createNewForm=async function(){try{let d=await api('/api/reporting/forms',{method:'POST',body:{name:'Nuevo formulario',category:'General'}});S.data.reportV2.forms.unshift(d.form);S.form=d.form.uid;toast('Formulario creado en PostgreSQL');go('formBuilder')}catch(e){err(e)}};
formBuilder=async function(){try{if(!(S.data.reportV2.forms||[]).length)await reportingReload();if(!(S.data.reportV2.forms||[]).length)return repEmpty('Constructor de formulario','Crea primero un formulario.','<button class="btn primary" onclick="createNewForm()">＋ Nuevo formulario</button>');legacy.formBuilder()}catch(e){err(e)}};
async function persistForm(){let f=findForm(S.form);if(!f)return;let d=await api('/api/reporting/forms/'+encodeURIComponent(f.uid),{method:'PATCH',body:{code:f.code,name:f.name,category:f.category,description:f.description,questions:f.questions,audit:f.audit||[]}});let i=S.data.reportV2.forms.findIndex(x=>x.uid===f.uid);if(i>=0)S.data.reportV2.forms[i]=d.form;S.form=d.form.uid;return d.form}
saveFormMeta=async function(){try{let f=findForm(S.form);if(f.state!=='Borrador')return toast('Crea una nueva revisión para modificar una versión publicada.');f.code=val('fCode')||f.code;f.name=val('fName')||f.name;f.category=val('fCategory')||f.category;f.description=val('fDesc');await persistForm();toast('Formulario guardado en servidor');go('formBuilder')}catch(e){err(e)}};
for(const [name,fn] of [['addConfiguredQuestion',legacy.addConfiguredQuestion],['moveQuestion',legacy.moveQuestion],['duplicateQuestion',legacy.duplicateQuestion],['deleteQuestion',legacy.deleteQuestion]]){window[name]=async function(...args){try{fn(...args);await persistForm();toast('Cambio sincronizado')}catch(e){err(e)}}}
saveQuestionConfig=async function(qid){try{legacy.saveQuestionConfig(qid);await persistForm();toast('Pregunta guardada en PostgreSQL')}catch(e){err(e)}};
createFormRevision=async function(id){try{let d=await api('/api/reporting/forms/'+encodeURIComponent(id)+'/revision',{method:'POST'});await reportingReload();S.form=d.form.uid;toast('Nueva revisión creada');go('formBuilder')}catch(e){err(e)}};

createNewTemplate=async function(){try{let d=await api('/api/reporting/templates',{method:'POST',body:{name:'Nueva plantilla'}});S.data.reportV2.templates.unshift(d.template);S.template=d.template.uid;toast('Plantilla creada en PostgreSQL');go('templateBuilder')}catch(e){err(e)}};
templateBuilder=async function(){try{if(!(S.data.reportV2.templates||[]).length)await reportingReload();if(!(S.data.reportV2.templates||[]).length)return repEmpty('Constructor de plantilla','Crea una plantilla y agrega formularios publicados.','<button class="btn primary" onclick="createNewTemplate()">＋ Nueva plantilla</button>');legacy.templateBuilder()}catch(e){err(e)}};
async function persistTemplate(){let t=findTemplate(S.template);if(!t)return;let d=await api('/api/reporting/templates/'+encodeURIComponent(t.uid),{method:'PATCH',body:{code:t.code,name:t.name,sla:t.sla,formRefs:t.formRefs||[],signatures:t.signatures||[],pdf:t.pdf||'Cliente + interno',repeatPerEquipment:t.repeatPerEquipment!==false,forms:t.forms||[],pdfSections:t.pdfSections||[]}});let i=S.data.reportV2.templates.findIndex(x=>x.uid===t.uid);if(i>=0)S.data.reportV2.templates[i]=d.template;S.template=d.template.uid;return d.template}
saveTemplateConfig=async function(){try{let t=findTemplate(S.template);if(t.state!=='Borrador')return toast('Crea una nueva revisión para modificar una plantilla publicada.');t.code=val('tplCode')||t.code;t.name=val('tplName')||t.name;t.sla=Number(val('tplSla')||4);t.signatures=val('tplSigns').split('\n').map(x=>x.trim()).filter(Boolean);t.pdf=val('tplPdf');t.repeatPerEquipment=$('tplRepeat').checked;t.forms=(t.formRefs||[]).map(ref=>{let f=findForm(ref);return f?f.code+' '+f.version:ref});await persistTemplate();toast('Plantilla guardada en servidor')}catch(e){err(e)}};
for(const [name,fn] of [['addFormToTemplate',legacy.addFormToTemplate],['moveTemplateForm',legacy.moveTemplateForm],['removeTemplateForm',legacy.removeTemplateForm]]){window[name]=async function(...args){try{fn(...args);await persistTemplate();toast('Plantilla sincronizada')}catch(e){err(e)}}}
publishTemplate=async function(id){try{let t=findTemplate(id);if(t?.state==='Publicado'){let d=await api('/api/reporting/templates/'+encodeURIComponent(id)+'/revision',{method:'POST'});await reportingReload();S.template=d.template.uid;toast('Nueva revisión editable creada');return go('templateBuilder')}await saveTemplateConfig();let d=await api('/api/reporting/templates/'+encodeURIComponent(id)+'/publish',{method:'POST'});await reportingReload();S.template=d.template.uid;toast('Plantilla publicada y disponible para reportes');go('templateBuilder')}catch(e){err(e)}};

createReportV2=async function(){try{await reportingReload();let ts=S.data.reportV2.templates.filter(t=>t.state==='Publicado');title('Crear reporte','Genera un reporte real a partir de una plantilla publicada.');if(!ts.length)return repEmpty('Crear reporte','Primero publica una plantilla.','<button class="btn primary" onclick="go(\'templateBuilder\')">Ir a Plantillas</button>');let today=new Date().toISOString().slice(0,10);$('view').innerHTML=`<div class="cfg-hero"><div><div class="eyebrow">REPORTE TÉCNICO · PRODUCCIÓN</div><h2>Nuevo reporte</h2><p>El reporte se almacena en PostgreSQL y congela la plantilla y preguntas vigentes.</p></div></div>${panel('Datos del reporte','Estos datos identifican la ejecución real.',`<div class="form-grid three"><label>Orden de Servicio / referencia<input id="rvOs" placeholder="OS-2026-0001"></label><label>Cliente<input id="rvClient" placeholder="Razón social"></label><label>Planta<input id="rvPlant" placeholder="Planta / ubicación"></label><label>Equipo<input id="rvEq" placeholder="Grúa / polipasto / activo"></label><label>Plantilla<select id="rvTpl">${ts.map(t=>`<option value="${t.uid}">${eh(t.code)} ${eh(t.version)} · ${eh(t.name)}</option>`).join('')}</select></label><label>Origen<select id="rvOrigin"><option>POL</option><option>ED</option><option>EI</option><option>MIX</option><option selected>PD</option></select></label><label>Responsable<input id="rvResp" value="${eh(S.name)}"></label><label>Colaborador<input id="rvCollab" placeholder="Opcional"></label><label>Revisor<input id="rvReviewer" placeholder="Supervisor / Ingeniería"></label><label>Fecha de servicio<input id="rvDate" type="date" value="${today}"></label><label>Fecha límite<input id="rvDue" type="date" value="${today}"></label></div><button class="btn primary" onclick="createConfiguredReport()">Crear reporte y abrir captura</button>`)}`;}catch(e){err(e)}};
createConfiguredReport=async function(){try{if(!val('rvClient')||!val('rvEq'))return toast('Cliente y equipo son obligatorios');let d=await api('/api/reporting/reports',{method:'POST',body:{templateId:val('rvTpl'),os:val('rvOs'),client:val('rvClient'),plant:val('rvPlant'),asset:val('rvEq'),origin:val('rvOrigin'),responsible:val('rvResp'),collaborator:val('rvCollab'),reviewer:val('rvReviewer'),serviceDate:val('rvDate'),due:val('rvDue')}});S.data.reportV2.reports.unshift(d.report);S.rep=d.report.id;toast(d.report.id+' creado en servidor');go('reportCapture')}catch(e){err(e)}};

reportControl=async function(){try{await reportingReload();title('Centro de control · Reportes','Reportes reales almacenados en PostgreSQL.');let rs=S.data.reportV2.reports||[],overdue=rs.filter(isOverdue).length,review=rs.filter(r=>r.status==='En revisión técnica').length,approved=rs.filter(r=>r.status==='Aprobado').length;let body=rs.length?table(['Reporte','Cliente','Equipo','Responsable','Estado','Avance'],rs.map(r=>`<tr><td><span class="row-action" onclick="openRep('${r.id}')">${eh(r.id)}</span></td><td>${eh(r.client)}</td><td>${eh(r.asset)}</td><td>${eh(r.responsible||'—')}</td><td>${rptBadge(r.status)}</td><td>${repProgress(r)}%</td></tr>`)):`<div class="prod-empty"><b>Sin reportes</b><span>Crea un reporte desde una plantilla publicada.</span><div style="margin-top:12px"><button class="btn primary" onclick="go('createReportV2')">＋ Crear reporte</button></div></div>`;$('view').innerHTML=`<div class="kpi-grid">${kpi('Reportes',rs.length,'Registrados')}${kpi('En revisión',review,'Pendientes')}${kpi('Aprobados',approved,'Listos')}${kpi('Vencidos',overdue,'Atención')}</div>${panel('Reportes técnicos','Información compartida entre usuarios.',body)}`;}catch(e){err(e)}};
reportLibrary=reportControl;
reportWorkspace=async function(){try{if(!(S.data.reportV2.reports||[]).some(r=>r.id===S.rep))await reportingReload();if(!(S.data.reportV2.reports||[]).length)return repEmpty('Reportes','No hay reportes registrados.','<button class="btn primary" onclick="go(\'createReportV2\')">＋ Crear reporte</button>');legacy.reportWorkspace()}catch(e){err(e)}};
reportCapture=async function(){try{if(!(S.data.reportV2.reports||[]).some(r=>r.id===S.rep))await reportingReload();if(!(S.data.reportV2.reports||[]).length)return repEmpty('Captura de reporte','No hay un reporte activo.');legacy.reportCapture()}catch(e){err(e)}};
saveDynamicCapture=async function(){try{let r=getRep();let d=await api('/api/reporting/reports/'+encodeURIComponent(r.uid)+'/capture',{method:'POST',body:{answers:r.answers||{}}});let i=S.data.reportV2.reports.findIndex(x=>x.uid===r.uid);if(i>=0)S.data.reportV2.reports[i]=d.report;S.data.reportV2.reportFindings=(S.data.reportV2.reportFindings||[]).filter(x=>x.report!==d.report.id).concat(d.findings||[]);S.rep=d.report.id;toast('Captura guardada en PostgreSQL');go('reportCapture')}catch(e){err(e)}};
reportFinding=async function(){try{await reportingReload();if(!(S.data.reportV2.reportFindings||[]).length)return repEmpty('Hallazgos del reporte','Todavía no se han generado hallazgos desde las reglas de captura.');legacy.reportFinding()}catch(e){err(e)}};
pdfDelivery=async function(){try{if(!(S.data.reportV2.reports||[]).some(r=>r.id===S.rep))await reportingReload();if(!(S.data.reportV2.reports||[]).length)return repEmpty('PDF / Entrega','No hay reporte para generar.');legacy.pdfDelivery()}catch(e){err(e)}};

Object.assign(V,{formLibrary,formBuilder,templateBuilder,createReportV2,reportControl,reportLibrary,reportWorkspace,reportCapture,reportFinding,pdfDelivery});
})();

/* Build 9.4 · publicación robusta de formularios */
(function(){
function el(id){return document.getElementById(id)}
function v(id){const n=el(id);return n?String(n.value??'').trim():''}
function c(id){return !!el(id)?.checked}
function msg(text,ok=false){try{toast(text)}catch{};let b=el('cgPublishFeedback');if(!b){b=document.createElement('div');b.id='cgPublishFeedback';b.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:min(780px,92vw);padding:14px 18px;border-radius:14px;font:700 14px/1.4 system-ui;box-shadow:0 18px 45px rgba(15,23,42,.22)';document.body.appendChild(b)}b.textContent=text;b.style.background=ok?'#ecfdf5':'#fff1f2';b.style.color=ok?'#065f46':'#9f1239';b.style.border=ok?'1px solid #a7f3d0':'1px solid #fecdd3';b.style.display='block';clearTimeout(b._t);b._t=setTimeout(()=>b.style.display='none',9000)}
function captureQuestion(){if(!S?.qedit||!el('qText'))return;const f=findForm(S.form),q=(f?.questions||[]).find(x=>x.uid===S.qedit);if(!q)return;q.text=v('qText');q.help=v('qHelp');q.type=v('qType');q.scope=v('qScope')||'Equipo';q.perEquipment=q.scope==='Equipo';q.options=v('qOptions');q.required=c('qReq');q.visibility={tech:c('qTech'),internal:true,pdf:c('qPdf'),client:c('qClient')};q.unit=v('qUnit');q.decimals=Number(v('qDec')||2);q.min=v('qMin');q.max=v('qMax');q.system=v('qSystem');q.component=v('qComponent');q.ruleConfig={enabled:c('qRuleEnabled'),operator:v('qOperator')||'equals',value:v('qRuleValue'),severity:v('qSeverity')||'MEDIO',requirePhoto:c('qPhoto'),requireComment:c('qComment'),createFinding:c('qFinding'),runAI:c('qAI'),findParts:c('qParts'),checkStock:c('qStock')}}
window.publishConfiguredForm=async function(id){const btn=[...document.querySelectorAll('button')].find(x=>/Publicar revisión/i.test(x.textContent||'')),old=btn?.textContent;try{if(btn){btn.disabled=true;btn.textContent='Publicando…'}const f=findForm(id)||findForm(S.form);if(!f)throw new Error('No se encontró el formulario activo.');if(f.state!=='Borrador')throw new Error('Esta revisión ya no está en borrador.');captureQuestion();if(el('fCode'))f.code=v('fCode')||f.code;if(el('fName'))f.name=v('fName')||f.name;if(el('fCategory'))f.category=v('fCategory')||f.category;if(el('fDesc'))f.description=v('fDesc');if(!(f.questions||[]).length)throw new Error('Agrega al menos una pregunta antes de publicar.');for(let i=0;i<f.questions.length;i++){const q=f.questions[i];if(!String(q.text||'').trim())throw new Error(`La pregunta ${i+1} no tiene texto.`);if(!String(q.type||'').trim())throw new Error(`La pregunta ${i+1} no tiene tipo.`);if(q.ruleConfig?.enabled&&!String(q.ruleConfig.value||'').trim())throw new Error(`La pregunta ${i+1} tiene una regla activa pero falta el valor de comparación.`)}const saved=await api('/api/reporting/forms/'+encodeURIComponent(f.uid),{method:'PATCH',body:{code:f.code,name:f.name,category:f.category,description:f.description||'',questions:f.questions||[],audit:f.audit||[]}});const ix=(S.data.reportV2.forms||[]).findIndex(x=>x.uid===f.uid);if(ix>=0)S.data.reportV2.forms[ix]=saved.form;S.form=saved.form.uid;const pub=await api('/api/reporting/forms/'+encodeURIComponent(saved.form.uid)+'/publish',{method:'POST'});await reportingReload();S.form=pub.form.uid;msg(`Formulario ${pub.form.code} ${pub.form.version} publicado correctamente.`,true);go('formLibrary')}catch(e){console.error(e);msg('No se pudo publicar: '+(e?.message||String(e)))}finally{if(btn){btn.disabled=false;btn.textContent=old||'Publicar revisión'}}};
})();

/* Build 9.5 · acciones primarias de formulario claramente clickeables */
(function(){
  const STYLE_ID='cg-report-actions-95';
  function injectStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      .cfg-actions{display:flex!important;gap:12px!important;align-items:center!important;flex-wrap:wrap!important}
      .cfg-actions .cg-save-action,.cfg-actions .cg-publish-action{appearance:none!important;-webkit-appearance:none!important;min-height:50px!important;border-radius:13px!important;padding:0 22px!important;font-weight:900!important;font-size:15px!important;line-height:1!important;cursor:pointer!important;user-select:none!important;transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:9px!important}
      .cfg-actions .cg-save-action{background:#ffffff!important;color:#122033!important;border:1.5px solid #c8d4e5!important;box-shadow:0 5px 14px rgba(15,23,42,.08)!important}
      .cfg-actions .cg-save-action:hover{background:#f7faff!important;border-color:#9fb4d0!important;transform:translateY(-2px)!important;box-shadow:0 10px 22px rgba(15,23,42,.12)!important}
      .cfg-actions .cg-publish-action{background:linear-gradient(135deg,#1f62ee 0%,#2455d9 100%)!important;color:#fff!important;border:2px solid rgba(255,255,255,.92)!important;box-shadow:0 10px 26px rgba(32,91,220,.38),inset 0 1px 0 rgba(255,255,255,.24)!important;min-width:205px!important}
      .cfg-actions .cg-publish-action:hover{background:linear-gradient(135deg,#2e73ff 0%,#1f4ac8 100%)!important;transform:translateY(-2px) scale(1.01)!important;box-shadow:0 15px 32px rgba(32,91,220,.48),inset 0 1px 0 rgba(255,255,255,.28)!important}
      .cfg-actions .cg-publish-action:active,.cfg-actions .cg-save-action:active{transform:translateY(0) scale(.985)!important}
      .cfg-actions .cg-publish-action:focus-visible,.cfg-actions .cg-save-action:focus-visible{outline:3px solid #ffd400!important;outline-offset:3px!important}
      .cfg-actions .cg-publish-action:disabled{cursor:wait!important;opacity:.72!important;transform:none!important;box-shadow:none!important}
      .cg-action-hint{width:100%;font-size:11px!important;color:rgba(255,255,255,.72)!important;text-align:right!important;margin-top:-4px!important}
    `;
    document.head.appendChild(s);
  }
  function enhanceFormActions(){
    injectStyle();
    const actions=document.querySelector('.cfg-hero .cfg-actions');
    if(!actions) return;
    const buttons=[...actions.querySelectorAll('button')];
    const saveBtn=buttons.find(b=>/^Guardar$/i.test((b.textContent||'').trim())||/Guardar cambios/i.test(b.textContent||''));
    const publishBtn=buttons.find(b=>/Publicar revisión/i.test(b.textContent||''));
    if(saveBtn){
      saveBtn.classList.add('cg-save-action');
      saveBtn.type='button';
      saveBtn.innerHTML='<span aria-hidden="true">💾</span><span>Guardar cambios</span>';
      saveBtn.title='Guardar el formulario como borrador';
      saveBtn.onclick=function(ev){ev.preventDefault();ev.stopPropagation();return window.saveFormMeta?.()};
    }
    if(publishBtn){
      publishBtn.classList.add('cg-publish-action');
      publishBtn.type='button';
      publishBtn.innerHTML='<span aria-hidden="true">✓</span><span>Publicar revisión</span>';
      publishBtn.title='Guardar y publicar esta revisión para poder usarla en plantillas';
      publishBtn.onclick=function(ev){ev.preventDefault();ev.stopPropagation();return window.publishConfiguredForm?.(S.form)};
      if(!actions.querySelector('.cg-action-hint')){
        const hint=document.createElement('div');
        hint.className='cg-action-hint';
        hint.textContent='Publicar bloquea esta revisión y la habilita para Plantillas.';
        actions.appendChild(hint);
      }
    }
    document.querySelectorAll('body *').forEach(n=>{
      if(n.childNodes.length===1&&n.firstChild?.nodeType===3){
        const tx=(n.textContent||'').trim();
        if(tx==='Build 9.2') n.textContent='Build 9.5';
        if(tx==='BUILD 9.2 · CLICKS ACTIVOS') n.textContent='BUILD 9.5 · PUBLICACIÓN ACTIVA';
      }
    });
  }
  const currentFormBuilder=window.formBuilder;
  window.formBuilder=async function(...args){
    const result=await currentFormBuilder(...args);
    setTimeout(enhanceFormActions,0);
    return result;
  };
  try{if(typeof V!=='undefined') V.formBuilder=window.formBuilder}catch{}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(enhanceFormActions,0));
  else setTimeout(enhanceFormActions,0);
})();
