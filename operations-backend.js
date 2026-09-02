const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_BLUEPRINT || process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const OPERATIONS_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE IF NOT EXISTS op_request_seq START 1;
CREATE SEQUENCE IF NOT EXISTS op_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS op_finding_seq START 1;
CREATE SEQUENCE IF NOT EXISTS op_change_seq START 1;

CREATE TABLE IF NOT EXISTS op_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code TEXT NOT NULL UNIQUE DEFAULT ('SOL-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('op_request_seq')::text,5,'0')),
  client_id UUID REFERENCES erp_clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  plant_name TEXT,
  contact_name TEXT,
  asset_reference TEXT,
  need_type TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'Media',
  requested_date DATE,
  commercial_conditions TEXT,
  access_conditions TEXT,
  safety_requirements TEXT,
  initial_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Solicitud recibida',
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_requests_client ON op_service_requests(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_op_requests_creator ON op_service_requests(created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS op_service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE DEFAULT ('OS-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('op_order_seq')::text,5,'0')),
  request_id UUID REFERENCES op_service_requests(id) ON DELETE SET NULL,
  client_id UUID REFERENCES erp_clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  plant_name TEXT,
  contact_name TEXT,
  asset_reference TEXT,
  service_type TEXT NOT NULL,
  capture_mode TEXT NOT NULL DEFAULT 'Híbrido',
  priority TEXT NOT NULL DEFAULT 'Media',
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  responsible_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pendiente de programación',
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  closure_notes TEXT,
  closed_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_orders_schedule ON op_service_orders(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_op_orders_resp ON op_service_orders(responsible_user_id, status);

CREATE TABLE IF NOT EXISTS op_order_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES op_service_orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  team_role TEXT NOT NULL DEFAULT 'Acompañante',
  assigned_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id,user_id)
);

CREATE TABLE IF NOT EXISTS op_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES op_service_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  collaborators JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Pendiente',
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  due_at TIMESTAMPTZ,
  capture_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_notes TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_activities_order ON op_activities(order_id,status);
CREATE INDEX IF NOT EXISTS idx_op_activities_owner ON op_activities(owner_user_id,status);

CREATE TABLE IF NOT EXISTS op_service_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES op_service_orders(id) ON DELETE CASCADE,
  arrival_at TIMESTAMPTZ,
  availability TEXT,
  safety_status TEXT,
  client_resources TEXT,
  contact_name TEXT,
  client_wait_minutes INTEGER NOT NULL DEFAULT 0,
  preparation_minutes INTEGER NOT NULL DEFAULT 0,
  technical_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  opened_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS op_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_code TEXT NOT NULL UNIQUE DEFAULT ('H-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('op_finding_seq')::text,5,'0')),
  order_id UUID NOT NULL REFERENCES op_service_orders(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES op_activities(id) ON DELETE SET NULL,
  asset_reference TEXT,
  component TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'GRIS',
  condition_text TEXT NOT NULL,
  consequence TEXT,
  recommended_action TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Pendiente de validación',
  owner_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  engineering_validated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  engineering_validated_at TIMESTAMPTZ,
  validation_notes TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_findings_order ON op_findings(order_id,severity,status);

CREATE TABLE IF NOT EXISTS op_field_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_code TEXT NOT NULL UNIQUE DEFAULT ('CC-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('op_change_seq')::text,5,'0')),
  order_id UUID NOT NULL REFERENCES op_service_orders(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'Moderado',
  before_text TEXT NOT NULL,
  after_text TEXT NOT NULL,
  impact TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'Pendiente de aprobación',
  version_no INTEGER NOT NULL DEFAULT 1,
  requested_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_changes_order ON op_field_changes(order_id,status);

CREATE TABLE IF NOT EXISTS op_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_op_audit_entity ON op_audit(entity_type,entity_id,created_at DESC);
`;

const txt = v => String(v ?? '').trim();
const num = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
const arr = v => Array.isArray(v) ? v : [];
const WRITE_REQUEST = ['sales','sales_manager','admin'];
const COORD = ['coord','admin'];
const TECH = ['tech_resp','tech_comp','coord','engineering','admin'];
const ENGINEERING = ['engineering','admin'];

async function prepareOperationsSchema(){
  await pool.query(OPERATIONS_SCHEMA_SQL);
  console.log('CraneGuard: núcleo operativo PostgreSQL verificado.');
}

async function currentUser(req){
  const id=req.session?.user?.id;
  if(!id) return null;
  const {rows}=await pool.query('SELECT id,email,full_name,role,active FROM app_users WHERE id=$1',[id]);
  return rows[0]||null;
}
function deny(res,msg='No tienes permisos para esta acción.'){ return res.status(403).json({error:msg}); }
function auth(res){ return res.status(401).json({error:'Sesión no válida.'}); }
async function audit(actor,entityType,entityId,action,detail={}){
  await pool.query('INSERT INTO op_audit(actor_user_id,entity_type,entity_id,action,detail) VALUES($1,$2,$3,$4,$5::jsonb)',[actor||null,entityType,entityId||null,action,JSON.stringify(detail||{})]);
}
async function userCanSeeOrder(user,orderId){
  if(!user) return false;
  if(['admin','coord','direction','sales_manager','engineering'].includes(user.role)) return true;
  if(['tech_resp','tech_comp'].includes(user.role)){
    const q=await pool.query(`SELECT 1 FROM op_service_orders o LEFT JOIN op_order_team t ON t.order_id=o.id AND t.user_id=$1 WHERE o.id=$2 AND (o.responsible_user_id=$1 OR t.user_id=$1) LIMIT 1`,[user.id,orderId]);
    return !!q.rowCount;
  }
  if(user.role==='sales'){
    const q=await pool.query(`SELECT 1 FROM op_service_orders o JOIN op_service_requests r ON r.id=o.request_id WHERE o.id=$1 AND r.created_by=$2 LIMIT 1`,[orderId,user.id]);
    return !!q.rowCount;
  }
  return false;
}
async function userCanWorkOrder(user,orderId){
  if(['admin','coord'].includes(user.role)) return true;
  if(['tech_resp','tech_comp','engineering'].includes(user.role)) return userCanSeeOrder(user,orderId);
  return false;
}
function mapOrderRow(r){
  return {...r,progress:Number(r.progress||0),team_count:Number(r.team_count||0),activity_count:Number(r.activity_count||0),finding_count:Number(r.finding_count||0),pending_change_count:Number(r.pending_change_count||0)};
}

async function requestRows(user){
  if(['tech_resp','tech_comp','warehouse','purchasing','client'].includes(user.role)) return [];
  let where='',vals=[];
  if(user.role==='sales'){where='WHERE r.created_by=$1';vals=[user.id];}
  const {rows}=await pool.query(`SELECT r.*,u.full_name created_by_name,(SELECT o.order_code FROM op_service_orders o WHERE o.request_id=r.id ORDER BY o.created_at DESC LIMIT 1) order_code FROM op_service_requests r LEFT JOIN app_users u ON u.id=r.created_by ${where} ORDER BY r.created_at DESC LIMIT 500`,vals);
  return rows;
}
async function orderRows(user){
  let where='',vals=[];
  if(['tech_resp','tech_comp'].includes(user.role)){
    vals=[user.id];where='WHERE (o.responsible_user_id=$1 OR EXISTS(SELECT 1 FROM op_order_team t0 WHERE t0.order_id=o.id AND t0.user_id=$1))';
  } else if(user.role==='sales'){
    vals=[user.id];where='WHERE EXISTS(SELECT 1 FROM op_service_requests r0 WHERE r0.id=o.request_id AND r0.created_by=$1)';
  } else if(['warehouse','purchasing','client'].includes(user.role)) return [];
  const {rows}=await pool.query(`SELECT o.*,u.full_name responsible_name,
    (SELECT COUNT(*) FROM op_order_team t WHERE t.order_id=o.id)::int team_count,
    (SELECT COUNT(*) FROM op_activities a WHERE a.order_id=o.id)::int activity_count,
    (SELECT COUNT(*) FROM op_findings f WHERE f.order_id=o.id)::int finding_count,
    (SELECT COUNT(*) FROM op_field_changes c WHERE c.order_id=o.id AND c.status='Pendiente de aprobación')::int pending_change_count
    FROM op_service_orders o LEFT JOIN app_users u ON u.id=o.responsible_user_id ${where} ORDER BY COALESCE(o.scheduled_start,o.created_at) DESC LIMIT 500`,vals);
  return rows.map(mapOrderRow);
}
async function orderDetail(orderId){
  const order=(await pool.query(`SELECT o.*,u.full_name responsible_name,r.request_code FROM op_service_orders o LEFT JOIN app_users u ON u.id=o.responsible_user_id LEFT JOIN op_service_requests r ON r.id=o.request_id WHERE o.id=$1`,[orderId])).rows[0];
  if(!order) return null;
  const [team,activities,opening,findings,changes,audits]=await Promise.all([
    pool.query(`SELECT t.*,u.full_name,u.email,u.role FROM op_order_team t JOIN app_users u ON u.id=t.user_id WHERE t.order_id=$1 ORDER BY CASE WHEN t.team_role='Responsable' THEN 0 ELSE 1 END,u.full_name`,[orderId]),
    pool.query(`SELECT a.*,u.full_name owner_name FROM op_activities a LEFT JOIN app_users u ON u.id=a.owner_user_id WHERE a.order_id=$1 ORDER BY a.created_at`,[orderId]),
    pool.query('SELECT * FROM op_service_openings WHERE order_id=$1',[orderId]),
    pool.query(`SELECT f.*,u.full_name owner_name,v.full_name validator_name FROM op_findings f LEFT JOIN app_users u ON u.id=f.owner_user_id LEFT JOIN app_users v ON v.id=f.engineering_validated_by WHERE f.order_id=$1 ORDER BY f.created_at DESC`,[orderId]),
    pool.query(`SELECT c.*,u.full_name requester_name,d.full_name decider_name FROM op_field_changes c LEFT JOIN app_users u ON u.id=c.requested_by LEFT JOIN app_users d ON d.id=c.decided_by WHERE c.order_id=$1 ORDER BY c.created_at DESC`,[orderId]),
    pool.query(`SELECT a.*,u.full_name actor_name FROM op_audit a LEFT JOIN app_users u ON u.id=a.actor_user_id WHERE a.entity_type='order' AND a.entity_id=$1 ORDER BY a.created_at DESC LIMIT 100`,[orderId])
  ]);
  return {order:mapOrderRow(order),team:team.rows,activities:activities.rows.map(x=>({...x,progress:Number(x.progress||0)})),opening:opening.rows[0]||null,findings:findings.rows,changes:changes.rows,audit:audits.rows};
}

function installOperationsApiHook(){
  if(express.application.__cgOperationsListenHook) return;
  express.application.__cgOperationsListenHook=true;
  const original=express.application.listen;
  express.application.listen=function(...args){ registerRoutes(this); return original.apply(this,args); };
}

function registerRoutes(app){
  if(app.__cgOperationsRoutes) return;
  app.__cgOperationsRoutes=true;

  app.get('/api/operations/bootstrap',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);
    const [requests,orders,users]=await Promise.all([
      requestRows(user),orderRows(user),
      pool.query(`SELECT id,email,full_name,role FROM app_users WHERE active=TRUE AND role IN ('coord','tech_resp','tech_comp','engineering','admin') ORDER BY full_name`)
    ]);
    res.json({requests,orders,users:users.rows,permissions:{createRequest:WRITE_REQUEST.includes(user.role),convertRequest:COORD.includes(user.role),assignTeam:COORD.includes(user.role),work:TECH.includes(user.role),validateFinding:ENGINEERING.includes(user.role)}});
  }catch(e){next(e)}});

  app.get('/api/operations/calendar',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);
    const rows=await orderRows(user);
    res.json({events:rows.filter(x=>x.scheduled_start).map(x=>({id:x.id,order_code:x.order_code,client_name:x.client_name,plant_name:x.plant_name,asset_reference:x.asset_reference,service_type:x.service_type,status:x.status,scheduled_start:x.scheduled_start,scheduled_end:x.scheduled_end,responsible_name:x.responsible_name,priority:x.priority}))});
  }catch(e){next(e)}});

  app.post('/api/operations/requests',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!WRITE_REQUEST.includes(user.role))return deny(res);
    const b=req.body||{},clientName=txt(b.client_name),need=txt(b.need_type);
    if(!clientName||!need)return res.status(400).json({error:'Cliente y necesidad son obligatorios.'});
    const {rows}=await pool.query(`INSERT INTO op_service_requests(client_id,client_name,plant_name,contact_name,asset_reference,need_type,description,priority,requested_date,commercial_conditions,access_conditions,safety_requirements,initial_evidence,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$13::jsonb,$14,$14) RETURNING *`,
      [b.client_id||null,clientName,txt(b.plant_name)||null,txt(b.contact_name)||null,txt(b.asset_reference)||null,need,txt(b.description)||null,txt(b.priority)||'Media',b.requested_date||null,txt(b.commercial_conditions)||null,txt(b.access_conditions)||null,txt(b.safety_requirements)||null,JSON.stringify(arr(b.initial_evidence)),user.id]);
    await audit(user.id,'request',rows[0].id,'Solicitud creada',{request_code:rows[0].request_code,client:clientName});
    res.status(201).json({request:rows[0]});
  }catch(e){next(e)}});

  app.post('/api/operations/requests/:id/convert',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!COORD.includes(user.role))return deny(res);
    const c=await pool.connect();try{
      await c.query('BEGIN');
      const r=(await c.query('SELECT * FROM op_service_requests WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!r){await c.query('ROLLBACK');return res.status(404).json({error:'Solicitud no encontrada.'});}
      const exists=(await c.query('SELECT * FROM op_service_orders WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1',[r.id])).rows[0];if(exists){await c.query('ROLLBACK');return res.status(409).json({error:'La solicitud ya fue convertida a '+exists.order_code+'.'});}
      const b=req.body||{},type=txt(b.service_type)||'Revisión técnica',mode=txt(b.capture_mode)||'Híbrido';
      const o=(await c.query(`INSERT INTO op_service_orders(request_id,client_id,client_name,plant_name,contact_name,asset_reference,service_type,capture_mode,priority,scheduled_start,scheduled_end,responsible_user_id,status,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz,$12,$13,$14,$14) RETURNING *`,
        [r.id,r.client_id,r.client_name,r.plant_name,r.contact_name,r.asset_reference,type,mode,r.priority,b.scheduled_start||null,b.scheduled_end||null,b.responsible_user_id||null,b.scheduled_start?'Programada':'Pendiente de programación',user.id])).rows[0];
      if(b.responsible_user_id) await c.query(`INSERT INTO op_order_team(order_id,user_id,team_role,assigned_by) VALUES($1,$2,'Responsable',$3) ON CONFLICT(order_id,user_id) DO UPDATE SET team_role='Responsable',assigned_by=$3,assigned_at=NOW()`,[o.id,b.responsible_user_id,user.id]);
      await c.query("UPDATE op_service_requests SET status='Convertida a orden',updated_by=$1,updated_at=NOW() WHERE id=$2",[user.id,r.id]);
      await c.query('COMMIT');
      await audit(user.id,'request',r.id,'Solicitud convertida',{request_code:r.request_code,order_code:o.order_code});
      await audit(user.id,'order',o.id,'Orden creada',{order_code:o.order_code,from_request:r.request_code});
      res.status(201).json({order:o});
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  }catch(e){next(e)}});

  app.get('/api/operations/orders/:id',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!(await userCanSeeOrder(user,req.params.id)))return deny(res,'No tienes acceso a esta orden.');
    const detail=await orderDetail(req.params.id);if(!detail)return res.status(404).json({error:'Orden no encontrada.'});res.json(detail);
  }catch(e){next(e)}});

  app.patch('/api/operations/orders/:id',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!COORD.includes(user.role))return deny(res);
    const b=req.body||{};
    const cur=(await pool.query('SELECT * FROM op_service_orders WHERE id=$1',[req.params.id])).rows[0];if(!cur)return res.status(404).json({error:'Orden no encontrada.'});
    const values={service_type:txt(b.service_type)||cur.service_type,capture_mode:txt(b.capture_mode)||cur.capture_mode,priority:txt(b.priority)||cur.priority,scheduled_start:b.scheduled_start===undefined?cur.scheduled_start:(b.scheduled_start||null),scheduled_end:b.scheduled_end===undefined?cur.scheduled_end:(b.scheduled_end||null),responsible_user_id:b.responsible_user_id===undefined?cur.responsible_user_id:(b.responsible_user_id||null),status:txt(b.status)||cur.status};
    const {rows}=await pool.query(`UPDATE op_service_orders SET service_type=$1,capture_mode=$2,priority=$3,scheduled_start=$4::timestamptz,scheduled_end=$5::timestamptz,responsible_user_id=$6,status=$7,updated_by=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,[values.service_type,values.capture_mode,values.priority,values.scheduled_start,values.scheduled_end,values.responsible_user_id,values.status,user.id,req.params.id]);
    if(values.responsible_user_id) await pool.query(`INSERT INTO op_order_team(order_id,user_id,team_role,assigned_by) VALUES($1,$2,'Responsable',$3) ON CONFLICT(order_id,user_id) DO UPDATE SET team_role='Responsable',assigned_by=$3,assigned_at=NOW()`,[req.params.id,values.responsible_user_id,user.id]);
    await audit(user.id,'order',req.params.id,'Orden actualizada',{order_code:rows[0].order_code});res.json({order:rows[0]});
  }catch(e){next(e)}});

  app.post('/api/operations/orders/:id/team',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!COORD.includes(user.role))return deny(res);
    const b=req.body||{};if(!b.user_id)return res.status(400).json({error:'Selecciona un usuario.'});
    const role=txt(b.team_role)||'Acompañante';
    await pool.query(`INSERT INTO op_order_team(order_id,user_id,team_role,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(order_id,user_id) DO UPDATE SET team_role=$3,assigned_by=$4,assigned_at=NOW()`,[req.params.id,b.user_id,role,user.id]);
    if(role==='Responsable') await pool.query('UPDATE op_service_orders SET responsible_user_id=$1,updated_by=$2,updated_at=NOW() WHERE id=$3',[b.user_id,user.id,req.params.id]);
    await audit(user.id,'order',req.params.id,'Equipo asignado',{user_id:b.user_id,team_role:role});res.status(201).json({ok:true});
  }catch(e){next(e)}});

  app.delete('/api/operations/orders/:id/team/:userId',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!COORD.includes(user.role))return deny(res);
    await pool.query('DELETE FROM op_order_team WHERE order_id=$1 AND user_id=$2',[req.params.id,req.params.userId]);
    await audit(user.id,'order',req.params.id,'Integrante retirado',{user_id:req.params.userId});res.json({ok:true});
  }catch(e){next(e)}});

  app.post('/api/operations/orders/:id/activities',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!['coord','tech_resp','admin'].includes(user.role))return deny(res);
    if(!(await userCanWorkOrder(user,req.params.id)))return deny(res,'No estás asignado a esta orden.');
    const b=req.body||{},name=txt(b.name);if(!name)return res.status(400).json({error:'El nombre de la actividad es obligatorio.'});
    const {rows}=await pool.query(`INSERT INTO op_activities(order_id,name,description,owner_user_id,collaborators,status,progress,required,due_at,created_by,updated_by) VALUES($1,$2,$3,$4,$5::jsonb,'Pendiente',0,$6,$7::timestamptz,$8,$8) RETURNING *`,[req.params.id,name,txt(b.description)||null,b.owner_user_id||user.id,JSON.stringify(arr(b.collaborators)),b.required!==false,b.due_at||null,user.id]);
    await audit(user.id,'order',req.params.id,'Actividad creada',{activity_id:rows[0].id,name});res.status(201).json({activity:rows[0]});
  }catch(e){next(e)}});

  app.patch('/api/operations/activities/:id',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);
    const a=(await pool.query('SELECT * FROM op_activities WHERE id=$1',[req.params.id])).rows[0];if(!a)return res.status(404).json({error:'Actividad no encontrada.'});
    if(!(await userCanWorkOrder(user,a.order_id)))return deny(res);
    if(user.role==='tech_comp' && String(a.owner_user_id)!==String(user.id) && !arr(a.collaborators).includes(user.id))return deny(res,'Solo puedes capturar actividades asignadas a ti.');
    const b=req.body||{},status=txt(b.status)||a.status,progress=Math.max(0,Math.min(100,Math.round(num(b.progress,a.progress))));
    const capture=b.capture_data===undefined?a.capture_data:(b.capture_data||{}),evidence=b.evidence_notes===undefined?a.evidence_notes:txt(b.evidence_notes);
    const {rows}=await pool.query(`UPDATE op_activities SET status=$1,progress=$2,capture_data=$3::jsonb,evidence_notes=$4,updated_by=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[status,progress,JSON.stringify(capture),evidence||null,user.id,a.id]);
    const avg=(await pool.query('SELECT COALESCE(ROUND(AVG(progress)),0)::int p FROM op_activities WHERE order_id=$1',[a.order_id])).rows[0].p;
    await pool.query('UPDATE op_service_orders SET progress=$1,status=CASE WHEN $1>0 AND status IN (\'Pendiente de programación\',\'Programada\') THEN \'En ejecución\' ELSE status END,updated_by=$2,updated_at=NOW() WHERE id=$3',[avg,user.id,a.order_id]);
    await audit(user.id,'order',a.order_id,'Actividad actualizada',{activity_id:a.id,status,progress});res.json({activity:rows[0],order_progress:avg});
  }catch(e){next(e)}});

  app.put('/api/operations/orders/:id/opening',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!(await userCanWorkOrder(user,req.params.id)))return deny(res);
    const b=req.body||{};
    const {rows}=await pool.query(`INSERT INTO op_service_openings(order_id,arrival_at,availability,safety_status,client_resources,contact_name,client_wait_minutes,preparation_minutes,technical_minutes,notes,evidence,opened_by,updated_by)
      VALUES($1,$2::timestamptz,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$12)
      ON CONFLICT(order_id) DO UPDATE SET arrival_at=EXCLUDED.arrival_at,availability=EXCLUDED.availability,safety_status=EXCLUDED.safety_status,client_resources=EXCLUDED.client_resources,contact_name=EXCLUDED.contact_name,client_wait_minutes=EXCLUDED.client_wait_minutes,preparation_minutes=EXCLUDED.preparation_minutes,technical_minutes=EXCLUDED.technical_minutes,notes=EXCLUDED.notes,evidence=EXCLUDED.evidence,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,
      [req.params.id,b.arrival_at||null,txt(b.availability)||null,txt(b.safety_status)||null,txt(b.client_resources)||null,txt(b.contact_name)||null,Math.max(0,Math.round(num(b.client_wait_minutes))),Math.max(0,Math.round(num(b.preparation_minutes))),Math.max(0,Math.round(num(b.technical_minutes))),txt(b.notes)||null,JSON.stringify(arr(b.evidence)),user.id]);
    await pool.query("UPDATE op_service_orders SET status=CASE WHEN status IN ('Pendiente de programación','Programada') THEN 'En ejecución' ELSE status END,updated_by=$1,updated_at=NOW() WHERE id=$2",[user.id,req.params.id]);
    await audit(user.id,'order',req.params.id,'Apertura de servicio guardada',{availability:rows[0].availability,safety_status:rows[0].safety_status});res.json({opening:rows[0]});
  }catch(e){next(e)}});

  app.get('/api/operations/findings',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(['warehouse','purchasing','client'].includes(user.role))return res.json({findings:[]});
    let where='',vals=[];
    if(['tech_resp','tech_comp'].includes(user.role)){where='WHERE EXISTS(SELECT 1 FROM op_service_orders o WHERE o.id=f.order_id AND (o.responsible_user_id=$1 OR EXISTS(SELECT 1 FROM op_order_team t WHERE t.order_id=o.id AND t.user_id=$1)))';vals=[user.id];}
    else if(user.role==='sales'){where='WHERE EXISTS(SELECT 1 FROM op_service_orders o JOIN op_service_requests r ON r.id=o.request_id WHERE o.id=f.order_id AND r.created_by=$1)';vals=[user.id];}
    const {rows}=await pool.query(`SELECT f.*,o.order_code,o.client_name,u.full_name owner_name,v.full_name validator_name FROM op_findings f JOIN op_service_orders o ON o.id=f.order_id LEFT JOIN app_users u ON u.id=f.owner_user_id LEFT JOIN app_users v ON v.id=f.engineering_validated_by ${where} ORDER BY f.created_at DESC LIMIT 500`,vals);res.json({findings:rows});
  }catch(e){next(e)}});

  app.post('/api/operations/orders/:id/findings',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!TECH.includes(user.role))return deny(res);if(!(await userCanWorkOrder(user,req.params.id)))return deny(res);
    const b=req.body||{},component=txt(b.component),condition=txt(b.condition_text),severity=txt(b.severity)||'GRIS';if(!component||!condition)return res.status(400).json({error:'Componente y condición son obligatorios.'});
    const {rows}=await pool.query(`INSERT INTO op_findings(order_id,activity_id,asset_reference,component,severity,condition_text,consequence,recommended_action,evidence,status,owner_user_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$11) RETURNING *`,[req.params.id,b.activity_id||null,txt(b.asset_reference)||null,component,severity,condition,txt(b.consequence)||null,txt(b.recommended_action)||null,JSON.stringify(arr(b.evidence)),severity==='ROJO'?'Pendiente de validación crítica':'Pendiente de validación',b.owner_user_id||user.id]);
    await audit(user.id,'order',req.params.id,'Hallazgo creado',{finding_code:rows[0].finding_code,severity});res.status(201).json({finding:rows[0]});
  }catch(e){next(e)}});

  app.post('/api/operations/findings/:id/validate',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!ENGINEERING.includes(user.role))return deny(res,'Solo Ingeniería/Supervisión puede validar hallazgos.');
    const b=req.body||{},f=(await pool.query('SELECT * FROM op_findings WHERE id=$1',[req.params.id])).rows[0];if(!f)return res.status(404).json({error:'Hallazgo no encontrado.'});
    const {rows}=await pool.query(`UPDATE op_findings SET status=$1,engineering_validated_by=$2,engineering_validated_at=NOW(),validation_notes=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,[txt(b.status)||'Validado',user.id,txt(b.validation_notes)||null,f.id]);
    await audit(user.id,'order',f.order_id,'Hallazgo validado',{finding_code:f.finding_code,status:rows[0].status});res.json({finding:rows[0]});
  }catch(e){next(e)}});

  app.get('/api/operations/changes',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(['warehouse','purchasing','client'].includes(user.role))return res.json({changes:[]});
    let where='',vals=[];
    if(['tech_resp','tech_comp'].includes(user.role)){where='WHERE EXISTS(SELECT 1 FROM op_service_orders o WHERE o.id=c.order_id AND (o.responsible_user_id=$1 OR EXISTS(SELECT 1 FROM op_order_team t WHERE t.order_id=o.id AND t.user_id=$1)))';vals=[user.id];}
    const {rows}=await pool.query(`SELECT c.*,o.order_code,o.client_name,u.full_name requester_name,d.full_name decider_name FROM op_field_changes c JOIN op_service_orders o ON o.id=c.order_id LEFT JOIN app_users u ON u.id=c.requested_by LEFT JOIN app_users d ON d.id=c.decided_by ${where} ORDER BY c.created_at DESC LIMIT 500`,vals);res.json({changes:rows});
  }catch(e){next(e)}});

  app.post('/api/operations/orders/:id/changes',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!['tech_resp','tech_comp','coord','engineering','admin'].includes(user.role))return deny(res);if(!(await userCanWorkOrder(user,req.params.id)))return deny(res);
    const b=req.body||{},before=txt(b.before_text),after=txt(b.after_text);if(!before||!after)return res.status(400).json({error:'Describe la condición anterior y el cambio solicitado.'});
    const nextV=(await pool.query('SELECT COALESCE(MAX(version_no),0)+1 v FROM op_field_changes WHERE order_id=$1',[req.params.id])).rows[0].v;
    const {rows}=await pool.query(`INSERT INTO op_field_changes(order_id,level,before_text,after_text,impact,evidence,status,version_no,requested_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,'Pendiente de aprobación',$7,$8) RETURNING *`,[req.params.id,txt(b.level)||'Moderado',before,after,txt(b.impact)||null,JSON.stringify(arr(b.evidence)),nextV,user.id]);
    await audit(user.id,'order',req.params.id,'Cambio en campo solicitado',{change_code:rows[0].change_code,version_no:nextV});res.status(201).json({change:rows[0]});
  }catch(e){next(e)}});

  app.post('/api/operations/changes/:id/decision',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!['coord','engineering','admin'].includes(user.role))return deny(res);
    const b=req.body||{},decision=txt(b.status);if(!['Aprobado','Rechazado'].includes(decision))return res.status(400).json({error:'Decisión inválida.'});
    const c=(await pool.query('SELECT * FROM op_field_changes WHERE id=$1',[req.params.id])).rows[0];if(!c)return res.status(404).json({error:'Cambio no encontrado.'});
    const {rows}=await pool.query('UPDATE op_field_changes SET status=$1,decided_by=$2,decided_at=NOW(),decision_notes=$3,updated_at=NOW() WHERE id=$4 RETURNING *',[decision,user.id,txt(b.decision_notes)||null,c.id]);
    await audit(user.id,'order',c.order_id,'Cambio en campo decidido',{change_code:c.change_code,status:decision});res.json({change:rows[0]});
  }catch(e){next(e)}});

  app.post('/api/operations/orders/:id/close',async(req,res,next)=>{try{
    const user=await currentUser(req);if(!user||!user.active)return auth(res);if(!['tech_resp','coord','admin'].includes(user.role))return deny(res,'El acompañante no puede cerrar la orden.');if(!(await userCanSeeOrder(user,req.params.id)))return deny(res);
    const o=(await pool.query('SELECT * FROM op_service_orders WHERE id=$1',[req.params.id])).rows[0];if(!o)return res.status(404).json({error:'Orden no encontrada.'});
    const pending=(await pool.query(`SELECT COUNT(*)::int n FROM op_activities WHERE order_id=$1 AND required=TRUE AND status NOT IN ('Terminada','Aprobada','Cerrada')`,[o.id])).rows[0].n;
    if(pending>0)return res.status(409).json({error:`No se puede cerrar: ${pending} actividad(es) obligatoria(s) siguen pendientes.`});
    const red=(await pool.query(`SELECT COUNT(*)::int n FROM op_findings WHERE order_id=$1 AND severity='ROJO' AND engineering_validated_at IS NULL`,[o.id])).rows[0].n;
    if(red>0)return res.status(409).json({error:`No se puede cerrar: ${red} hallazgo(s) ROJO sin validación de Ingeniería.`});
    const changes=(await pool.query(`SELECT COUNT(*)::int n FROM op_field_changes WHERE order_id=$1 AND status='Pendiente de aprobación'`,[o.id])).rows[0].n;
    if(changes>0)return res.status(409).json({error:`No se puede cerrar: ${changes} cambio(s) en campo están pendientes de decisión.`});
    const notes=txt(req.body?.closure_notes);
    const {rows}=await pool.query(`UPDATE op_service_orders SET status='Cerrada',progress=100,closure_notes=$1,closed_by=$2,closed_at=NOW(),updated_by=$2,updated_at=NOW() WHERE id=$3 RETURNING *`,[notes||null,user.id,o.id]);
    await audit(user.id,'order',o.id,'Orden cerrada',{order_code:o.order_code,closure_notes:notes});res.json({order:rows[0]});
  }catch(e){next(e)}});
}

module.exports={prepareOperationsSchema,installOperationsApiHook};
