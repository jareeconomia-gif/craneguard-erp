const { Client } = require('pg');
const bcrypt = require('bcryptjs');

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

async function repairFirstAdminPasswordOnce() {
  const email = String(process.env.FIRST_ADMIN_EMAIL || 'admin@mkr.com.mx').trim().toLowerCase();
  const password = String(process.env.FIRST_ADMIN_PASSWORD || '');
  if (password.length < 10) {
    console.log('CraneGuard: recuperación de admin omitida; FIRST_ADMIN_PASSWORD no está configurada en Render.');
    return;
  }

  const client = new Client(clientConfig());
  await client.connect();
  try {
    const tableCheck = await client.query("SELECT to_regclass('public.app_users') AS table_name");
    if (!tableCheck.rows[0]?.table_name) {
      console.log('CraneGuard: app_users aún no existe; server.js creará el primer administrador con las variables de Render.');
      return;
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_bootstrap_state (
        key TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        detail JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);

    const markerKey = 'first_admin_password_repair_v2';
    const marker = await client.query('SELECT 1 FROM app_bootstrap_state WHERE key=$1', [markerKey]);
    if (marker.rowCount) {
      console.log('CraneGuard: recuperación v2 del primer administrador ya fue aplicada anteriormente.');
      return;
    }

    const existing = await client.query('SELECT id,email FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
    const hash = await bcrypt.hash(password, 12);

    await client.query('BEGIN');
    if (existing.rowCount) {
      await client.query(
        `UPDATE app_users
         SET password_hash=$1,
             role='admin',
             active=TRUE,
             must_change_password=FALSE,
             password_changed_at=NOW(),
             updated_at=NOW()
         WHERE id=$2`,
        [hash, existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO app_users(email,full_name,role,password_hash,active,must_change_password)
         VALUES($1,$2,'admin',$3,TRUE,FALSE)`,
        [email, process.env.FIRST_ADMIN_NAME || 'Administrador MKR', hash]
      );
    }

    await client.query(
      'INSERT INTO app_bootstrap_state(key,detail) VALUES($1,$2::jsonb)',
      [markerKey, JSON.stringify({ email, action: 'password_repaired_from_first_admin_env_v2' })]
    );
    await client.query('COMMIT');
    console.log(`CraneGuard: contraseña del administrador sincronizada desde FIRST_ADMIN_PASSWORD para ${email}.`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

(async () => {
  try {
    await waitForPostgres();
    await repairFirstAdminPasswordOnce();
    require('./server.js');
  } catch (error) {
    console.error('CraneGuard: no se pudo iniciar después de preparar PostgreSQL:', error);
    process.exit(1);
  }
})();
