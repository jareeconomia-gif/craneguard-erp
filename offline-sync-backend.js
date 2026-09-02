const express=require('express');
const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL_BLUEPRINT||process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false,max:4});
const SQL=`
CREATE TABLE IF NOT EXISTS offline_sync_log(
 id BIGSERIAL PRIMARY KEY,
 offline_id TEXT NOT NULL UNIQUE,
 user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
 original_captured_at TIMESTAMPTZ,
 synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 method TEXT NOT NULL,
 path TEXT NOT NULL,
 http_status INTEGER,
 state TEXT NOT NULL DEFAULT 'Sincronizado',
 detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_offline_sync_user ON offline_sync_log(user_id,synced_at DESC);
`;
async function prepareOfflineSchema(){await pool.query(SQL);console.log('CraneGuard: auditoría offline verificada.');}
function installOfflineAuditHook(){if(express.application.__cgOfflineAuditHook)return;express.application.__cgOfflineAuditHook=true;const prev=express.application.listen;express.application.listen=function(...args){const app=this;if(!app.__cgOfflineAuditMiddleware){app.__cgOfflineAuditMiddleware=true;app.use((req,res,next)=>{const offlineId=req.get('X-CraneGuard-Offline-Id');if(!offlineId)return next();const original=req.get('X-CraneGuard-Original-Time')||null;const userId=req.session?.user?.id||null;res.on('finish',()=>{pool.query(`INSERT INTO offline_sync_log(offline_id,user_id,original_captured_at,method,path,http_status,state,detail) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(offline_id) DO UPDATE SET synced_at=NOW(),http_status=EXCLUDED.http_status,state=EXCLUDED.state,detail=EXCLUDED.detail`,[offlineId,userId,original,req.method,req.path,res.statusCode,res.statusCode>=200&&res.statusCode<300?'Sincronizado':res.statusCode===409?'Conflicto':'Error',JSON.stringify({query:req.query||{}})]).catch(e=>console.error('Offline audit',e))});next()})}return prev.apply(app,args)}}
function registerOfflineRoutes(app){if(app.__cgOfflineRoutes)return;app.__cgOfflineRoutes=true;app.get('/api/offline/audit',async(req,res,next)=>{try{const uid=req.session?.user?.id;if(!uid)return res.status(401).json({error:'Sesión no válida.'});const role=req.session?.user?.role;let q='SELECT * FROM offline_sync_log',v=[];if(role!=='admin'){q+=' WHERE user_id=$1';v=[uid]}q+=' ORDER BY synced_at DESC LIMIT 500';res.json({sync:(await pool.query(q,v)).rows})}catch(e){next(e)}})}
function installOfflineRoutesHook(){if(express.application.__cgOfflineRoutesHook)return;express.application.__cgOfflineRoutesHook=true;const prev=express.application.listen;express.application.listen=function(...args){registerOfflineRoutes(this);return prev.apply(this,args)}}
module.exports={prepareOfflineSchema,installOfflineAuditHook,installOfflineRoutesHook};
