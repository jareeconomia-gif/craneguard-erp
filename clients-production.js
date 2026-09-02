/* CraneGuard ERP · Clientes reales · PostgreSQL */
(function(){
  'use strict';
  if(window.__cgClientsProduction) return;
  window.__cgClientsProduction=true;

  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function api(url,opt={}){
    const headers={...(opt.headers||{})};
    if(opt.body && typeof opt.body!=='string'){ headers['Content-Type']='application/json'; opt.body=JSON.stringify(opt.body); }
    const r=await fetch(url,{credentials:'same-origin',...opt,headers}); let d={}; try{d=await r.json()}catch{}
    if(!r.ok) throw new Error(d.error||`Error HTTP ${r.status}`); return d;
  }
  function flash(msg,ok=true){
    let x=$id('cgClientFlash'); if(!x){x=document.createElement('div');x.id='cgClientFlash';x.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:780px;padding:14px 18px;border-radius:14px;font:800 14px system-ui;box-shadow:0 18px 50px rgba(15,23,42,.22)';document.body.appendChild(x)}
    x.textContent=msg;x.style.background=ok?'#ecfdf5':'#fff1f2';x.style.color=ok?'#065f46':'#9f1239';x.style.border=ok?'1px solid #86efac':'1px solid #fda4af';x.style.display='block';clearTimeout(x._t);x._t=setTimeout(()=>x.style.display='none',7000);
  }
  function banner(){return `<div class="erp-banner"><div class="eyebrow">CRANEGUARD ERP</div><h2>Expediente maestro de clientes</h2><p>Captura una sola vez los datos fiscales, comerciales, operativos, plantas y contactos. La información queda guardada en PostgreSQL y disponible para los usuarios autorizados.</p><div class="trace-chain">${['Cliente','Planta','Póliza','Equipo','OS','Reporte','Hallazgo','Refacción','Cotización','OC','Factura','Pago'].map(x=>`<span class="trace-node">${x}</span>`).join('')}</div></div>`}
  function statusPill(n){return Number(n)>=85?'<span class="badge green">EXPEDIENTE COMPLETO</span>':'<span class="badge yellow">INCOMPLETO</span>'}

  async function renderClients(){
    try{
      if(typeof title==='function') title('Clientes · expediente maestro','Cliente, planta y entidad de facturación son entidades relacionadas pero distintas.');
      const view=$id('view'); if(!view) return;
      view.innerHTML=banner()+`<div class="panel"><div class="panel-head"><div><h3>Clientes</h3><p>Altas reales compartidas por todos los usuarios autorizados.</p></div><button id="cgAddClient" class="btn sm">＋ Alta de cliente</button></div><div id="cgClientList" class="help">Cargando clientes…</div></div>`;
      $id('cgAddClient')?.addEventListener('click',openCreate);
      const d=await api('/api/clients');
      const rows=d.clients||[];
      $id('cgClientList').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>CLIENTE</th><th>RFC</th><th>PLANTA(S)</th><th>VENDEDOR</th><th>CRÉDITO</th><th>EXPEDIENTE</th></tr></thead><tbody>${rows.map(c=>`<tr><td><button class="row-action cgClientOpen" data-id="${esc(c.id)}">${esc(c.name)}</button></td><td>${esc(c.rfc||'—')}</td><td>${esc((c.plants||[]).map(p=>p.name).filter(Boolean).join(', ')||'—')}</td><td>${esc(c.seller||'—')}</td><td>${Number(c.creditDays||0)} días</td><td>${statusPill(c.complete)}</td></tr>`).join('')}</tbody></table></div>`:`<div style="padding:34px;text-align:center;border:1px dashed #cbd5e1;border-radius:18px;background:#fff"><b>No hay clientes registrados.</b><div class="help" style="margin-top:6px">Usa “Alta de cliente” para crear el primer expediente.</div></div>`;
      document.querySelectorAll('.cgClientOpen').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.id)));
    }catch(e){flash('No se pudieron cargar los clientes: '+e.message,false);}
  }

  function modalHtml(){
    return `<div id="cgClientModal" style="position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.48);backdrop-filter:blur(5px);display:flex;align-items:flex-start;justify-content:center;padding:28px;overflow:auto">
      <form id="cgClientForm" style="width:min(1080px,96vw);background:white;border-radius:24px;box-shadow:0 30px 90px rgba(15,23,42,.30);overflow:hidden">
        <div style="padding:24px 28px;background:linear-gradient(135deg,#0b3569,#174a86);color:white;display:flex;justify-content:space-between;gap:20px;align-items:center"><div><div style="font-size:11px;font-weight:900;letter-spacing:.18em;color:#93c5fd">EXPEDIENTE MAESTRO</div><h2 style="margin:5px 0 0">Alta de cliente</h2><p style="margin:6px 0 0;color:#dbeafe">Puedes guardar el expediente aunque todavía falten campos no críticos.</p></div><button type="button" id="cgClientClose" class="btn">✕ Cerrar</button></div>
        <div style="padding:24px 28px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">
          ${section(1,'Datos generales',field('Nombre comercial*','cName','text','Ej. Industrias ABC')+field('Razón social','cLegal','text','Razón social completa')+field('Giro / actividad','cBusiness'))}
          ${section(2,'Datos fiscales',field('RFC','cRfc','text','ABC010101XXX')+field('Régimen fiscal','cRegime')+field('Código postal fiscal','cZip')+field('Uso CFDI','cCfdi'))}
          ${section(3,'Domicilio fiscal',area('Domicilio fiscal','cAddress','Calle, número, colonia, municipio, estado'))}
          ${section(4,'Planta inicial',field('Nombre de planta','cPlant')+field('Ciudad / Estado','cCity')+field('Condiciones de acceso','cAccess')+field('Requisitos de seguridad','cSecurity'))}
          ${section(5,'Contacto principal',field('Nombre','cContact')+field('Puesto / rol','cContactRole')+field('Correo','cEmail','email')+field('Teléfono','cPhone'))}
          ${section(6,'Condiciones comerciales',field('Vendedor responsable','cSeller')+field('Respaldo comercial','cBackup')+select('Moneda','cCurrency',['MXN','USD'])+field('Días de crédito','cCredit','number','0')+field('Forma de pago','cPayForm')+field('Método de pago','cPayMethod'))}
          ${section(7,'Documentos',area('Documentos / pendientes del expediente','cDocs','Constancia fiscal, comprobante de domicilio, contrato, etc.'))}
          ${section(8,'Confirmación',`<label style="display:block;font-weight:800;font-size:12px;color:#475569">Estado</label><select id="cStatus" class="input" style="width:100%;margin-top:6px"><option>Activo</option><option>Prospecto</option><option>Inactivo</option></select><div style="margin-top:14px;padding:12px;border-radius:12px;background:#eff6ff;color:#1e3a8a;font-size:12px">El expediente se guardará en PostgreSQL y aparecerá inmediatamente en la cartera autorizada.</div>`)}
        </div>
        <div style="padding:18px 28px 26px;display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0"><button type="button" id="cgClientCancel" class="btn">Cancelar</button><button type="submit" id="cgClientSave" class="btn primary">Guardar cliente</button></div>
      </form></div>`;
  }
  function field(label,id,type='text',ph=''){return `<label style="display:block;margin-top:10px;font-weight:800;font-size:12px;color:#475569">${label}<input id="${id}" type="${type}" placeholder="${esc(ph)}" class="input" style="width:100%;margin-top:6px"></label>`}
  function area(label,id,ph=''){return `<label style="display:block;margin-top:10px;font-weight:800;font-size:12px;color:#475569">${label}<textarea id="${id}" placeholder="${esc(ph)}" class="input" rows="3" style="width:100%;margin-top:6px"></textarea></label>`}
  function select(label,id,opts){return `<label style="display:block;margin-top:10px;font-weight:800;font-size:12px;color:#475569">${label}<select id="${id}" class="input" style="width:100%;margin-top:6px">${opts.map(o=>`<option>${esc(o)}</option>`).join('')}</select></label>`}
  function section(n,t,content){return `<section style="border:1px solid #dbe4ef;border-radius:18px;padding:16px;background:#fff"><div style="display:flex;align-items:center;gap:9px;margin-bottom:4px"><span style="width:26px;height:26px;border-radius:8px;background:#eaf2ff;color:#1659c8;display:grid;place-items:center;font-weight:900">${n}</span><b>${t}</b></div>${content}</section>`}
  function val(id){return String($id(id)?.value||'').trim()}
  function openCreate(){
    document.body.insertAdjacentHTML('beforeend',modalHtml());
    const close=()=> $id('cgClientModal')?.remove();
    $id('cgClientClose').onclick=close;$id('cgClientCancel').onclick=close;
    $id('cgClientForm').addEventListener('submit',async ev=>{ev.preventDefault();const btn=$id('cgClientSave');const old=btn.textContent;try{
      if(!val('cName')) throw new Error('Escribe el nombre comercial del cliente.');
      btn.disabled=true;btn.textContent='Guardando…';
      const plant=val('cPlant')?{name:val('cPlant'),city:val('cCity'),access:val('cAccess'),security:val('cSecurity')}:null;
      const contact=val('cContact')?{name:val('cContact'),role:val('cContactRole'),plant:val('cPlant'),email:val('cEmail'),phone:val('cPhone')}:null;
      const legal=val('cLegal')||val('cName'),rfc=val('cRfc'),zip=val('cZip');
      const body={name:val('cName'),legal,rfc,business:val('cBusiness'),fiscalRegime:val('cRegime'),fiscalZip:zip,fiscalAddress:val('cAddress'),cfdi:val('cCfdi'),paymentForm:val('cPayForm'),paymentMethod:val('cPayMethod'),currency:val('cCurrency')||'MXN',creditDays:Number(val('cCredit')||0),seller:val('cSeller'),backup:val('cBackup'),status:val('cStatus')||'Activo',plants:plant?[plant]:[],contacts:contact?[contact]:[],billing:[{name:legal,rfc,zip,default:true}],documentNotes:val('cDocs')};
      const d=await api('/api/clients',{method:'POST',body}); flash(`Cliente ${d.client.name} creado correctamente.`,true);close();await renderClients();
    }catch(e){flash('No se pudo crear el cliente: '+e.message,false)}finally{if(btn&&document.body.contains(btn)){btn.disabled=false;btn.textContent=old}}
    });
  }

  async function openDetail(id){
    try{
      const {client:c}=await api('/api/clients/'+encodeURIComponent(id)); if(typeof title==='function') title(c.name,'Expediente maestro · '+(c.rfc||c.code));
      const view=$id('view'); if(!view)return;
      const plants=(c.plants||[]).map(p=>`<div class="master-card"><h4>${esc(p.name||'Planta')}</h4><p>${esc(p.city||'')}<br>Acceso: ${esc(p.access||'—')}<br>Seguridad: ${esc(p.security||'—')}</p></div>`).join('')||'<div class="help">Sin plantas registradas.</div>';
      const contacts=(c.contacts||[]).map(x=>`<div class="master-card"><h4>${esc(x.name||'Contacto')} · ${esc(x.role||'')}</h4><p>${esc(x.email||'')} · ${esc(x.phone||'')}</p></div>`).join('')||'<div class="help">Sin contactos registrados.</div>';
      view.innerHTML=banner()+`<div style="margin:14px 0"><button id="cgBackClients" class="btn sm">← Volver a clientes</button></div><div class="grid two"><div class="panel"><h3>Datos generales y fiscales</h3><table><tbody>${[['Código',c.code],['Razón social',c.legal],['RFC',c.rfc],['Giro',c.business],['Régimen fiscal',c.fiscalRegime],['CP fiscal',c.fiscalZip],['Uso CFDI',c.cfdi],['Moneda',c.currency],['Días de crédito',(c.creditDays||0)+' días'],['Vendedor',c.seller]].map(x=>`<tr><td><b>${esc(x[0])}</b></td><td>${esc(x[1]||'—')}</td></tr>`).join('')}</tbody></table></div><div class="panel"><h3>Estado del expediente</h3><div style="font-size:38px;font-weight:900;color:#123f77">${Number(c.complete||0)}%</div>${statusPill(c.complete)}<p class="help">Los campos pueden completarse posteriormente.</p></div></div><div class="grid two"><div class="panel"><h3>Plantas</h3>${plants}</div><div class="panel"><h3>Contactos</h3>${contacts}</div></div>`;
      $id('cgBackClients')?.addEventListener('click',renderClients);
    }catch(e){flash('No se pudo abrir el cliente: '+e.message,false)}
  }

  window.cgOpenClientWizard=openCreate;
  window.cgOpenClient=openDetail;
  window.clientsMaster=renderClients;
})();
