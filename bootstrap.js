const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { prepareClientsSchema, installClientsApiHook } = require('./clients-backend');
const { prepareOperationsSchema, installOperationsApiHook } = require('./operations-backend');
const { prepareEnterpriseSchema, installEnterpriseApiHook } = require('./enterprise-backend');
const { writeEnterprise } = require('./frontend-source-fix');

const blueprintUrl = process.env.DATABASE_URL_BLUEPRINT;
if (blueprintUrl) process.env.DATABASE_URL = blueprintUrl;
if (!process.env.DATABASE_URL) { console.error('CraneGuard: no existe DATABASE_URL.'); process.exit(1); }
function clientConfig(){return{connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false,connectionTimeoutMillis:10000}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForPostgres(){const attempts=Number(process.env.DB_STARTUP_ATTEMPTS||36),delayMs=Number(process.env.DB_STARTUP_DELAY_MS||5000);let lastError;for(let i=1;i<=attempts;i++){const c=new Client(clientConfig());try{await c.connect();await c.query('SELECT 1');await c.end();console.log('CraneGuard: PostgreSQL disponible.');return}catch(e){lastError=e;try{await c.end()}catch{}console.warn(`CraneGuard: esperando PostgreSQL (${i}/${attempts}) · ${e.code||e.message}`);if(i<attempts)await sleep(delayMs)}}throw lastError}
async function tableExists(name){const c=new Client(clientConfig());await c.connect();try{return !!(await c.query('SELECT to_regclass($1) AS t',[`public.${name}`])).rows[0]?.t}finally{await c.end()}}
async function waitForTable(name,attempts=200,delay=100){for(let i=0;i<attempts;i++){if(await tableExists(name))return;await sleep(delay)}throw new Error(`No se creó la tabla requerida ${name} durante el arranque.`)}
async function prepareFoundationSchema(){const c=new Client(clientConfig());await c.connect();try{await c.query(`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('direction','sales','sales_manager','coord','tech_resp','tech_comp','engineering','warehouse','purchasing','client','admin')),
  password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ, password_changed_at TIMESTAMPTZ, created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS auth_audit_log (
 id BIGSERIAL PRIMARY KEY, actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL, target_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
 action TEXT NOT NULL, detail JSONB NOT NULL DEFAULT '{}'::jsonb, ip_address TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_actor ON auth_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_target ON auth_audit_log(target_user_id, created_at DESC);
`);console.log('CraneGuard: esquema base de seguridad verificado.')}finally{await c.end()}}
async function syncFirstAdminFromEnv(){const email=String(process.env.FIRST_ADMIN_EMAIL||'admin@mkr.com.mx').trim().toLowerCase(),password=String(process.env.FIRST_ADMIN_PASSWORD||''),fullName=String(process.env.FIRST_ADMIN_NAME||'Administrador MKR').trim();if(password.length<10){console.warn('CraneGuard: FIRST_ADMIN_PASSWORD no configurada; no se sincronizó el administrador.');return}const c=new Client(clientConfig());await c.connect();try{const hash=await bcrypt.hash(password,12),x=await c.query('SELECT id FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1',[email]);if(x.rowCount)await c.query(`UPDATE app_users SET password_hash=$1,full_name=$2,role='admin',active=TRUE,must_change_password=FALSE,password_changed_at=NOW(),updated_at=NOW() WHERE id=$3`,[hash,fullName,x.rows[0].id]);else await c.query(`INSERT INTO app_users(email,full_name,role,password_hash,active,must_change_password) VALUES($1,$2,'admin',$3,TRUE,FALSE)`,[email,fullName,hash]);console.log('CraneGuard: administrador inicial verificado.')}finally{await c.end()}}
function installFrontendProduction(){const files=['reporting-actions-99.js','clients-production.js','production-scope.js','operations-production.js','offline-production.js','production-branding.js','sw-production.js'];const enterpriseSource=path.join(__dirname,'enterprise-production.js');if(!files.every(f=>fs.existsSync(path.join(__dirname,f)))||!fs.existsSync(enterpriseSource)){console.warn('CraneGuard: faltan archivos del frontend de producción.');return}const publicDir=path.join(__dirname,'public');if(!fs.existsSync(publicDir))fs.mkdirSync(publicDir,{recursive:true});for(const f of files)fs.copyFileSync(path.join(__dirname,f),path.join(publicDir,f));writeEnterprise(path.join(publicDir,'enterprise-production.js'));const targets=[path.join(__dirname,'index.html'),path.join(publicDir,'index.html')],version='11.1.1',names=['reporting-actions-99.js','clients-production.js','production-scope.js','operations-production.js','enterprise-production.js','offline-production.js','production-branding.js'],tags=names.map(n=>`<script src="/${n}?v=${version}"></script>`).join('');for(const file of targets){if(!fs.existsSync(file))continue;let html=fs.readFileSync(file,'utf8');for(const n of [...names,'reporting-publish-fix.js','reporting-actions-98.js','production-clean-100.js']){const escaped=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');html=html.replace(new RegExp(`<script[^>]+${escaped}[^>]*><\\/script>`,'gi'),'')}html=html.replace(/\/reporting-production\.js\?v=[^"']+/g,`/reporting-production.js?v=${version}`);html=html.includes('</body>')?html.replace('</body>',`${tags}</body>`):html+tags;fs.writeFileSync(file,html,'utf8')}console.log(`CraneGuard: frontend integral ${version} instalado.`)}
function installStartupGate(readyPromise){const previous=express.application.listen;express.application.listen=function(...args){const app=this;readyPromise.then(()=>{console.log('CraneGuard: dependencias enterprise listas; abriendo puerto.');previous.apply(app,args)}).catch(e=>{console.error('CraneGuard: no se pudo completar el esquema enterprise:',e);process.exit(1)});return app}}

(async()=>{try{
  await waitForPostgres();
  await prepareFoundationSchema();
  await syncFirstAdminFromEnv();
  await prepareClientsSchema();
  await prepareOperationsSchema();
  installClientsApiHook(); installOperationsApiHook(); installEnterpriseApiHook();
  installFrontendProduction();
  const enterpriseReady=(async()=>{await waitForTable('warehouse_products');await prepareEnterpriseSchema();})();
  installStartupGate(enterpriseReady);
  require('./server.js');
}catch(e){console.error('CraneGuard: no se pudo iniciar:',e);process.exit(1)}})();
