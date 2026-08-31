const { Client } = require('pg');

const CLEANUP_KEY = 'client_clean_2026_08_31_v1';

function clientConfig() {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000
  };
}

async function runOneTimeClientCleanup() {
  const adminEmail = String(process.env.FIRST_ADMIN_EMAIL || 'admin@mkr.com.mx').trim().toLowerCase();
  const client = new Client(clientConfig());
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_system_flags (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const already = await client.query('SELECT 1 FROM app_system_flags WHERE key=$1', [CLEANUP_KEY]);
    if (already.rowCount) {
      console.log('CraneGuard: limpieza de entrega al cliente ya fue ejecutada anteriormente; no se repite.');
      return;
    }

    await client.query('BEGIN');

    const businessTables = [
      'report_findings',
      'technical_reports',
      'report_templates',
      'report_forms',
      'warehouse_receipt_lines',
      'warehouse_receipts',
      'supplier_po_lines',
      'supplier_purchase_orders',
      'purchase_requisition_lines',
      'purchase_requisitions',
      'warehouse_compatibility_validations',
      'warehouse_reservations',
      'warehouse_movements',
      'warehouse_products'
    ];

    const present = [];
    for (const table of businessTables) {
      const q = await client.query('SELECT to_regclass($1) AS name', [`public.${table}`]);
      if (q.rows[0]?.name) present.push(`"${table}"`);
    }
    if (present.length) {
      await client.query(`TRUNCATE TABLE ${present.join(', ')} RESTART IDENTITY CASCADE`);
    }

    const auditExists = await client.query("SELECT to_regclass('public.auth_audit_log') AS name");
    if (auditExists.rows[0]?.name) await client.query('TRUNCATE TABLE auth_audit_log RESTART IDENTITY CASCADE');

    const sessionsExists = await client.query("SELECT to_regclass('public.user_sessions') AS name");
    if (sessionsExists.rows[0]?.name) await client.query('TRUNCATE TABLE user_sessions');

    const usersExists = await client.query("SELECT to_regclass('public.app_users') AS name");
    if (usersExists.rows[0]?.name) {
      await client.query('DELETE FROM app_users WHERE LOWER(email) <> LOWER($1)', [adminEmail]);
      await client.query("UPDATE app_users SET role='admin',active=TRUE,must_change_password=FALSE,created_by=NULL,updated_at=NOW() WHERE LOWER(email)=LOWER($1)", [adminEmail]);
    }

    const sequences = [
      ['warehouse_product_seq', 258],
      ['warehouse_reservation_seq', 1],
      ['warehouse_requisition_seq', 428],
      ['warehouse_receipt_seq', 1],
      ['report_form_seq', 1],
      ['report_template_seq', 1],
      ['technical_report_seq', 1],
      ['report_finding_seq', 1]
    ];
    for (const [seq, start] of sequences) {
      const exists = await client.query('SELECT to_regclass($1) AS name', [`public.${seq}`]);
      if (exists.rows[0]?.name) await client.query(`ALTER SEQUENCE "${seq}" RESTART WITH ${Number(start)}`);
    }

    await client.query(
      'INSERT INTO app_system_flags(key,value) VALUES($1,$2)',
      [CLEANUP_KEY, JSON.stringify({ adminEmail, cleanedAt: new Date().toISOString(), purpose: 'Entrega inicial a cliente' })]
    );

    await client.query('COMMIT');
    console.log('CraneGuard: LIMPIEZA DE ENTREGA COMPLETADA. Datos de prueba eliminados; administrador conservado.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

module.exports = { runOneTimeClientCleanup };
