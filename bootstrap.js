const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const blueprintUrl = process.env.DATABASE_URL_BLUEPRINT;
if (blueprintUrl) {
  // Preferimos siempre la URL inyectada directamente por el Blueprint.
  // Esto evita que una DATABASE_URL manual/vieja en Render deje al servicio apuntando a una BD eliminada.
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

// Recuperación controlada del primer administrador.
// Se ejecuta UNA sola vez por base de datos y después queda marcada en app_bootstrap_state.
// Permite recuperar una instalación donde el admin ya existía con un hash anterior distinto
// a FIRST_ADMIN_PASSWORD, sin convertir FIRST_ADMIN_PASSWORD en una puerta permanente.
async function repairFirstAdminPasswordOnce() {
  const email = String(process.env.FIRST_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.FIRST_ADMIN_PASSWORD || '');
  if (!email || password.length < 10) {
    console.log('CraneGuard: recuperación de admin omitida; FIRST_ADMIN_EMAIL/PASSWORD no están completos.');
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

    const markerKey = 'first_admin_password_repair_v1';
    const marker = await client.query('SELECT 1 FROM app_bootstrap_state WHERE key=$1', [markerKey]);
    if (marker.rowCount) {
      console.log('CraneGuard: recuperación única del primer administrador ya fue aplicada anteriormente.');
      return;
    }

    const existing = await client.query('SELECT id,email FROM app_users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
    if (!existing.rowCount) {
      console.log(`CraneGuard: ${email} aún no existe; server.js lo creará con FIRST_ADMIN_PASSWORD.`);
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    await client.query('BEGIN');
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
    await client.query(
      'INSERT INTO app_bootstrap_state(key,detail) VALUES($1,$2::jsonb)',
      [markerKey, JSON.stringify({ email, action: 'password_repaired_from_first_admin_env' })]
    );
    await client.query('COMMIT');
    console.log(`CraneGuard: credenciales del primer administrador recuperadas una sola vez para ${email}.`);
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
