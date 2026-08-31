const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const blueprintUrl = process.env.DATABASE_URL_BLUEPRINT;
if (blueprintUrl) {
  process.env.DATABASE_URL = blueprintUrl;
  console.log('CraneGuard: usando DATABASE_URL_BLUEPRINT administrada por Render.');
}

if (!process.env.DATABASE_URL) {
  console.error('CraneGuard: no existe DATABASE_URL ni DATABASE_URL_BLUEPRINT.');
  process.exit(1);
}

function clientConfig() {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000
  };
}

function dbTarget() {
  try {
    const u = new URL(process.env.DATABASE_URL);
    return `${u.hostname}:${u.port || '5432'}/${(u.pathname || '').replace(/^\//, '')}`;
  } catch {
    return 'URL de PostgreSQL inválida';
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForPostgres() {
  const attempts = Number(process.env.DB_STARTUP_ATTEMPTS || 36);
  const delayMs = Number(process.env.DB_STARTUP_DELAY_MS || 5000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = new Client(clientConfig());
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      console.log(`CraneGuard: PostgreSQL disponible en ${dbTarget()}.`);
      return;
    } catch (error) {
      lastError = error;
      try { await client.end(); } catch {}
      console.warn(`CraneGuard: PostgreSQL no disponible (${attempt}/${attempts}) · ${dbTarget()} · ${error.code || error.message}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }

  throw lastError || new Error('PostgreSQL no estuvo disponible durante el arranque.');
}

async function syncFirstAdminFromEnv() {
  const email = String(process.env.FIRST_ADMIN_EMAIL || 'admin@mkr.com.mx').trim().toLowerCase();
  const password = String(process.env.FIRST_ADMIN_PASSWORD || '');
  const fullName = String(process.env.FIRST_ADMIN_NAME || 'Administrador MKR').trim();

  if (password.length < 10) {
    console.warn('CraneGuard: FIRST_ADMIN_PASSWORD no está configurada o tiene menos de 10 caracteres; no se sincronizó el administrador.');
    return;
  }

  const client = new Client(clientConfig());
  await client.connect();
  try {
    const tableCheck = await client.query("SELECT to_regclass('public.app_users') AS table_name");
    if (!tableCheck.rows[0]?.table_name) {
      console.log('CraneGuard: app_users aún no existe; server.js creará el primer administrador.');
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const existing = await client.query('SELECT id FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);

    if (existing.rowCount) {
      await client.query(
        `UPDATE app_users
         SET password_hash=$1,
             full_name=COALESCE(NULLIF($2,''),full_name),
             role='admin',
             active=TRUE,
             must_change_password=FALSE,
             password_changed_at=NOW(),
             updated_at=NOW()
         WHERE id=$3`,
        [hash, fullName, existing.rows[0].id]
      );
      console.log(`CraneGuard: contraseña del administrador sincronizada desde FIRST_ADMIN_PASSWORD para ${email}.`);
    } else {
      await client.query(
        `INSERT INTO app_users(email,full_name,role,password_hash,active,must_change_password)
         VALUES($1,$2,'admin',$3,TRUE,FALSE)`,
        [email, fullName, hash]
      );
      console.log(`CraneGuard: administrador creado desde variables de Render para ${email}.`);
    }
  } finally {
    await client.end();
  }
}

function appendDelegatedPublishFix() {
  const delegateFile = path.join(__dirname, 'reporting-click-delegate.js');
  const targets = [path.join(__dirname, 'reporting-production.js'), path.join(__dirname, 'public', 'reporting-production.js')];
  if (!fs.existsSync(delegateFile)) {
    console.warn('CraneGuard: reporting-click-delegate.js no existe; no se pudo activar el listener delegado.');
    return;
  }
  const patch = fs.readFileSync(delegateFile, 'utf8');
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    let current = fs.readFileSync(target, 'utf8');
    if (!current.includes('__cgPublishDelegate96')) {
      fs.writeFileSync(target, current + '\n\n' + patch + '\n', 'utf8');
      console.log(`CraneGuard: listener delegado de Publicar revisión activado en ${path.relative(__dirname,target)}.`);
    }
  }
}

(async () => {
  try {
    await waitForPostgres();
    await syncFirstAdminFromEnv();
    appendDelegatedPublishFix();
    require('./server.js');
  } catch (error) {
    console.error('CraneGuard: no se pudo iniciar después de preparar PostgreSQL:', error);
    process.exit(1);
  }
})();
