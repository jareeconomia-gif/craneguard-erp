/* CraneGuard ERP · Production Scope Gate
   Objetivo: en producción no se muestra ninguna pantalla que solo simule acciones
   con localStorage, datos hardcodeados o toast. Solo módulos con backend real. */
(function(){
  'use strict';
  if(window.__cgProductionScope) return;
  window.__cgProductionScope=true;

  const safeByRole={
    direction:[
      ['Producción',[['dashboard','Dashboard'],['clientsMaster','Clientes']]],
      ['Reportes',[['reportControl','Centro de control'],['reportLibrary','Biblioteca de reportes']]]
    ],
    sales:[
      ['Producción',[['dashboard','Dashboard'],['clientsMaster','Clientes']]]
    ],
    sales_manager:[
      ['Producción',[['dashboard','Dashboard'],['clientsMaster','Clientes']]],
      ['Reportes',[['reportControl','Centro de control'],['reportLibrary','Biblioteca de reportes']]]
    ],
    coord:[
      ['Producción',[['dashboard','Dashboard'],['clientsMaster','Clientes']]],
      ['Reportes',[['reportControl','Centro de control'],['reportLibrary','Biblioteca'],['formLibrary','Formularios'],['templateBuilder','Plantillas'],['createReportV2','Crear reporte']]]
    ],
    tech_resp:[
      ['Reportes',[['dashboard','Dashboard'],['reportLibrary','Reportes'],['reportCapture','Captura de reporte']]]
    ],
    tech_comp:[
      ['Reportes',[['dashboard','Dashboard'],['reportLibrary','Reportes'],['reportCapture','Captura asignada']]]
    ],
    engineering:[
      ['Producción',[['dashboard','Dashboard'],['clientsMaster','Clientes'],['warehouseFindingSearch','Hallazgos / Refacciones'],['warehouseCatalog','Catálogo de refacciones']]],
      ['Reportes',[['reportControl','Centro de control'],['reportLibrary','Biblioteca'],['formLibrary','Formularios'],['templateBuilder','Plantillas']]]
    ],
    warehouse:[
      ['Almacén',[['warehousePhase1Dashboard','Dashboard'],['warehouseCatalog','Catálogo'],['warehouseStock','Existencias'],['warehouseReservations','Reservas'],['warehouseReceipts','Recepciones'],['warehouseReadyInstall','Listo para instalar'],['warehouseKardex','Kardex'],['warehouseImport','Importar Excel']]],
      ['Compras vinculadas',[['warehouseRequisitions','Requisiciones'],['warehousePurchaseOrders','OC proveedor'],['warehouseTransit','En tránsito']]]
    ],
    purchasing:[
      ['Compras',[['warehouseRequisitions','Requisiciones'],['warehousePurchaseOrders','OC proveedor'],['warehouseTransit','En tránsito']]],
      ['Almacén',[['warehouseCatalog','Catálogo'],['warehouseStock','Existencias'],['warehouseReceipts','Recepciones']]]
    ],
    client:[
      ['Portal',[['dashboard','Inicio']]]
    ],
    admin:[
      ['Producción',[['dashboard','Dashboard'],['clientsMaster','Clientes']]],
      ['Almacén',[['warehousePhase1Dashboard','Dashboard almacén'],['warehouseCatalog','Catálogo'],['warehouseStock','Existencias'],['warehouseReservations','Reservas'],['warehouseRequisitions','Requisiciones'],['warehousePurchaseOrders','OC proveedor'],['warehouseReceipts','Recepciones'],['warehouseTransit','En tránsito'],['warehouseReadyInstall','Listo para instalar'],['warehouseKardex','Kardex'],['warehouseImport','Importar Excel']]],
      ['Reportes',[['reportControl','Centro de control'],['reportLibrary','Biblioteca'],['formLibrary','Formularios'],['templateBuilder','Plantillas'],['createReportV2','Crear reporte'],['reportCapture','Captura']]],
      ['Administración',[['admin','Usuarios y permisos']]]
    ]
  };

  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  async function req(url){
    const r=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'}});
    let d={};try{d=await r.json()}catch{}
    if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    return d;
  }
  function card(label,value,sub){
    return `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="foot">${esc(sub||'')}</div></div>`;
  }
  function emptyDashboard(copy){
    if(typeof title==='function') title('Inicio','CraneGuard ERP · Producción');
    const v=document.getElementById('view'); if(!v)return;
    v.innerHTML=`<div class="cfg-hero"><div><div class="eyebrow">CRANEGUARD ERP · PRODUCCIÓN</div><h2>${esc(S?.name||'Usuario')}</h2><p>${esc(copy)}</p></div></div>`;
  }

  async function productionDashboard(){
    if(typeof title==='function') title('Dashboard','Indicadores calculados desde datos reales del servidor.');
    const v=document.getElementById('view'); if(!v)return;
    v.innerHTML='<div class="prod-empty"><b>Cargando información real…</b><span>Consultando PostgreSQL.</span></div>';
    try{
      const role=S?.role||'';
      if(role==='client'){
        return emptyDashboard('El Portal de Cliente no se habilita hasta que exista la relación cuenta → cliente en el backend. No se muestran datos simulados.');
      }
      if(role==='warehouse'||role==='purchasing'){
        const w=(await req('/api/warehouse/dashboard')).dashboard||{};
        v.innerHTML=`<div class="cfg-hero"><div><div class="eyebrow">CRANEGUARD ERP · PRODUCCIÓN</div><h2>Almacén / Compras</h2><p>Indicadores obtenidos directamente de PostgreSQL.</p></div></div><div class="kpi-grid">${card('Productos',w.total_products||0,'Catálogo')}${card('Disponibles',w.available_units||0,'Unidades')}${card('Reservadas',w.reserved_units||0,'Unidades')}${card('REQ pendientes',w.pending_requisitions||0,'Compras')}${card('En tránsito',w.in_transit||0,'OC proveedor')}${card('Listo para instalar',w.ready_install||0,'Reservas activas')}</div>`;
        return;
      }
      const calls=[req('/api/clients').catch(()=>({clients:[]}))];
      if(!['sales','client'].includes(role)) calls.push(req('/api/reporting/bootstrap').catch(()=>({reports:[],forms:[],templates:[]})));
      const data=await Promise.all(calls), clients=data[0]?.clients||[], reporting=data[1]||{};
      const reports=reporting.reports||[],forms=reporting.forms||[],templates=reporting.templates||[];
      v.innerHTML=`<div class="cfg-hero"><div><div class="eyebrow">CRANEGUARD ERP · PRODUCCIÓN</div><h2>Hola, ${esc(S?.name||'')}</h2><p>Solo se muestran indicadores respaldados por datos reales del servidor.</p></div></div><div class="kpi-grid">${card('Clientes',clients.length,'Expedientes reales')}${!['sales'].includes(role)?card('Reportes',reports.length,'PostgreSQL'):''}${!['sales'].includes(role)?card('Formularios publicados',forms.filter(x=>x.state==='Publicado').length,'Versionados'):''}${!['sales'].includes(role)?card('Plantillas publicadas',templates.filter(x=>x.state==='Publicado').length,'Vigentes'):''}</div>`;
    }catch(e){
      v.innerHTML=`<div class="prod-empty"><b>No fue posible cargar el Dashboard</b><span>${esc(e.message)}</span></div>`;
    }
  }

  function applyScope(){
    try{
      Object.keys(safeByRole).forEach(role=>{ if(typeof NAV!=='undefined') NAV[role]=safeByRole[role]; });
      if(typeof V!=='undefined'){
        V.dashboard=productionDashboard;
        if(window.clientsMaster) V.clientsMaster=window.clientsMaster;
        if(window.formLibrary) V.formLibrary=window.formLibrary;
        if(window.formBuilder) V.formBuilder=window.formBuilder;
        if(window.templateBuilder) V.templateBuilder=window.templateBuilder;
        if(window.createReportV2) V.createReportV2=window.createReportV2;
        if(window.reportControl) V.reportControl=window.reportControl;
        if(window.reportLibrary) V.reportLibrary=window.reportLibrary;
        if(window.reportCapture) V.reportCapture=window.reportCapture;
      }
      window.dashboard=productionDashboard;
      if(document.getElementById('app') && !document.getElementById('app').classList.contains('hidden') && typeof renderNav==='function') renderNav();
    }catch(e){console.error('[CraneGuard production scope]',e)}
  }

  applyScope();
  setTimeout(applyScope,0);
})();
