// CraneGuard ERP · Almacén Fase 1 · Refacciones
const whFmt = x => Number(x || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 });
const whMoney = x => '$' + Number(x || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });
function whEsc(x){ return typeof eh === 'function' ? eh(x) : String(x ?? ''); }
function whHero(titleText, copy){
  return `<div class="wh-hero"><div><div class="eyebrow">CRANEGUARD ERP · ALMACÉN FASE 1</div><h2>${titleText}</h2><p>${copy}</p><div class="wh-status"><span class="wh-chip">Refacciones / productos</span><span class="wh-chip">Capturar una vez</span><span class="wh-chip">Destino técnico trazable</span></div></div><div>${badge('FASE 1','blue')}</div></div>`;
}
function whScope(){
  return `<div class="wh-scope-note"><b>Alcance:</b> refacciones y productos comerciales. Herramientas, EPP, resguardos, préstamos, NFC, kits por técnico y calibraciones quedan fuera de esta fase.</div>`;
}
function whCard(label,value,sub='',color='blue'){
  return `<div class="wh-card ${color}"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
}
function whError(e){
  const msg=e?.message || String(e);
  toast(msg);
  console.error('[CraneGuard Almacén]',e);
  const box=document.getElementById('whActionMessage');
  if(box){box.textContent=msg;box.className='wh-action-message error';}
}
function whActionMessage(msg,type='ok'){
  let box=document.getElementById('whActionMessage');
  if(!box){box=document.createElement('div');box.id='whActionMessage';const view=document.getElementById('view');if(view)view.prepend(box);}
  if(box){box.textContent=msg;box.className='wh-action-message '+type;}
}
function whBusy(btnId,b,label='Procesando…'){
  const el=document.getElementById(btnId);if(!el)return;
  if(b){el.dataset.oldText=el.textContent;el.disabled=true;el.textContent=label;}
  else{el.disabled=false;el.textContent=el.dataset.oldText||el.textContent;}
}

async function warehousePhase1Dashboard(){
  title('Almacén · Fase 1','Catálogo, existencias, reservas, compras, recepciones y trazabilidad de refacciones.');
  try{
    const d=(await api('/api/warehouse/dashboard')).dashboard;
    $('view').innerHTML = whHero('Centro de control de refacciones','Qué tenemos, qué está reservado, qué falta comprar, qué viene en tránsito y qué ya está listo para instalar.') +
      `<div class="wh-grid">${[
        ['Productos',d.total_products,'Catálogo','blue'],['Con existencia',d.with_stock,'Existencia física > 0','green'],['Sin existencia',d.without_stock,'Requieren atención','red'],['Bajo mínimo',d.low_stock,'Alerta de reposición','yellow'],
        ['Productos en compra',d.products_in_purchase,'Respaldados por OC','purple'],['En tránsito',d.in_transit,'OC confirmadas','orange'],['Unidades reservadas',whFmt(d.reserved_units),'Destino identificado','blue'],['Unidades disponibles',whFmt(d.available_units),'Físico − reservado','green'],
        ['Listo para instalar',d.ready_install,'Reservas activas','green'],['Recepciones pendientes',d.pending_receipts,'OC abiertas','yellow'],['REQ pendientes OC',d.pending_requisitions,'Compras','orange'],['OC prometida vencida',d.overdue_po,'Seguimiento proveedor','red']
      ].map(x=>whCard(...x)).join('')}</div>` +
      panel('Flujo principal','Todo conserva el origen y el destino.',`<div class="wh-flow">${['Alta refacción','Existencia','Hallazgo / venta','Disponibilidad','Reserva / REQ','OC proveedor','Recepción','Entrega / instalación','Reporte / cierre'].map(x=>`<span>${x}</span>`).join('')}</div>`) + whScope();
  }catch(e){ $('view').innerHTML = panel('Almacén Fase 1','No fue posible cargar el módulo.',`<div class="wh-alert">${whEsc(e.message)}</div>`); }
}

async function warehouseCatalog(q=''){
  title('Catálogo de refacciones','Alta, ficha técnica, stock y compatibilidad.');
  try{
    const data=await api('/api/warehouse/products'+(q?'?q='+encodeURIComponent(q):''));
    const canEdit=['warehouse','admin'].includes(S.role);
    const rows=data.products.map(p=>{
      const av=Number(p.available_stock||0), state=av<=0?'red':av<=Number(p.stock_min||0)?'yellow':'green';
      return `<div class="wh-product">
        <div class="wh-photo">${whEsc((p.brand||'CG').slice(0,2).toUpperCase())}</div>
        <div><b>${whEsc(p.name)}</b><small>${whEsc(p.cg_code)} · P/N ${whEsc(p.part_number||'—')} · ${whEsc(p.brand||'Sin marca')}</small></div>
        <div class="hide-mobile"><small>Ubicación</small><b>${whEsc([p.warehouse_name,p.zone,p.rack,p.level_name,p.position_name].filter(Boolean).join(' / ')||'Sin ubicación')}</b></div>
        <div class="hide-mid"><small>Compatibilidad</small><b>${whEsc(p.compatible_models||'Pendiente')}</b></div>
        <div class="hide-mobile"><div class="stock-numbers"><span class="stock-pill">Físico ${whFmt(p.physical_stock)}</span><span class="stock-pill">Reservado ${whFmt(p.reserved_stock)}</span><span class="stock-pill">Disponible ${whFmt(av)}</span><span class="stock-pill">Compra ${whFmt(p.in_purchase)}</span></div>${badge(av<=0?'Sin stock':av<=Number(p.stock_min||0)?'Bajo mínimo':'Disponible',state)}</div>
        <div><button class="btn sm" onclick="warehouseProductDetail('${p.id}')">Abrir</button></div>
      </div>`;
    }).join('') || '<div class="empty">Sin resultados.</div>';
    $('view').innerHTML = whHero('Catálogo de refacciones','Búsqueda por código, P/N, nombre, marca, fabricante, categoría, aplicación, modelo o equipo compatible.') +
      `<div class="wh-search"><input id="whSearchInput" value="${whEsc(q)}" placeholder="Buscar P/N, nombre, marca, modelo, equipo compatible…" onkeydown="if(event.key==='Enter')warehouseCatalog(this.value)"><button class="btn primary" onclick="warehouseCatalog(val('whSearchInput'))">Buscar</button></div>` +
      (canEdit?`<div style="margin-bottom:12px"><button class="btn primary" onclick="warehouseNewProduct()">+ Nueva refacción</button> <button class="btn" onclick="go('warehouseImport')">Importar inventario</button></div>`:'') + rows;
  }catch(e){ whError(e); }
}

async function warehouseProductDetail(id){
  try{
    const p=(await api('/api/warehouse/products')).products.find(x=>x.id===id);
    if(!p) return toast('Producto no encontrado');
    title(p.name,p.cg_code+' · '+(p.part_number||'Sin P/N'));
    const commercial=['tech_resp','tech_comp'].includes(S.role)
      ? '<div class="wh-tech-safe">Vista técnica: costos, precios, márgenes y proveedor están ocultos.</div>'
      : `<div class="wh-form-section"><h4>Comercial</h4><div class="form-grid three"><label>Último costo<input value="${p.last_cost??0}" readonly></label><label>Costo promedio<input value="${p.avg_cost??0}" readonly></label><label>Moneda<input value="${whEsc(p.currency||'MXN')}" readonly></label><label>Precio base<input value="${p.base_price??0}" readonly></label><label>Proveedor habitual<input value="${whEsc(p.habitual_supplier||'')}" readonly></label><label>Lead time<input value="${p.lead_time_days||0} días" readonly></label></div></div>`;
    $('view').innerHTML = whHero(p.name,'Ficha técnica y operativa de la refacción.') + `<div class="grid two"><div>
      <div class="wh-form-section"><h4>Identificación</h4><div class="form-grid three"><label>ID CraneGuard<input value="${p.cg_code}" readonly></label><label>Código MKR<input value="${whEsc(p.internal_code||'')}" readonly></label><label>N.º parte<input value="${whEsc(p.part_number||'')}" readonly></label><label>Marca<input value="${whEsc(p.brand||'')}" readonly></label><label>Fabricante<input value="${whEsc(p.manufacturer||'')}" readonly></label><label>Categoría<input value="${whEsc(p.category||'')}" readonly></label></div></div>
      <div class="wh-form-section"><h4>Técnico</h4><div class="form-grid"><label>Aplicación<input value="${whEsc(p.application||'')}" readonly></label><label>Sistema / subsistema<input value="${whEsc([p.system_name,p.subsystem].filter(Boolean).join(' / '))}" readonly></label><label class="full">Equipos / modelos compatibles<textarea readonly>${whEsc(p.compatible_models||'')}</textarea></label><label>Medidas críticas<input value="${whEsc(p.critical_measures||'')}" readonly></label><label>Posición despiece<input value="${whEsc(p.exploded_position||'')}" readonly></label><label class="full">Notas de compatibilidad<textarea readonly>${whEsc(p.compatibility_notes||'')}</textarea></label></div></div>${commercial}
      </div><div>${panel('Inventario','Disponible = existencia física − reservado.',`<div class="wh-grid" style="grid-template-columns:repeat(2,1fr)">${whCard('Físico',whFmt(p.physical_stock),'Presente','blue')}${whCard('Reservado',whFmt(p.reserved_stock),'Apartado','yellow')}${whCard('Disponible',whFmt(p.available_stock),'Utilizable','green')}${whCard('En compra',whFmt(p.in_purchase),'Aún no disponible','purple')}</div><div class="form-grid"><label>Almacén<input value="${whEsc(p.warehouse_name||'')}" readonly></label><label>Ubicación<input value="${whEsc([p.zone,p.rack,p.level_name,p.position_name].filter(Boolean).join(' / '))}" readonly></label><label>Stock mínimo<input value="${p.stock_min}" readonly></label><label>Stock máximo<input value="${p.stock_max}" readonly></label></div>`)}
      ${['warehouse','admin','sales','sales_manager','engineering'].includes(S.role)?`<button class="btn primary" onclick="warehouseQuickReserve('${p.id}')">Reservar</button> `:''}<button class="btn" onclick="warehouseKardex('${p.id}')">Ver Kardex</button></div></div>`;
  }catch(e){ whError(e); }
}

function warehouseNewProduct(pref={}){
  title('Nueva refacción','Alta individual con prevención de duplicados.');
  $('view').innerHTML = whHero('Alta individual de refacción','CraneGuard genera el ID PRD-CG automáticamente y crea movimiento de Inventario inicial cuando capturas existencia.') +
  `<div class="wh-form-section"><h4>Identificación</h4><div class="form-grid three"><label>Código interno MKR<input id="wpInternal" value="${whEsc(pref.internal_code||'')}"></label><label>N.º parte<input id="wpPart" value="${whEsc(pref.part_number||'')}"></label><label>Nombre corto<input id="wpName" value="${whEsc(pref.name||'')}"></label><label class="full">Descripción técnica<textarea id="wpDesc">${whEsc(pref.description||'')}</textarea></label><label>Marca<input id="wpBrand"></label><label>Fabricante<input id="wpMaker"></label><label>Categoría<input id="wpCat" value="${whEsc(pref.category||'')}"></label><label>Subcategoría<input id="wpSubcat"></label><label>Unidad<input id="wpUnit" value="PZA"></label></div></div>
   <div class="wh-form-section"><h4>Almacén</h4><div class="form-grid three"><label>Almacén<input id="wpWh" value="Principal"></label><label>Zona<input id="wpZone"></label><label>Rack<input id="wpRack"></label><label>Nivel<input id="wpLevel"></label><label>Posición<input id="wpPos"></label><label>Existencia inicial<input id="wpInitial" type="number" min="0" value="${pref.initial_stock||0}"></label><label>Stock mínimo<input id="wpMin" type="number" value="0"></label><label>Stock máximo<input id="wpMax" type="number" value="0"></label></div></div>
   <div class="wh-form-section"><h4>Técnico / compatibilidad</h4><div class="form-grid"><label>Aplicación<input id="wpApp" value="${whEsc(pref.application||'')}"></label><label>Sistema<input id="wpSystem"></label><label>Subsistema<input id="wpSubsystem"></label><label>Modelos compatibles<input id="wpModels" value="${whEsc(pref.compatible_models||'')}"></label><label>Medidas críticas<input id="wpMeasures"></label><label>Posición en despiece<input id="wpExploded"></label><label class="full">Observaciones de compatibilidad<textarea id="wpCompat">${whEsc(pref.compatibility_notes||'')}</textarea></label><label>Documento / manual<input id="wpDoc"></label></div></div>
   <div class="wh-form-section"><h4>Comercial</h4><div class="form-grid three"><label>Último costo<input id="wpCost" type="number" value="0"></label><label>Moneda<select id="wpCurrency"><option>MXN</option><option>USD</option></select></label><label>Precio base<input id="wpPrice" type="number" value="0"></label><label>Proveedor habitual<input id="wpSupplier"></label><label>Tiempo entrega (días)<input id="wpLead" type="number" value="0"></label></div></div>
   <button class="btn primary" onclick="createWarehouseProduct(false)">Guardar refacción</button>`;
}
async function createWarehouseProduct(force=false){
  const body={internal_code:val('wpInternal'),part_number:val('wpPart'),name:val('wpName'),description:val('wpDesc'),brand:val('wpBrand'),manufacturer:val('wpMaker'),category:val('wpCat'),subcategory:val('wpSubcat'),unit:val('wpUnit'),warehouse_name:val('wpWh'),zone:val('wpZone'),rack:val('wpRack'),level_name:val('wpLevel'),position_name:val('wpPos'),initial_stock:Number(val('wpInitial')||0),stock_min:Number(val('wpMin')||0),stock_max:Number(val('wpMax')||0),application:val('wpApp'),system_name:val('wpSystem'),subsystem:val('wpSubsystem'),compatible_models:val('wpModels'),critical_measures:val('wpMeasures'),exploded_position:val('wpExploded'),compatibility_notes:val('wpCompat'),document_ref:val('wpDoc'),last_cost:Number(val('wpCost')||0),currency:val('wpCurrency'),base_price:Number(val('wpPrice')||0),habitual_supplier:val('wpSupplier'),lead_time_days:Number(val('wpLead')||0),force};
  try{ const d=await api('/api/warehouse/products',{method:'POST',body}); toast(d.product.cg_code+' creada'); warehouseCatalog(); }
  catch(e){ if(e.status===409 && e.message.includes('POSIBLE')){ if(confirm(`Posible producto existente: ${e.existing?.name||''} (${e.existing?.cg_code||''}). ¿Continuar de todos modos?`)) return createWarehouseProduct(true); } whError(e); }
}
async function warehouseQuickReserve(productId){
  const qty=Number(prompt('Cantidad a reservar','1')); if(!qty) return;
  const asset=prompt('Equipo destino','Grúa #8'), finding=prompt('Hallazgo origen','H-2026-0125'), client=prompt('Cliente','Soluciones en Carrocería');
  try{ const d=await api(`/api/warehouse/products/${productId}/reserve`,{method:'POST',body:{quantity:qty,client,asset,finding}}); toast('Reserva '+d.reservation.reservation_code+' creada'); warehouseReservations(); }catch(e){whError(e)}
}

async function warehouseStock(){
  title('Existencias','Existencia física, reservado, disponible y en compra.');
  try{ const ps=(await api('/api/warehouse/products')).products; $('view').innerHTML=whHero('Existencias y disponibilidad','El material En compra nunca se suma a Disponible hasta que exista recepción física.')+panel('Inventario','No se permite cambiar cantidad sin movimiento asociado.',table(['Código','P/N','Refacción','Físico','Reservado','Disponible','En compra','Mínimo','Ubicación'],ps.map(p=>`<tr><td>${p.cg_code}</td><td>${whEsc(p.part_number||'—')}</td><td>${whEsc(p.name)}</td><td>${whFmt(p.physical_stock)}</td><td>${whFmt(p.reserved_stock)}</td><td>${badge(whFmt(p.available_stock),p.available_stock<=0?'red':p.available_stock<=p.stock_min?'yellow':'green')}</td><td>${whFmt(p.in_purchase)}</td><td>${whFmt(p.stock_min)}</td><td>${whEsc([p.warehouse_name,p.zone,p.rack,p.position_name].filter(Boolean).join(' / '))}</td></tr>`)))+whScope(); }catch(e){whError(e)}
}
async function warehouseReservations(){
  title('Reservas','Apartado por cliente, grúa, hallazgo, Pedido CraneGuard, OS o proyecto.');
  try{ const rs=(await api('/api/warehouse/reservations')).reservations; $('view').innerHTML=whHero('Reservas con destino técnico','Una pieza reservada no puede asignarse a otro trabajo sin liberar o reasignar la reserva.')+panel('Reservas','Destino y autorización trazables.',table(['Reserva','Refacción','Cant.','Cliente','Equipo','Hallazgo','Pedido CG','OS','Estado'],rs.map(r=>`<tr><td>${r.reservation_code}</td><td>${whEsc(r.name)}<br><small>${whEsc(r.part_number||'')}</small></td><td>${whFmt(r.quantity)}</td><td>${whEsc(r.client||'—')}</td><td>${whEsc(r.asset||'—')}</td><td>${whEsc(r.finding||'—')}</td><td>${whEsc(r.crane_order||'—')}</td><td>${whEsc(r.service_order||'—')}</td><td>${badge(r.status,r.status==='Activa'?'green':'gray')}</td></tr>`))); }catch(e){whError(e)}
}

async function warehouseRequisitions(){
  title('Requisiciones de compra','Necesidades sin disponibilidad; origen en hallazgo, Pedido CG, OS, venta, proyecto o stock mínimo.');
  try{
    const [rq,ps]=await Promise.all([api('/api/warehouse/requisitions'),api('/api/warehouse/products')]);
    const can=['warehouse','purchasing','admin','engineering','sales','sales_manager'].includes(S.role);
    const hasProducts=Array.isArray(ps.products)&&ps.products.length>0;
    const create = can ? panel('Nueva requisición','Selecciona una refacción real del catálogo y captura el destino.',
      hasProducts ? `<div id="whActionMessage" class="wh-action-message"></div><div class="form-grid three"><label>Origen<select id="wrqOrigin"><option>Hallazgo</option><option>Pedido CraneGuard</option><option>Venta directa</option><option>OS</option><option>Proyecto</option><option>Stock mínimo</option></select></label><label>Referencia<input id="wrqRef" placeholder="Ej. H-2026-0125 / PED-CG / OS"></label><label>Producto<select id="wrqProduct"><option value="">Selecciona una refacción…</option>${ps.products.map(p=>`<option value="${p.id}">${p.cg_code} · ${whEsc(p.name)} · disp. ${whFmt(p.available_stock)}</option>`).join('')}</select></label><label>Requerida<input id="wrqQty" type="number" min="0.001" step="0.001" value="1"></label><label>Cliente<input id="wrqClient" placeholder="Cliente destino"></label><label>Equipo<input id="wrqAsset" placeholder="Equipo / grúa"></label><label>Hallazgo<input id="wrqFinding" placeholder="Hallazgo relacionado"></label></div><button id="btnCreateWarehouseReq" type="button" class="btn primary" onclick="createWarehouseReq()">Generar REQ-CG</button>` : `<div class="wh-alert"><b>No hay refacciones en el catálogo.</b><br>Primero crea o importa una refacción para poder generar una requisición.</div><button type="button" class="btn primary" onclick="go('warehouseCatalog')">Ir al catálogo</button>`) : '';
    const list=panel('Requisiciones','Una requisición puede terminar en varias OC proveedor.',rq.requisitions?.length?table(['REQ','Origen','Destino','Estado','Partidas'],rq.requisitions.map(r=>`<tr><td>${r.req_code}</td><td>${whEsc([r.origin_type,r.origin_ref].filter(Boolean).join(' · '))}</td><td>${whEsc([r.client,r.asset,r.finding].filter(Boolean).join(' · '))}</td><td>${badge(r.status,r.status==='En compra'?'blue':r.status==='Compra parcial'?'yellow':'orange')}</td><td>${(r.lines||[]).map(l=>`${whEsc(l.product)}: req ${whFmt(l.required)}, comprar ${whFmt(l.requested)}, OC ${whFmt(l.ordered)}`).join('<br>')}</td></tr>`)):'<div class="empty">Aún no hay requisiciones registradas.</div>');
    $('view').innerHTML=whHero('Requisiciones REQ-CG','Comprar = requerido − disponible. La compra se controla por cantidad y puede ser parcial.')+create+list;
  }catch(e){whError(e)}
}
async function createWarehouseReq(){
  const product=val('wrqProduct'), qty=Number(val('wrqQty')||0);
  if(!product){whActionMessage('Selecciona una refacción del catálogo.','error');return toast('Selecciona una refacción del catálogo.');}
  if(!(qty>0)){whActionMessage('La cantidad requerida debe ser mayor a cero.','error');return toast('Captura una cantidad válida.');}
  whBusy('btnCreateWarehouseReq',true,'Generando REQ-CG…');
  try{
    whActionMessage('Enviando requisición al servidor…','info');
    const d=await api('/api/warehouse/requisitions',{method:'POST',body:{origin_type:val('wrqOrigin'),origin_ref:val('wrqRef'),client:val('wrqClient'),asset:val('wrqAsset'),finding:val('wrqFinding'),lines:[{product_id:product,required_qty:qty}]}});
    whActionMessage((d.requisition?.req_code||'REQ-CG')+' creada correctamente.','ok');
    toast((d.requisition?.req_code||'REQ-CG')+' creada');
    setTimeout(()=>warehouseRequisitions(),500);
  }catch(e){whError(e)}finally{whBusy('btnCreateWarehouseReq',false)}
}

async function warehousePurchaseOrders(){
  title('OC proveedor','Referencia oficial del ERP administrativo + documento PDF.');
  try{
    const [pos,rqs]=await Promise.all([api('/api/warehouse/purchase-orders'),api('/api/warehouse/requisitions')]);
    const can=['purchasing','admin'].includes(S.role), pending=[];
    rqs.requisitions.forEach(r=>(r.lines||[]).forEach(l=>{ const left=Math.max(Number(l.requested)-Number(l.ordered),0); if(left>0) pending.push({...l,req:r.req_code,requisition_id:r.id,left}); }));
    const create=can&&pending.length ? panel('Registrar OC proveedor','Puede cubrir una parte de una requisición.',`<div class="form-grid three"><label>OC ERP<input id="wpoNumber" placeholder="Número de OC ERP"></label><label>Proveedor<input id="wpoSupplier" placeholder="Proveedor"></label><label>Moneda<select id="wpoCurrency"><option>MXN</option><option>USD</option></select></label><label>Fecha prometida<input id="wpoPromised" type="date"></label><label>Partida pendiente<select id="wpoLine">${pending.map(x=>`<option value="${x.line_id}" data-product="${x.product_id}" data-req="${x.requisition_id}">${x.req} · ${whEsc(x.product)} · pendiente ${whFmt(x.left)}</option>`).join('')}</select></label><label>Cantidad ordenar<input id="wpoQty" type="number" value="1"></label></div><button class="btn primary" onclick="createWarehousePO()">Registrar OC</button>`) : '';
    const rows=pos.purchase_orders.map(po=>{
      const doc=po.document_name ? `<button class="btn sm" onclick="window.open('/api/warehouse/purchase-orders/${po.id}/document','_blank')">Ver OC</button>` : (can?`<input class="wh-file" type="file" accept="application/pdf" id="poFile_${po.id}"><button class="btn sm" onclick="uploadWarehousePO('${po.id}')">Adjuntar PDF</button>`:'Pendiente');
      return `<tr><td>${whEsc(po.po_number)}</td><td>${whEsc(po.supplier)}</td><td>${String(po.order_date||'').slice(0,10)}</td><td>${String(po.promised_date||'—').slice(0,10)}</td><td>${badge(po.status,po.status==='Recibida'?'green':po.status.includes('parcial')?'yellow':po.document_name?'blue':'orange')}</td><td>${(po.lines||[]).map(l=>`${whEsc(l.product)} ${whFmt(l.received)}/${whFmt(l.ordered)}`).join('<br>')}</td><td>${doc}</td></tr>`;
    });
    $('view').innerHTML=whHero('Órdenes de compra de proveedor','La OC oficial sigue generándose en el ERP administrativo; CraneGuard registra folio, cantidades, evidencia y fechas.')+create+panel('OC proveedor','Documento pendiente vs OC confirmada.',table(['OC','Proveedor','Fecha','Prometida','Estado','Partidas','Documento'],rows));
  }catch(e){whError(e)}
}
async function createWarehousePO(){
  const sel=$('wpoLine')?.selectedOptions?.[0]; if(!sel) return toast('No hay partida seleccionada');
  try{ const d=await api('/api/warehouse/purchase-orders',{method:'POST',body:{po_number:val('wpoNumber'),supplier:val('wpoSupplier'),currency:val('wpoCurrency'),promised_date:val('wpoPromised')||null,requisition_id:sel.dataset.req,lines:[{requisition_line_id:sel.value,product_id:sel.dataset.product,ordered_qty:Number(val('wpoQty')||0)}]}}); toast(d.purchase_order.po_number+' registrada'); warehousePurchaseOrders(); }catch(e){whError(e)}
}
async function uploadWarehousePO(id){
  const f=$('poFile_'+id)?.files?.[0]; if(!f) return toast('Selecciona el PDF');
  if(typeof LOCAL_PREVIEW!=='undefined' && LOCAL_PREVIEW) return toast('La carga binaria del PDF se valida al ejecutar el backend de Render.');
  const fd=new FormData(); fd.append('file',f);
  try{ const res=await fetch('/api/warehouse/purchase-orders/'+id+'/document',{method:'POST',credentials:'same-origin',body:fd}); const d=await res.json(); if(!res.ok) throw new Error(d.error||'Error al cargar'); toast('OC adjuntada'); warehousePurchaseOrders(); }catch(e){whError(e)}
}

async function warehouseReceipts(){
  title('Recepciones','Recepción física total o parcial; genera REC-CG y actualiza stock.');
  try{
    const [pos,rec]=await Promise.all([api('/api/warehouse/purchase-orders'),api('/api/warehouse/receipts')]);
    const open=[]; pos.purchase_orders.filter(p=>p.status!=='Recibida').forEach(p=>(p.lines||[]).filter(l=>Number(l.pending)>0).forEach(l=>open.push({...l,po_id:p.id,po_number:p.po_number})));
    const can=['warehouse','admin'].includes(S.role);
    const create=can&&open.length ? panel('+ Recibir producto','Soporta recepción parcial.',`<div class="form-grid three"><label>OC / partida<select id="wrecLine">${open.map(x=>`<option value="${x.line_id}" data-po="${x.po_id}">${x.po_number} · ${whEsc(x.product)} · pendiente ${whFmt(x.pending)}</option>`).join('')}</select></label><label>Recibida hoy<input id="wrecQty" type="number" value="1"></label><label>Estado físico<select id="wrecStatus"><option>Conforme</option><option>Dañado</option><option>Pendiente revisión</option></select></label><label>Ubicación<input id="wrecLoc" value="A-01-01"></label><label>Fecha<input id="wrecDate" type="date"></label><label>Evidencia / nota<input id="wrecEvidence"></label></div><button class="btn primary" onclick="createWarehouseReceipt()">+ Recibir producto</button>`) : '';
    const rows=rec.receipts.map(r=>`<tr><td>${r.receipt_code}</td><td>${r.po_number}</td><td>${String(r.receipt_date||'').slice(0,10)}</td><td>${badge(r.physical_status,r.physical_status==='Conforme'?'green':'yellow')}</td><td>${whEsc(r.location||'—')}</td><td>${(r.lines||[]).map(l=>`${whEsc(l.product)} · hoy ${whFmt(l.received)} · acum ${whFmt(l.accumulated)} · pend ${whFmt(l.pending)}`).join('<br>')}</td></tr>`);
    $('view').innerHTML=whHero('Entradas / recepciones','En compra se convierte en existencia solo cuando Almacén registra la recepción física. Si el material tiene destino, CraneGuard lo reserva automáticamente.')+create+panel('Recepciones registradas','La OC permanece abierta mientras exista cantidad pendiente.',table(['REC','OC','Fecha','Estado físico','Ubicación','Partidas'],rows));
  }catch(e){whError(e)}
}
async function createWarehouseReceipt(){
  const opt=$('wrecLine')?.selectedOptions?.[0]; if(!opt) return toast('No hay partida pendiente');
  try{ const d=await api('/api/warehouse/receipts',{method:'POST',body:{po_id:opt.dataset.po,receipt_date:val('wrecDate')||null,physical_status:val('wrecStatus'),location:val('wrecLoc'),evidence_note:val('wrecEvidence'),lines:[{po_line_id:opt.value,received_today:Number(val('wrecQty')||0)}]}}); toast(d.receipt.receipt_code+' · '+d.status); warehouseReceipts(); }catch(e){whError(e)}
}

async function warehouseTransit(){
  title('Material en tránsito','Compras no recibidas y fecha prometida.');
  try{ const pos=(await api('/api/warehouse/purchase-orders')).purchase_orders.filter(x=>x.status!=='Recibida'); const rows=pos.map(p=>{const pending=(p.lines||[]).reduce((a,l)=>a+Number(l.pending||0),0),late=p.promised_date&&new Date(p.promised_date)<new Date();return `<tr><td>${p.po_number}</td><td>${whEsc(p.supplier)}</td><td>${String(p.promised_date||'—').slice(0,10)}</td><td>${badge(late?'Promesa vencida':p.status,late?'red':p.status.includes('parcial')?'yellow':'blue')}</td><td>${whFmt(pending)}</td></tr>`}); $('view').innerHTML=whHero('Material en tránsito / pendiente','Seguimiento de OC proveedor y fechas prometidas.')+panel('OC abiertas','Las fechas vencidas requieren seguimiento.',table(['OC','Proveedor','Prometida','Estado','Pendiente'],rows)); }catch(e){whError(e)}
}
async function warehouseReadyInstall(){
  title('Material listo para instalar','Vista para Coordinación: piezas reservadas con destino concreto.');
  try{ const it=(await api('/api/warehouse/ready-install')).items; const rows=it.map(r=>`<tr><td>${whEsc(r.client||'—')}</td><td>${whEsc(r.asset||'—')}</td><td>${whEsc(r.name)}</td><td>${whEsc(r.part_number||'—')}</td><td>${whFmt(r.quantity)}</td><td>${whEsc(r.finding||'—')}</td><td>${whEsc(r.crane_order||'—')}</td><td>${whEsc(r.service_order||'—')}</td><td>${badge('Listo','green')}</td></tr>`); $('view').innerHTML=whHero('Material listo para instalar','Esta vista permite programar la instalación por cliente, equipo, hallazgo, Pedido CraneGuard y OS.')+panel('Piezas destinadas','Al crear una nueva OS, CraneGuard debe alertar si este equipo tiene material pendiente de instalación.',table(['Cliente','Equipo','Refacción','P/N','Cantidad','Hallazgo','Pedido CG','OS','Estado'],rows)); }catch(e){whError(e)}
}
async function warehouseKardex(productId=''){
  title('Kardex / movimientos','Fecha, usuario, movimiento, cantidad, saldo, documento origen y destino.');
  try{ const [m,ps]=await Promise.all([api('/api/warehouse/kardex'+(productId?'?product_id='+encodeURIComponent(productId):'')),api('/api/warehouse/products')]); const rows=m.movements.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('es-MX')}</td><td>${x.cg_code}<br>${whEsc(x.name)}</td><td>${badge(x.movement_type,x.movement_type.includes('Recepción')?'green':x.movement_type.includes('Reserva')?'yellow':Number(x.quantity)<0?'orange':'blue')}</td><td>${Number(x.quantity)>0?'+':''}${whFmt(x.quantity)}</td><td>${whFmt(x.balance_after)}</td><td>${whEsc([x.reference_type,x.reference_id].filter(Boolean).join(' · ')||'—')}</td><td>${whEsc(x.destination||'—')}</td><td>${whEsc(x.user_name||'Sistema')}</td></tr>`); $('view').innerHTML=whHero('Kardex auditable','No existen cambios directos de cantidad: toda variación debe tener un movimiento asociado.')+`<div class="toolbar"><label>Producto<select onchange="warehouseKardex(this.value)"><option value="">Todos</option>${ps.products.map(p=>`<option value="${p.id}" ${p.id===productId?'selected':''}>${p.cg_code} · ${whEsc(p.name)}</option>`).join('')}</select></label></div>`+panel('Movimientos','Inventario inicial, recepción, reserva, salida, instalación y ajustes.',table(['Fecha','Producto','Movimiento','Cantidad','Saldo físico','Referencia','Destino','Usuario'],rows)); }catch(e){whError(e)}
}

