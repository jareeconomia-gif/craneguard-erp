/* CraneGuard ERP · Fix publicación de formularios · Build 9.4 */
(function(){
  function el(id){ return document.getElementById(id); }
  function value(id){ const node=el(id); return node ? String(node.value ?? '').trim() : ''; }
  function checked(id){ const node=el(id); return !!node?.checked; }

  function feedback(message, ok=false){
    try { if (typeof toast === 'function') toast(message); } catch {}
    let box=el('cgPublishFeedback');
    if(!box){
      box=document.createElement('div');
      box.id='cgPublishFeedback';
      box.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:min(760px,90vw);padding:14px 18px;border-radius:14px;font:700 14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 18px 50px rgba(15,23,42,.25);transition:.2s;';
      document.body.appendChild(box);
    }
    box.textContent=message;
    box.style.background=ok?'#ecfdf5':'#fff1f2';
    box.style.color=ok?'#065f46':'#9f1239';
    box.style.border=ok?'1px solid #a7f3d0':'1px solid #fecdd3';
    box.style.display='block';
    clearTimeout(box._timer);
    box._timer=setTimeout(()=>{box.style.display='none'},9000);
  }

  function captureOpenQuestion(){
    if(!window.S?.qedit || !el('qText')) return null;
    const f=findForm(S.form);
    if(!f) return null;
    const q=(f.questions||[]).find(x=>x.uid===S.qedit);
    if(!q) return null;

    q.text=value('qText');
    q.help=value('qHelp');
    q.type=value('qType');
    q.scope=value('qScope')||'Equipo';
    q.perEquipment=q.scope==='Equipo';
    q.options=value('qOptions');
    q.required=checked('qReq');
    q.visibility={tech:checked('qTech'),internal:true,pdf:checked('qPdf'),client:checked('qClient')};
    q.unit=value('qUnit');
    q.decimals=Number(value('qDec')||2);
    q.min=value('qMin');
    q.max=value('qMax');
    q.system=value('qSystem');
    q.component=value('qComponent');
    q.ruleConfig={
      enabled:checked('qRuleEnabled'),
      operator:value('qOperator')||'equals',
      value:value('qRuleValue'),
      severity:value('qSeverity')||'MEDIO',
      requirePhoto:checked('qPhoto'),
      requireComment:checked('qComment'),
      createFinding:checked('qFinding'),
      runAI:checked('qAI'),
      findParts:checked('qParts'),
      checkStock:checked('qStock')
    };
    return q;
  }

  function captureFormMeta(f){
    if(el('fCode')) f.code=value('fCode')||f.code;
    if(el('fName')) f.name=value('fName')||f.name;
    if(el('fCategory')) f.category=value('fCategory')||f.category;
    if(el('fDesc')) f.description=value('fDesc');
  }

  function validateForm(f){
    if(!f) return 'No se encontró el formulario activo.';
    if(f.state!=='Borrador') return 'Esta revisión ya no está en borrador. Crea una nueva revisión para publicarla.';
    if(!(f.questions||[]).length) return 'Agrega al menos una pregunta antes de publicar.';
    for(let i=0;i<f.questions.length;i++){
      const q=f.questions[i];
      if(!String(q.text||'').trim()) return `La pregunta ${i+1} no tiene texto.`;
      if(!String(q.type||'').trim()) return `La pregunta ${i+1} no tiene tipo de respuesta.`;
      if(q.ruleConfig?.enabled && !String(q.ruleConfig?.value||'').trim()) return `La pregunta ${i+1} tiene una regla activa, pero falta el valor de comparación.`;
    }
    return '';
  }

  window.publishConfiguredForm=async function(id){
    const button=document.querySelector(`button[onclick="publishConfiguredForm('${id}')"]`) || [...document.querySelectorAll('button')].find(b=>/Publicar revisión/i.test(b.textContent||''));
    const original=button?.textContent;
    try{
      if(button){button.disabled=true;button.textContent='Publicando…';}
      const f=findForm(id)||findForm(S.form);
      if(!f) throw new Error('No se encontró el formulario que intentas publicar.');

      captureOpenQuestion();
      captureFormMeta(f);

      const validation=validateForm(f);
      if(validation){ feedback('No se puede publicar: '+validation); return; }

      const saved=await api('/api/reporting/forms/'+encodeURIComponent(f.uid),{
        method:'PATCH',
        body:{
          code:f.code,
          name:f.name,
          category:f.category,
          description:f.description||'',
          questions:f.questions||[],
          audit:f.audit||[]
        }
      });
      const idx=(S.data.reportV2.forms||[]).findIndex(x=>x.uid===f.uid);
      if(idx>=0) S.data.reportV2.forms[idx]=saved.form;
      S.form=saved.form.uid;

      const published=await api('/api/reporting/forms/'+encodeURIComponent(saved.form.uid)+'/publish',{method:'POST'});
      if(typeof reportingReload==='function') await reportingReload();
      S.form=published.form.uid;
      feedback(`Formulario ${published.form.code} ${published.form.version} publicado correctamente.`,true);
      go('formBuilder');
    }catch(e){
      console.error('Error publicando formulario',e);
      feedback('No se pudo publicar: '+(e?.message||String(e)));
    }finally{
      if(button){button.disabled=false;button.textContent=original||'Publicar revisión';}
    }
  };
})();
