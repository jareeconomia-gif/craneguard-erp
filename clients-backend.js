const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_BLUEPRINT || process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const CLIENTS_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SEQUENCE IF NOT EXISTS erp_client_seq START 1;
CREATE TABLE IF NOT EXISTS erp_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code TEXT NOT NULL UNIQUE DEFAULT ('CLI-' || lpad(nextval('erp_client_seq')::text,5,'0')),
  name TEXT NOT NULL,
  legal_name TEXT,
  rfc TEXT NOT NULL DEFAULT '',
  business TEXT,
  fiscal_regime TEXT,
  fiscal_zip TEXT,
  fiscal_address TEXT,
  cfdi TEXT,
  payment_form TEXT,
  payment_method TEXT,
  currency TEXT NOT NULL DEFAULT 'MXN',
  credit_days INTEGER NOT NULL DEFAULT 0,
  seller TEXT,
  backup TEXT,
  status TEXT NOT NULL DEFAULT 'Activo',
  plants JSONB NOT NULL DEFAULT '[]'::jsonb,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  billing JSONB NOT NULL DEFAULT '[]'::jsonb,
  document_notes TEXT,
  completeness INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_clients_rfc_unique ON erp_clients ((LOWER(rfc))) WHERE rfc <> '';
CREATE INDEX IF NOT EXISTS idx_erp_clients_name ON erp_clients (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_erp_clients_seller ON erp_clients (LOWER(COALESCE(seller,'')));
`;

function text(v){ return String(v ?? '').trim(); }
function integer(v,d=0){ const n=Number(v); return Number.isFinite(n) ? Math.max(0,Math.round(n)) : d; }
function arr(v){ return Array.isArray(v) ? v : []; }
function computeCompleteness(b){
  const fields=[b.name,b.legal_name,b.rfc,b.business,b.fiscal_regime,b.fiscal_zip,b.fiscal_address,b.cfdi,b.payment_form,b.payment_method,b.currency,b.seller];
  let done=fields.filter(v=>text(v)).length;
  if(arr(b.plants).length) done++;
  if(arr(b.contacts).length) done++;
  if(arr(b.billing).length) done++;
  return Math.round((done/15)*100);
}
function view(r){
  return {
    id:r.id,code:r.client_code,name:r.name,legal:r.legal_name||'',rfc:r.rfc||'',business:r.business||'',
    fiscalRegime:r.fiscal_regime||'',fiscalZip:r.fiscal_zip||'',fiscalAddress:r.fiscal_address||'',cfdi:r.cfdi||'',
    paymentForm:r.payment_form||'',paymentMethod:r.payment_method||'',currency:r.currency||'MXN',creditDays:Number(r.credit_days||0),
    seller:r.seller||'',backup:r.backup||'',status:r.status||'Activo',plants:arr(r.plants),contacts:arr(r.contacts),billing:arr(r.billing),
    documentNotes:r.document_notes||'',complete:Number(r.completeness||0),createdAt:r.created_at,updatedAt:r.updated_at
  };
}

async function prepareClientsSchema(){
  await pool.query(CLIENTS_SCHEMA_SQL);
  console.log('CraneGuard: módulo Clientes PostgreSQL verificado.');
}

async function currentUser(req){
  const id=req.session?.user?.id;
  if(!id) return null;
  const {rows}=await pool.query('SELECT id,email,full_name,role,active FROM app_users WHERE id=$1',[id]);
  return rows[0]||null;
}
function allowedWrite(role){ return ['admin','direction','sales_manager','sales','coord'].includes(role); }

function registerRoutes(app){
  if(app.__cgClientsRoutes) return;
  app.__cgClientsRoutes=true;

  app.get('/api/clients', async(req,res,next)=>{try{
    const user=await currentUser(req); if(!user||!user.active) return res.status(401).json({error:'Sesión no válida.'});
    let q='SELECT * FROM erp_clients', vals=[];
    if(user.role==='sales'){ q+=' WHERE LOWER(COALESCE(seller,\'\'))=LOWER($1)'; vals=[user.full_name]; }
    q+=' ORDER BY name';
    const {rows}=await pool.query(q,vals); res.json({clients:rows.map(view)});
  }catch(e){next(e)}});

  app.get('/api/clients/:id', async(req,res,next)=>{try{
    const user=await currentUser(req); if(!user||!user.active) return res.status(401).json({error:'Sesión no válida.'});
    const {rows}=await pool.query('SELECT * FROM erp_clients WHERE id=$1',[req.params.id]);
    if(!rows[0]) return res.status(404).json({error:'Cliente no encontrado.'});
    if(user.role==='sales' && text(rows[0].seller).toLowerCase()!==text(user.full_name).toLowerCase()) return res.status(403).json({error:'No tienes acceso a este cliente.'});
    res.json({client:view(rows[0])});
  }catch(e){next(e)}});

  app.post('/api/clients', async(req,res,next)=>{try{
    const user=await currentUser(req); if(!user||!user.active) return res.status(401).json({error:'Sesión no válida.'});
    if(!allowedWrite(user.role)) return res.status(403).json({error:'Tu rol no puede dar de alta clientes.'});
    const b=req.body||{}; const name=text(b.name); if(!name) return res.status(400).json({error:'El nombre comercial del cliente es obligatorio.'});
    const legal=text(b.legal)||text(b.legal_name)||name, rfc=text(b.rfc).toUpperCase();
    const plants=arr(b.plants), contacts=arr(b.contacts);
    let billing=arr(b.billing);
    if(!billing.length && (legal||rfc)) billing=[{name:legal,rfc,zip:text(b.fiscalZip||b.fiscal_zip),default:true}];
    const seller=text(b.seller)||(user.role==='sales'?user.full_name:'');
    const normalized={name,legal_name:legal,rfc,business:text(b.business),fiscal_regime:text(b.fiscalRegime||b.fiscal_regime),fiscal_zip:text(b.fiscalZip||b.fiscal_zip),fiscal_address:text(b.fiscalAddress||b.fiscal_address),cfdi:text(b.cfdi),payment_form:text(b.paymentForm||b.payment_form),payment_method:text(b.paymentMethod||b.payment_method),currency:text(b.currency)||'MXN',seller,plants,contacts,billing};
    const completeness=computeCompleteness(normalized);
    const {rows}=await pool.query(`INSERT INTO erp_clients(name,legal_name,rfc,business,fiscal_regime,fiscal_zip,fiscal_address,cfdi,payment_form,payment_method,currency,credit_days,seller,backup,status,plants,contacts,billing,document_notes,completeness,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19,$20,$21,$21) RETURNING *`,
      [name,legal,rfc,normalized.business,normalized.fiscal_regime,normalized.fiscal_zip,normalized.fiscal_address,normalized.cfdi,normalized.payment_form,normalized.payment_method,normalized.currency,integer(b.creditDays||b.credit_days),seller,text(b.backup),text(b.status)||'Activo',JSON.stringify(plants),JSON.stringify(contacts),JSON.stringify(billing),text(b.documentNotes||b.document_notes),completeness,user.id]);
    res.status(201).json({client:view(rows[0])});
  }catch(e){ if(e.code==='23505') return res.status(409).json({error:'Ya existe un cliente con ese RFC.'}); next(e); }});

  app.patch('/api/clients/:id', async(req,res,next)=>{try{
    const user=await currentUser(req); if(!user||!user.active) return res.status(401).json({error:'Sesión no válida.'});
    if(!allowedWrite(user.role)) return res.status(403).json({error:'Tu rol no puede editar clientes.'});
    const cur=(await pool.query('SELECT * FROM erp_clients WHERE id=$1',[req.params.id])).rows[0]; if(!cur) return res.status(404).json({error:'Cliente no encontrado.'});
    const b=req.body||{}; const merged={...view(cur),...b};
    const name=text(merged.name); if(!name) return res.status(400).json({error:'El nombre comercial es obligatorio.'});
    const legal=text(merged.legal||merged.legal_name)||name, rfc=text(merged.rfc).toUpperCase(), plants=arr(merged.plants), contacts=arr(merged.contacts), billing=arr(merged.billing);
    const normalized={name,legal_name:legal,rfc,business:text(merged.business),fiscal_regime:text(merged.fiscalRegime||merged.fiscal_regime),fiscal_zip:text(merged.fiscalZip||merged.fiscal_zip),fiscal_address:text(merged.fiscalAddress||merged.fiscal_address),cfdi:text(merged.cfdi),payment_form:text(merged.paymentForm||merged.payment_form),payment_method:text(merged.paymentMethod||merged.payment_method),currency:text(merged.currency)||'MXN',seller:text(merged.seller),plants,contacts,billing};
    const completeness=computeCompleteness(normalized);
    const {rows}=await pool.query(`UPDATE erp_clients SET name=$1,legal_name=$2,rfc=$3,business=$4,fiscal_regime=$5,fiscal_zip=$6,fiscal_address=$7,cfdi=$8,payment_form=$9,payment_method=$10,currency=$11,credit_days=$12,seller=$13,backup=$14,status=$15,plants=$16::jsonb,contacts=$17::jsonb,billing=$18::jsonb,document_notes=$19,completeness=$20,updated_by=$21,updated_at=NOW() WHERE id=$22 RETURNING *`,
      [name,legal,rfc,normalized.business,normalized.fiscal_regime,normalized.fiscal_zip,normalized.fiscal_address,normalized.cfdi,normalized.payment_form,normalized.payment_method,normalized.currency,integer(merged.creditDays||merged.credit_days),normalized.seller,text(merged.backup),text(merged.status)||'Activo',JSON.stringify(plants),JSON.stringify(contacts),JSON.stringify(billing),text(merged.documentNotes||merged.document_notes),completeness,user.id,req.params.id]);
    res.json({client:view(rows[0])});
  }catch(e){ if(e.code==='23505') return res.status(409).json({error:'Ya existe otro cliente con ese RFC.'}); next(e); }});
}

function installClientsApiHook(){
  if(express.application.__cgClientsListenHook) return;
  express.application.__cgClientsListenHook=true;
  const original=express.application.listen;
  express.application.listen=function(...args){ registerRoutes(this); return original.apply(this,args); };
}

module.exports={prepareClientsSchema,installClientsApiHook};