function warehouseImport(){
  title('Importar inventario','Carga masiva desde Excel con revisión previa.');
  $('view').innerHTML=whHero('Importación masiva desde Excel','Mapeo: Código → Código interno · Producto → Nombre/Descripción · Categoría · Marca · Unidad · Ubicación · Cantidad → Existencia inicial · Costo.')+panel('Archivo Excel','CraneGuard no importa silenciosamente registros problemáticos.',`<div class="wh-alert">Antes de importar se muestran correctos, incompletos, duplicados, sin descripción y sin categoría.</div><input id="whImportFile" type="file" accept=".xlsx,.xls"><div style="margin-top:10px"><button class="btn primary" onclick="reviewWarehouseImport(false)">Revisar archivo</button> <button class="btn" onclick="reviewWarehouseImport(true)">Importar válidos</button></div><div id="whImportResult" style="margin-top:12px"></div>`)+whScope();
}
async function reviewWarehouseImport(commit){
  const f=$('whImportFile')?.files?.[0]; if(!f) return toast('Selecciona un Excel');
  if(typeof LOCAL_PREVIEW!=='undefined'&&LOCAL_PREVIEW){ $('whImportResult').innerHTML='<div class="wh-alert">El parser real de Excel corre en el backend Node.js de Render. El preview local conserva esta pantalla.</div>'; return; }
  const fd=new FormData(); fd.append('file',f); fd.append('commit',commit?'true':'false');
  try{ const res=await fetch('/api/warehouse/import',{method:'POST',credentials:'same-origin',body:fd}); const d=await res.json(); if(!res.ok) throw new Error(d.error||'Error'); const rows=d.review.slice(0,100).map(x=>`<tr class="wh-review-row ${x.issues.length?'problem':'ok'}"><td>${x.row}</td><td>${whEsc(x.internal_code||'—')}</td><td>${whEsc(x.name||'—')}</td><td>${whEsc(x.category||'—')}</td><td>${whFmt(x.initial_stock)}</td><td>${x.issues.length?badge(x.issues.join(', '),'red'):badge('Correcto','green')}</td></tr>`); $('whImportResult').innerHTML=`<div class="wh-ok">Total ${d.review.length} · Correctos ${d.review.filter(x=>!x.issues.length).length} · Problemáticos ${d.review.filter(x=>x.issues.length).length}${commit?' · Importados '+d.imported:''}</div>`+table(['Fila','Código','Producto','Categoría','Cantidad','Resultado'],rows); }catch(e){whError(e)}
}

