const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { prepareClientsSchema, installClientsApiHook } = require('./clients-backend');
const { prepareOperationsSchema, installOperationsApiHook } = require('./operations-backend');
const { prepareEnterpriseSchema, installEnterpriseApiHook } = require('./enterprise-backend');

const blueprintUrl = process.env.DATABASE_URL_BLUEPRINT;
if (blueprintUrl) {
  process.env.DATABASE_URL = blueprintUrl;
  console.log('CraneGuard: usando DATABASE_URL_BLUEPRINT administrada por Render.');
}
if (!process.env.DATABASE_URL) {
  console.error('CraneGuard: no existe DATABASE_URL ni DATABASE_URL_BLUEPRINT.');
  process.exit(1);
}
function clientConfig(){return{connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false,connectionTimeoutMillis:10000}}
function dbTarget(){try{const u=new URL(process.env.DATABASE_URL);return `${u.hostname}:${u.port||'5432'}/${(u.pathname||'').replace(/^\//,'')}`}catch{return'URL de PostgreSQL inválida'}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForPostgres(){const attempts=Number(process.env.DB_STARTUP_ATTEMPTS||36),delayMs=Number(process.env.DB_STARTUP_DELAY_MS||5000);let lastError;for(let attempt=1;attempt<=attempts;attempt++){const client=new Client(clientConfig());try{await client.connect();await client.query('SELECT 1');await client.end();console.log(`CraneGuard: PostgreSQL disponible en ${dbTarget()}.`);return}catch(error){lastError=error;try{await client.end()}catch{}console.warn(`CraneGuard: PostgreSQL no disponible (${attempt}/${attempts}) · ${dbTarget()} · ${error.code||error.message}`);if(attempt<attempts)await sleep(delayMs)}}throw lastError||new Error('PostgreSQL no estuvo disponible durante el arranque.')}
async function syncFirstAdminFromEnv(){const email=String(process.env.FIRST_ADMIN_EMAIL||'admin@mkr.com.mx').trim().toLowerCase(),password=String(process.env.FIRST_ADMIN_PASSWORD||''),fullName=String(process.env.FIRST_ADMIN_NAME||'Administrador MKR').trim();if(password.length<10){console.warn('CraneGuard: FIRST_ADMIN_PASSWORD no está configurada o tiene menos de 10 caracteres; no se sincronizó el administrador.');return}const client=new Client(clientConfig());await client.connect();try{const tc=await client.query("SELECT to_regclass('public.app_users') AS table_name");if(!tc.rows[0]?.table_name){console.log('CraneGuard: app_users aún no existe; server.js creará el primer administrador.');return}const hash=await bcrypt.hash(password,12),existing=await client.query('SELECT id FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1',[email]);if(existing.rowCount){await client.query(`UPDATE app_users SET password_hash=$1,full_name=COALESCE(NULLIF($2,''),full_name),role='admin',active=TRUE,must_change_password=FALSE,password_changed_at=NOW(),updated_at=NOW() WHERE id=$3`,[hash,fullName,existing.rows[0].id]);console.log(`CraneGuard: contraseña del administrador sincronizada desde FIRST_ADMIN_PASSWORD para ${email}.`)}else{await client.query(`INSERT INTO app_users(email,full_name,role,password_hash,active,must_change_password) VALUES($1,$2,'admin',$3,TRUE,FALSE)`,[email,fullName,hash]);console.log(`CraneGuard: administrador creado desde variables de Render para ${email}.`)}}finally{await client.end()}}

function installFrontendProduction(){
  const files=['reporting-actions-99.js','clients-production.js','production-scope.js','operations-production.js','enterprise-production.js','offline-production.js','production-branding.js','sw-production.js'];
  if(!files.every(f=>fs.existsSync(path.join(__dirname,f)))){console.warn('CraneGuard: faltan archivos del frontend de producción.');return}
  const publicDir=path.join(__dirname,'public');if(!fs.existsSync(publicDir))fs.mkdirSync(publicDir,{recursive:true});
  for(const f of files)fs.copyFileSync(path.join(__dirname,f),path.join(publicDir,f));
  const targets=[path.join(__dirname,'index.html'),path.join(publicDir,'index.html')];
  const version='11.0.0';
  const names=['reporting-actions-99.js','clients-production.js','production-scope.js','operations-production.js','enterprise-production.js','offline-production.js','production-branding.js'];
  const tags=names.map(n=>`<script src="/${n}?v=${version}"></script>`).join('');
  for(const file of targets){if(!fs.existsSync(file))continue;let html=fs.readFileSync(file,'utf8');for(const n of [...names,'reporting-publish-fix.js','reporting-actions-98.js','production-clean-100.js']){const re=new RegExp(`<script[^>]+${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[^>]*><\\/script>`,'gi');html=html.replace(re,'')}html=html.replace(/\/reporting-production\.js\?v=[^"']+/g,`/reporting-production.js?v=${version}`);html=html.includes('</body>')?html.replace('</body>',`${tags}</body>`):html+tags;fs.writeFileSync(file,html,'utf8');console.log(`CraneGuard: frontend integral ${version} instalado en ${path.relative(__dirname,file)}.`)}
}

(async()=>{try{
  await waitForPostgres();
  await syncFirstAdminFromEnv();
  await prepareClientsSchema();
  await prepareOperationsSchema();
  await prepareEnterpriseSchema();
  installClientsApiHook();
  installOperationsApiHook();
  installEnterpriseApiHook();
  installFrontendProduction();
  require('./server.js');
}catch(error){console.error('CraneGuard: no se pudo iniciar después de preparar PostgreSQL:',error);process.exit(1)}})();