async function warehouseFindingSearch(){
  title('PartGuard / StockGuard','Sugerencias de refacción con validación humana obligatoria.');
  try{ const [data,valid]=await Promise.all([api('/api/warehouse/products?q='+encodeURIComponent('pestillo')),api('/api/warehouse/compatibility?finding=H-2026-0125')]); const candidates=data.products.map(p=>`<div class="wh-product"><div class="wh-photo">AI</div><div><b>${whEsc(p.name)}</b><small>${p.cg_code} · P/N ${whEsc(p.part_number||'—')} · ${whEsc(p.compatible_models||'compatibilidad pendiente')}</small></div><div class="hide-mobile"><div class="stock-numbers"><span class="stock-pill">Exist. ${whFmt(p.physical_stock)}</span><span class="stock-pill">Reserv. ${whFmt(p.reserved_stock)}</span><span class="stock-pill">Disp. ${whFmt(p.available_stock)}</span></div></div><div class="hide-mid">${badge('Pendiente validación','yellow')}</div><div></div><div><button class="btn sm primary" onclick="validateWarehouseCompatibility('${p.id}','Confirmada')">Confirmar</button> <button class="btn sm" onclick="validateWarehouseCompatibility('${p.id}','Descartada')">Descartar</button></div></div>`).join(''); const validations=valid.validations.map(v=>`<tr><td>${whEsc(v.name)} · ${whEsc(v.part_number||'')}</td><td>${badge(v.decision,v.decision==='Confirmada'?'green':v.decision==='Descartada'?'red':'yellow')}</td><td>${whEsc(v.validator||'')}</td><td>${new Date(v.created_at).toLocaleString('es-MX')}</td></tr>`); $('view').innerHTML=whHero('Hallazgo H-2026-0125 · “Retén de gancho.”','PartGuard consulta catálogo, equipo, fotografías y documentación. StockGuard muestra disponibilidad. La IA no confirma compatibilidad ni reserva automáticamente.')+`<div class="wh-alert"><b>Validación humana:</b> Ingeniería debe confirmar compatibilidad, descartar o pedir más información. La disponibilidad no modifica el diagnóstico técnico.</div>`+panel('Candidatos de catálogo','Sugerencias; no son una confirmación técnica.',candidates||'<div class="empty">Sin candidatos.</div>')+panel('Validaciones registradas','Quién decidió y cuándo.',table(['Refacción','Decisión','Validador','Fecha'],validations))+`<button class="btn" onclick="warehouseNewProduct({name:'Refacción H-2026-0125',application:'Grúa #8',compatible_models:'Grúa #8',compatibility_notes:'Creada desde hallazgo H-2026-0125'})">+ Crear refacción desde hallazgo</button>`; }catch(e){whError(e)}
}
async function validateWarehouseCompatibility(product_id,decision){ try{ await api('/api/warehouse/compatibility',{method:'POST',body:{product_id,finding:'H-2026-0125',asset:'Grúa #8',decision}}); toast('Validación registrada: '+decision); warehouseFindingSearch(); }catch(e){whError(e)} }

function warehousePhase1Demo(){
  title('Caso de prueba · Almacén Fase 1','Flujo obligatorio de refacciones.');
  const steps=[['1','Crear DEMO-001','Pestillo · existencia 2'],['2','Hallazgo','H-2026-0125 · Retén de gancho'],['3','PartGuard','Sugiere DEMO-001'],['4','StockGuard','2 físico · 0 reservado · 2 disponible'],['5','Ingeniería','Confirma compatibilidad'],['6','Reserva','1 para Grúa #8'],['7','KIT-FR-DEMO','Existencia 0'],['8','REQ-CG','Necesidad de compra'],['9','OC proveedor','OC-009258 + PDF'],['10','Recepción','1/1 y destino reconocido'],['11','Nueva OS','Alerta material pendiente'],['12','Instalación','Parcial permitida'],['13','Reporte','Cierre con trazabilidad']];
  $('view').innerHTML=whHero('Caso DEMO-001 · Grúa #8','Recorre el caso exigido para validar catálogo, PartGuard, StockGuard, reserva, compra, recepción e instalación.')+`<div class="wh-demo">${steps.map(x=>`<div class="wh-demo-step"><strong>${x[0]}. ${x[1]}</strong>${x[2]}</div>`).join('')}</div><div style="margin-top:14px" class="wh-flow">${['Hallazgo','Refacción','Stock','Reserva / Compra','OC proveedor','Recepción','OS','Instalación','Reporte'].map(x=>`<span>${x}</span>`).join('')}</div><div style="margin-top:14px"><button class="btn primary" onclick="go('warehouseFindingSearch')">Probar PartGuard / StockGuard</button> <button class="btn" onclick="go('warehouseCatalog')">Abrir catálogo</button> <button class="btn" onclick="go('warehouseRequisitions')">Abrir compras</button></div>${whScope()}`;
}
