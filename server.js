const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const { REPORTING_SCHEMA_SQL, registerReporting } = require('./reporting-api');

const app = express();
const PORT = process.env.PORT || 10000;
const isProd = process.env.NODE_ENV === 'production';
const ROLES = ['direction','sales','sales_manager','coord','tech_resp','tech_comp','engineering','warehouse','purchasing','client','admin'];

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está configurado. Conecta un PostgreSQL de Render.');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET debe existir y tener al menos 32 caracteres.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // La interfaz actual genera acciones con onclick dinámicos.
      // Helmet incluye por defecto script-src-attr 'none', que bloquea TODOS los botones.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: '12mb' }));

const APP_BUILD = '9.2.0';
app.use((req,res,next)=>{
  if (req.path.startsWith('/api/') || /\.(?:js|html)$/i.test(req.path) || req.path === '/') {
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
  }
  next();
});
app.get('/api/version',(req,res)=>res.json({service:'craneguard-erp',build:APP_BUILD,production:true}));

app.use(session({
  store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'cg.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados intentos. Intenta nuevamente más tarde.' } });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const adminLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

function safeUser(row) {
  return { id: row.id, email: row.email, full_name: row.full_name, role: row.role, active: row.active, must_change_password: row.must_change_password, created_at: row.created_at, last_login_at: row.last_login_at };
}
async function audit(req, action, targetUserId, detail = {}) {
  try {
    await pool.query('INSERT INTO auth_audit_log(actor_user_id,target_user_id,action,detail,ip_address) VALUES($1,$2,$3,$4,$5)', [req.session?.user?.id || null, targetUserId || null, action, detail, req.ip]);
  } catch (e) { console.error('audit error', e.message); }
}
async function currentUser(req) {
  if (!req.session?.user?.id) return null;
  const { rows } = await pool.query('SELECT id,email,full_name,role,active,must_change_password,created_at,last_login_at FROM app_users WHERE id=$1', [req.session.user.id]);
  return rows[0] || null;
}
async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user || !user.active) { if (req.session) req.session.destroy(()=>{}); return res.status(401).json({ error: 'Sesión no válida.' }); }
    req.user = user; next();
  } catch (e) { next(e); }
}
function requireAdmin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acceso restringido al Administrador.' }); next(); }
function requireRoles(...roles){ return (req,res,next)=> roles.includes(req.user?.role) ? next() : res.status(403).json({error:'No tienes permisos para esta operación.'}); }
function n(v,d=0){ const x=Number(v); return Number.isFinite(x)?x:d; }
function t(v){ return String(v??'').trim(); }
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function validPassword(v) { return typeof v === 'string' && v.length >= 10; }

app.get('/health', async (req,res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'craneguard-erp', db: 'ok' }); }
  catch (e) { res.status(503).json({ ok: false, db: 'error' }); }
});

app.post('/api/auth/login', loginLimiter, async (req,res,next) => {
  try {
    const email = normalizeEmail(req.body.email); const password = String(req.body.password || '');
    const { rows } = await pool.query('SELECT * FROM app_users WHERE email=$1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    if (!user.active) return res.status(403).json({ error: 'Esta cuenta está desactivada. Contacta al Administrador.' });
    req.session.regenerate(async err => {
      if (err) return next(err);
      req.session.user = { id: user.id };
      await pool.query('UPDATE app_users SET last_login_at=NOW(), updated_at=NOW() WHERE id=$1', [user.id]);
      await audit(req, 'LOGIN', user.id, {});
      req.session.save(err2 => err2 ? next(err2) : res.json({ user: safeUser(user) }));
    });
  } catch (e) { next(e); }
});

app.get('/api/auth/me', requireAuth, (req,res) => res.json({ user: safeUser(req.user) }));
app.post('/api/auth/logout', requireAuth, async (req,res) => {
  const uid = req.user.id; await audit(req, 'LOGOUT', uid, {});
  req.session.destroy(() => { res.clearCookie('cg.sid'); res.json({ ok: true }); });
});
app.post('/api/auth/change-password', requireAuth, async (req,res,next) => {
  try {
    const password = String(req.body.password || '');
    if (!validPassword(password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres.' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'UPDATE app_users SET password_hash=$1,must_change_password=FALSE,password_changed_at=NOW(),updated_at=NOW() WHERE id=$2 RETURNING id,email,full_name,role,active,must_change_password,created_at,last_login_at',
      [hash, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No se encontró la cuenta para actualizar la contraseña.' });
    // Persistir la sesión antes de responder para evitar perder el estado al abrir la app.
    req.session.user = { id: rows[0].id };
    await audit(req, 'PASSWORD_CHANGED', req.user.id, {});
    req.session.save(err => {
      if (err) return next(err);
      res.json({ ok: true, user: safeUser(rows[0]) });
    });
  } catch (e) {
    console.error('Error al cambiar contraseña:', e);
    next(e);
  }
});

app.use('/api/admin', requireAuth, requireAdmin, adminLimiter);
app.get('/api/admin/users', async (req,res,next) => {
  try { const { rows } = await pool.query('SELECT id,email,full_name,role,active,must_change_password,created_at,last_login_at FROM app_users ORDER BY created_at DESC'); res.json({ users: rows.map(safeUser) }); }
  catch (e) { next(e); }
});
app.post('/api/admin/users', async (req,res,next) => {
  try {
    const fullName = String(req.body.full_name || '').trim(); const email = normalizeEmail(req.body.email); const role = String(req.body.role || ''); const password = String(req.body.password || '');
    if (!fullName || !email || !ROLES.includes(role) || !validPassword(password)) return res.status(400).json({ error: 'Nombre, correo, rol válido y contraseña de 10+ caracteres son obligatorios.' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO app_users(email,full_name,role,password_hash,active,must_change_password,created_by) VALUES($1,$2,$3,$4,TRUE,FALSE,$5) RETURNING id,email,full_name,role,active,must_change_password,created_at,last_login_at', [email, fullName, role, hash, req.user.id]);
    await audit(req, 'USER_CREATED', rows[0].id, { email, role }); res.status(201).json({ user: safeUser(rows[0]) });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' }); next(e); }
});
app.patch('/api/admin/users/:id', async (req,res,next) => {
  try {
    const id = req.params.id; if (id === req.user.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol o estado desde esta pantalla.' });
    const sets=[]; const vals=[]; let i=1;
    if (req.body.role !== undefined) { if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: 'Rol inválido.' }); sets.push(`role=$${i++}`); vals.push(req.body.role); }
    if (req.body.active !== undefined) { sets.push(`active=$${i++}`); vals.push(Boolean(req.body.active)); }
    if (!sets.length) return res.status(400).json({ error: 'No hay cambios.' });
    sets.push('updated_at=NOW()'); vals.push(id);
    const { rows } = await pool.query(`UPDATE app_users SET ${sets.join(',')} WHERE id=$${i} RETURNING id,email,full_name,role,active,must_change_password,created_at,last_login_at`, vals);
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    await audit(req, 'USER_UPDATED', id, req.body); res.json({ user: safeUser(rows[0]) });
  } catch (e) { next(e); }
});
app.post('/api/admin/users/:id/reset-password', async (req,res,next) => {
  try {
    const id = req.params.id; if (id === req.user.id) return res.status(400).json({ error: 'No puedes restablecer tu propia contraseña desde esta pantalla.' });
    const password = String(req.body.password || ''); if (!validPassword(password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 10 caracteres.' });
    const hash = await bcrypt.hash(password, 12);
    const { rowCount } = await pool.query('UPDATE app_users SET password_hash=$1,must_change_password=FALSE,updated_at=NOW() WHERE id=$2', [hash, id]);
    if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado.' });
    await pool.query('DELETE FROM user_sessions WHERE sess::text LIKE $1', ['%'+id+'%']).catch(()=>{});
    await audit(req, 'PASSWORD_RESET_BY_ADMIN', id, {}); res.json({ ok: true });
  } catch (e) { next(e); }
});



// ============================================================
// ALMACÉN FASE 1 · REFACCIONES
// ============================================================
function whProductView(row, role){
  const base={...row,available_stock:Number(row.physical_stock||0)-Number(row.reserved_stock||0)};
  if(['tech_resp','tech_comp'].includes(role)){
    delete base.last_cost; delete base.avg_cost; delete base.base_price; delete base.habitual_supplier;
  }
  return base;
}
async function whMovement(client, productId, type, qty, refType, refId, destination, notes, userId){
  const p=(await client.query('SELECT physical_stock FROM warehouse_products WHERE id=$1',[productId])).rows[0];
  await client.query(`INSERT INTO warehouse_movements(product_id,movement_type,quantity,balance_after,reference_type,reference_id,destination,notes,user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[productId,type,qty,p?.physical_stock||0,refType||null,refId||null,destination||null,notes||null,userId||null]);
}

app.get('/api/warehouse/dashboard', requireAuth, async (req,res,next)=>{try{
  const q=await pool.query(`SELECT
    COUNT(*)::int total_products,
    COUNT(*) FILTER(WHERE physical_stock>0)::int with_stock,
    COUNT(*) FILTER(WHERE physical_stock<=0)::int without_stock,
    COUNT(*) FILTER(WHERE (physical_stock-reserved_stock)<=stock_min)::int low_stock,
    COUNT(*) FILTER(WHERE in_purchase>0)::int products_in_purchase,
    COALESCE(SUM(reserved_stock),0)::float reserved_units,
    COALESCE(SUM(physical_stock-reserved_stock),0)::float available_units
    FROM warehouse_products WHERE state<>'Inactivo'`);
  const r=await pool.query(`SELECT
    COUNT(*) FILTER(WHERE status='Activa')::int active_reservations,
    COUNT(*) FILTER(WHERE status='Activa' AND quantity>0)::int ready_install
    FROM warehouse_reservations`);
  const po=await pool.query(`SELECT
    COUNT(*) FILTER(WHERE status NOT IN ('Recibida','Cerrada'))::int pending_receipts,
    COUNT(*) FILTER(WHERE status='En tránsito')::int in_transit,
    COUNT(*) FILTER(WHERE promised_date<CURRENT_DATE AND status NOT IN ('Recibida','Cerrada'))::int overdue_po
    FROM supplier_purchase_orders`);
  const rq=await pool.query(`SELECT COUNT(*) FILTER(WHERE status IN ('Pendiente de revisión','Pendiente de OC','Compra parcial'))::int pending_requisitions FROM purchase_requisitions`);
  res.json({dashboard:{...q.rows[0],...r.rows[0],...po.rows[0],...rq.rows[0]}});
}catch(e){next(e)}});

app.get('/api/warehouse/products', requireAuth, async (req,res,next)=>{try{
  const q=t(req.query.q), vals=[]; let where=`WHERE p.state<>'Inactivo'`;
  if(q){vals.push('%'+q+'%');where+=` AND (p.cg_code ILIKE $1 OR COALESCE(p.internal_code,'') ILIKE $1 OR COALESCE(p.part_number,'') ILIKE $1 OR p.name ILIKE $1 OR COALESCE(p.description,'') ILIKE $1 OR COALESCE(p.brand,'') ILIKE $1 OR COALESCE(p.manufacturer,'') ILIKE $1 OR COALESCE(p.category,'') ILIKE $1 OR COALESCE(p.application,'') ILIKE $1 OR COALESCE(p.compatible_models,'') ILIKE $1)`}
  const {rows}=await pool.query(`SELECT p.* FROM warehouse_products p ${where} ORDER BY p.name LIMIT 300`,vals);
  res.json({products:rows.map(x=>whProductView(x,req.user.role))});
}catch(e){next(e)}});

app.post('/api/warehouse/products', requireAuth, requireRoles('warehouse','admin'), async (req,res,next)=>{const c=await pool.connect();try{
  const b=req.body||{}; if(!t(b.name)) return res.status(400).json({error:'Nombre / descripción de la refacción es obligatorio.'});
  const dup=await c.query(`SELECT id,cg_code,part_number,name,physical_stock FROM warehouse_products WHERE state<>'Inactivo' AND (
    ($1<>'' AND lower(COALESCE(part_number,''))=lower($1)) OR ($2<>'' AND lower(COALESCE(internal_code,''))=lower($2)) OR lower(name)=lower($3)) LIMIT 1`,[t(b.part_number),t(b.internal_code),t(b.name)]);
  if(dup.rowCount && !b.force) return res.status(409).json({error:'POSIBLE PRODUCTO EXISTENTE',existing:dup.rows[0]});
  await c.query('BEGIN');
  const vals=[t(b.internal_code)||null,t(b.part_number)||null,t(b.name),t(b.description)||null,t(b.brand)||null,t(b.manufacturer)||null,t(b.category)||null,t(b.subcategory)||null,t(b.unit)||'PZA',t(b.state)||'Activo',t(b.photo_url)||null,t(b.warehouse_name)||'Principal',t(b.zone)||null,t(b.rack)||null,t(b.level_name)||null,t(b.position_name)||null,n(b.stock_min),n(b.stock_max),n(b.initial_stock),t(b.application)||null,t(b.system_name)||null,t(b.subsystem)||null,t(b.compatible_models)||null,t(b.critical_measures)||null,t(b.exploded_position)||null,t(b.previous_part_number)||null,t(b.equivalent_part_number)||null,t(b.compatibility_notes)||null,n(b.last_cost),n(b.avg_cost||b.last_cost),t(b.currency)||'MXN',n(b.base_price),t(b.habitual_supplier)||null,Math.round(n(b.lead_time_days)),t(b.document_ref)||null,req.user.id];
  const ins=await c.query(`INSERT INTO warehouse_products(internal_code,part_number,name,description,brand,manufacturer,category,subcategory,unit,state,photo_url,warehouse_name,zone,rack,level_name,position_name,stock_min,stock_max,physical_stock,application,system_name,subsystem,compatible_models,critical_measures,exploded_position,previous_part_number,equivalent_part_number,compatibility_notes,last_cost,avg_cost,currency,base_price,habitual_supplier,lead_time_days,document_ref,created_by)
    VALUES(${vals.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,vals);
  const p=ins.rows[0]; if(n(b.initial_stock)>0) await whMovement(c,p.id,'Inventario inicial',n(b.initial_stock),'Alta','Carga inicial',null,'Carga inicial / migración',req.user.id);
  await c.query('COMMIT'); res.status(201).json({product:whProductView(p,req.user.role)});
}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});

app.post('/api/warehouse/products/:id/reserve', requireAuth, requireRoles('warehouse','admin','sales','sales_manager','engineering'), async (req,res,next)=>{const c=await pool.connect();try{
  const qty=n(req.body.quantity); if(qty<=0)return res.status(400).json({error:'Cantidad inválida.'}); await c.query('BEGIN');
  const p=(await c.query('SELECT * FROM warehouse_products WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0]; if(!p)return res.status(404).json({error:'Refacción no encontrada.'});
  const avail=n(p.physical_stock)-n(p.reserved_stock); if(qty>avail)return res.status(409).json({error:`Disponibilidad insuficiente. Disponible: ${avail}`});
  const dest=[t(req.body.client),t(req.body.asset),t(req.body.finding),t(req.body.crane_order),t(req.body.service_order)].filter(Boolean).join(' · ');
  const rr=await c.query(`INSERT INTO warehouse_reservations(product_id,quantity,client,plant,asset,finding,crane_order,service_order,project,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[p.id,qty,t(req.body.client)||null,t(req.body.plant)||null,t(req.body.asset)||null,t(req.body.finding)||null,t(req.body.crane_order)||null,t(req.body.service_order)||null,t(req.body.project)||null,req.user.id]);
  await c.query('UPDATE warehouse_products SET reserved_stock=reserved_stock+$1,updated_at=NOW() WHERE id=$2',[qty,p.id]);
  await whMovement(c,p.id,'Reserva',qty,'Reserva',rr.rows[0].reservation_code,dest,'Material apartado; no cambia existencia física',req.user.id);
  await c.query('COMMIT'); res.status(201).json({reservation:rr.rows[0]});
}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});

app.get('/api/warehouse/reservations', requireAuth, async (req,res,next)=>{try{
 const {rows}=await pool.query(`SELECT r.*,p.cg_code,p.part_number,p.name,p.physical_stock,p.reserved_stock,(p.physical_stock-p.reserved_stock) available_stock FROM warehouse_reservations r JOIN warehouse_products p ON p.id=r.product_id ORDER BY r.created_at DESC LIMIT 300`);res.json({reservations:rows});
}catch(e){next(e)}});

app.post('/api/warehouse/requisitions', requireAuth, requireRoles('warehouse','purchasing','admin','engineering','sales','sales_manager'), async (req,res,next)=>{const c=await pool.connect();try{
 const lines=Array.isArray(req.body.lines)?req.body.lines:[]; if(!lines.length)return res.status(400).json({error:'Agrega al menos una refacción.'}); await c.query('BEGIN');
 const r=(await c.query(`INSERT INTO purchase_requisitions(origin_type,origin_ref,client,plant,asset,finding,crane_order,service_order,project,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pendiente de OC',$10,$11) RETURNING *`,[t(req.body.origin_type)||null,t(req.body.origin_ref)||null,t(req.body.client)||null,t(req.body.plant)||null,t(req.body.asset)||null,t(req.body.finding)||null,t(req.body.crane_order)||null,t(req.body.service_order)||null,t(req.body.project)||null,t(req.body.notes)||null,req.user.id])).rows[0];
 for(const ln of lines){const p=(await c.query('SELECT * FROM warehouse_products WHERE id=$1 FOR SHARE',[ln.product_id])).rows[0];if(!p)throw new Error('Producto no encontrado');const avail=n(p.physical_stock)-n(p.reserved_stock), reqq=n(ln.required_qty);const buy=Math.max(reqq-avail,0);await c.query(`INSERT INTO purchase_requisition_lines(requisition_id,product_id,required_qty,available_snapshot,requested_qty) VALUES($1,$2,$3,$4,$5)`,[r.id,p.id,reqq,avail,buy]);}
 await c.query('COMMIT');res.status(201).json({requisition:r});
}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});

app.get('/api/warehouse/requisitions', requireAuth, async (req,res,next)=>{try{
 const {rows}=await pool.query(`SELECT r.*,COALESCE(json_agg(json_build_object('line_id',l.id,'product_id',p.id,'product',p.name,'part_number',p.part_number,'required',l.required_qty,'available',l.available_snapshot,'requested',l.requested_qty,'ordered',l.ordered_qty)) FILTER(WHERE l.id IS NOT NULL),'[]') lines FROM purchase_requisitions r LEFT JOIN purchase_requisition_lines l ON l.requisition_id=r.id LEFT JOIN warehouse_products p ON p.id=l.product_id GROUP BY r.id ORDER BY r.created_at DESC LIMIT 200`);res.json({requisitions:rows});
}catch(e){next(e)}});

app.post('/api/warehouse/purchase-orders', requireAuth, requireRoles('purchasing','admin'), async (req,res,next)=>{const c=await pool.connect();try{
 const lines=Array.isArray(req.body.lines)?req.body.lines:[]; if(!t(req.body.po_number)||!t(req.body.supplier)||!lines.length)return res.status(400).json({error:'OC, proveedor y partidas son obligatorios.'}); await c.query('BEGIN');
 const po=(await c.query(`INSERT INTO supplier_purchase_orders(po_number,supplier,order_date,currency,amount,promised_date,status,notes,requisition_id,created_by) VALUES($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6::date,'OC registrada — documento pendiente',$7,$8,$9) RETURNING *`,[t(req.body.po_number),t(req.body.supplier),req.body.order_date||null,t(req.body.currency)||'MXN',n(req.body.amount),req.body.promised_date||null,t(req.body.notes)||null,req.body.requisition_id||null,req.user.id])).rows[0];
 for(const ln of lines){const qty=n(ln.ordered_qty); if(qty<=0)continue; await c.query(`INSERT INTO supplier_po_lines(po_id,requisition_line_id,product_id,ordered_qty) VALUES($1,$2,$3,$4)`,[po.id,ln.requisition_line_id||null,ln.product_id,qty]);await c.query('UPDATE warehouse_products SET in_purchase=in_purchase+$1,updated_at=NOW() WHERE id=$2',[qty,ln.product_id]);if(ln.requisition_line_id)await c.query('UPDATE purchase_requisition_lines SET ordered_qty=ordered_qty+$1 WHERE id=$2',[qty,ln.requisition_line_id]);}
 if(po.requisition_id){const sums=(await c.query('SELECT COALESCE(SUM(requested_qty),0) requested,COALESCE(SUM(ordered_qty),0) ordered FROM purchase_requisition_lines WHERE requisition_id=$1',[po.requisition_id])).rows[0];const st=n(sums.ordered)>=n(sums.requested)?'En compra':'Compra parcial';await c.query('UPDATE purchase_requisitions SET status=$1,updated_at=NOW() WHERE id=$2',[st,po.requisition_id]);}
 await c.query('COMMIT');res.status(201).json({purchase_order:po});
}catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:'Ya existe esa OC proveedor.'});next(e)}finally{c.release()}});

app.get('/api/warehouse/purchase-orders', requireAuth, async (req,res,next)=>{try{
 const {rows}=await pool.query(`SELECT po.*,COALESCE(json_agg(json_build_object('line_id',l.id,'product_id',p.id,'product',p.name,'part_number',p.part_number,'ordered',l.ordered_qty,'received',l.received_qty,'pending',l.ordered_qty-l.received_qty,'requisition_line_id',l.requisition_line_id)) FILTER(WHERE l.id IS NOT NULL),'[]') lines FROM supplier_purchase_orders po LEFT JOIN supplier_po_lines l ON l.po_id=po.id LEFT JOIN warehouse_products p ON p.id=l.product_id GROUP BY po.id ORDER BY po.created_at DESC LIMIT 200`);res.json({purchase_orders:rows});
}catch(e){next(e)}});

app.post('/api/warehouse/purchase-orders/:id/document', requireAuth, requireRoles('purchasing','admin'), upload.single('file'), async (req,res,next)=>{try{
 if(!req.file)return res.status(400).json({error:'Selecciona el PDF de la OC.'}); if(req.file.mimetype!=='application/pdf')return res.status(400).json({error:'Solo se admite PDF.'});
 const {rows}=await pool.query(`UPDATE supplier_purchase_orders SET document_name=$1,document_mime=$2,document_data=$3,uploaded_by=$4,uploaded_at=NOW(),status='OC confirmada — en compra',updated_at=NOW() WHERE id=$5 RETURNING id,po_number,document_name,status`,[req.file.originalname,req.file.mimetype,req.file.buffer,req.user.id,req.params.id]);if(!rows[0])return res.status(404).json({error:'OC no encontrada.'});res.json({purchase_order:rows[0]});
}catch(e){next(e)}});
app.get('/api/warehouse/purchase-orders/:id/document', requireAuth, async (req,res,next)=>{try{
 const {rows}=await pool.query('SELECT document_name,document_mime,document_data FROM supplier_purchase_orders WHERE id=$1',[req.params.id]);const d=rows[0];if(!d?.document_data)return res.status(404).json({error:'Documento no cargado.'});res.setHeader('Content-Type',d.document_mime||'application/pdf');res.setHeader('Content-Disposition',`inline; filename="${String(d.document_name||'OC.pdf').replace(/"/g,'')}"`);res.send(d.document_data);
}catch(e){next(e)}});

app.post('/api/warehouse/receipts', requireAuth, requireRoles('warehouse','admin'), async (req,res,next)=>{const c=await pool.connect();try{
 const items=Array.isArray(req.body.lines)?req.body.lines:[]; if(!req.body.po_id||!items.length)return res.status(400).json({error:'OC y cantidades recibidas son obligatorias.'}); await c.query('BEGIN');
 const po=(await c.query('SELECT * FROM supplier_purchase_orders WHERE id=$1 FOR UPDATE',[req.body.po_id])).rows[0];if(!po)return res.status(404).json({error:'OC no encontrada.'});
 const receipt=(await c.query(`INSERT INTO warehouse_receipts(po_id,supplier,receipt_date,physical_status,location,evidence_note,created_by) VALUES($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6,$7) RETURNING *`,[po.id,po.supplier,req.body.receipt_date||null,t(req.body.physical_status)||'Conforme',t(req.body.location)||null,t(req.body.evidence_note)||null,req.user.id])).rows[0];
 for(const it of items){const qty=n(it.received_today);if(qty<=0)continue;const line=(await c.query('SELECT * FROM supplier_po_lines WHERE id=$1 FOR UPDATE',[it.po_line_id])).rows[0];if(!line)throw new Error('Partida OC no encontrada');const pending=n(line.ordered_qty)-n(line.received_qty);if(qty>pending)throw new Error('La recepción excede la cantidad pendiente');const newrec=n(line.received_qty)+qty;await c.query('UPDATE supplier_po_lines SET received_qty=$1 WHERE id=$2',[newrec,line.id]);await c.query('UPDATE warehouse_products SET physical_stock=physical_stock+$1,in_purchase=GREATEST(in_purchase-$1,0),updated_at=NOW() WHERE id=$2',[qty,line.product_id]);await c.query(`INSERT INTO warehouse_receipt_lines(receipt_id,po_line_id,product_id,received_today,accumulated_after,pending_after) VALUES($1,$2,$3,$4,$5,$6)`,[receipt.id,line.id,line.product_id,qty,newrec,n(line.ordered_qty)-newrec]);await whMovement(c,line.product_id,'Recepción',qty,'OC proveedor',po.po_number,t(req.body.location)||null,receipt.receipt_code,req.user.id);
   if(po.requisition_id){const rq=(await c.query('SELECT * FROM purchase_requisitions WHERE id=$1',[po.requisition_id])).rows[0];if(rq && (rq.client||rq.asset||rq.finding||rq.crane_order||rq.service_order)){const rr=(await c.query(`INSERT INTO warehouse_reservations(product_id,quantity,client,plant,asset,finding,crane_order,service_order,project,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING reservation_code`,[line.product_id,qty,rq.client,rq.plant,rq.asset,rq.finding,rq.crane_order,rq.service_order,rq.project,req.user.id])).rows[0];await c.query('UPDATE warehouse_products SET reserved_stock=reserved_stock+$1 WHERE id=$2',[qty,line.product_id]);await whMovement(c,line.product_id,'Reserva automática',qty,'Recepción',receipt.receipt_code,[rq.client,rq.asset,rq.finding].filter(Boolean).join(' · '),rr.reservation_code,req.user.id);}
   }
 }
 const left=(await c.query('SELECT COALESCE(SUM(ordered_qty-received_qty),0) pending FROM supplier_po_lines WHERE po_id=$1',[po.id])).rows[0];const pst=n(left.pending)<=0?'Recibida':'Recepción parcial';await c.query('UPDATE supplier_purchase_orders SET status=$1,updated_at=NOW() WHERE id=$2',[pst,po.id]);await c.query('COMMIT');res.status(201).json({receipt,status:pst});
}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});

app.get('/api/warehouse/receipts', requireAuth, async (req,res,next)=>{try{
 const {rows}=await pool.query(`SELECT r.*,po.po_number,COALESCE(json_agg(json_build_object('product',p.name,'part_number',p.part_number,'received',l.received_today,'accumulated',l.accumulated_after,'pending',l.pending_after)) FILTER(WHERE l.id IS NOT NULL),'[]') lines FROM warehouse_receipts r JOIN supplier_purchase_orders po ON po.id=r.po_id LEFT JOIN warehouse_receipt_lines l ON l.receipt_id=r.id LEFT JOIN warehouse_products p ON p.id=l.product_id GROUP BY r.id,po.po_number ORDER BY r.created_at DESC LIMIT 200`);res.json({receipts:rows});
}catch(e){next(e)}});

app.post('/api/warehouse/outbound', requireAuth, requireRoles('warehouse','admin'), async (req,res,next)=>{const c=await pool.connect();try{
 const qty=n(req.body.quantity);if(qty<=0)return res.status(400).json({error:'Cantidad inválida.'});await c.query('BEGIN');const p=(await c.query('SELECT * FROM warehouse_products WHERE id=$1 FOR UPDATE',[req.body.product_id])).rows[0];if(!p)return res.status(404).json({error:'Producto no encontrado.'});if(qty>n(p.physical_stock))return res.status(409).json({error:'Existencia física insuficiente.'});
 let release=0;if(req.body.reservation_id){const r=(await c.query("SELECT * FROM warehouse_reservations WHERE id=$1 AND status='Activa' FOR UPDATE",[req.body.reservation_id])).rows[0];if(r){release=Math.min(qty,n(r.quantity));await c.query("UPDATE warehouse_reservations SET status='Consumida',released_at=NOW() WHERE id=$1",[r.id]);}}
 await c.query('UPDATE warehouse_products SET physical_stock=physical_stock-$1,reserved_stock=GREATEST(reserved_stock-$2,0),updated_at=NOW() WHERE id=$3',[qty,release,p.id]);const dest=[t(req.body.client),t(req.body.asset),t(req.body.service_order),t(req.body.crane_order)].filter(Boolean).join(' · ');await whMovement(c,p.id,t(req.body.reason)||'Salida',-qty,t(req.body.reference_type)||'Salida',t(req.body.reference_id)||null,dest,t(req.body.notes)||null,req.user.id);await c.query('COMMIT');res.json({ok:true});
}catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}});

app.get('/api/warehouse/ready-install', requireAuth, async (req,res,next)=>{try{
 const {rows}=await pool.query(`SELECT r.*,p.cg_code,p.part_number,p.name,(p.physical_stock-p.reserved_stock) available_after_reserve FROM warehouse_reservations r JOIN warehouse_products p ON p.id=r.product_id WHERE r.status='Activa' ORDER BY r.created_at DESC`);res.json({items:rows});
}catch(e){next(e)}});

app.get('/api/warehouse/kardex', requireAuth, async (req,res,next)=>{try{
 const pid=t(req.query.product_id);let vals=[],where='';if(pid){vals=[pid];where='WHERE m.product_id=$1'}const {rows}=await pool.query(`SELECT m.*,p.cg_code,p.part_number,p.name,u.full_name user_name FROM warehouse_movements m JOIN warehouse_products p ON p.id=m.product_id LEFT JOIN app_users u ON u.id=m.user_id ${where} ORDER BY m.created_at DESC LIMIT 500`,vals);res.json({movements:rows});
}catch(e){next(e)}});

app.post('/api/warehouse/compatibility', requireAuth, requireRoles('engineering','admin'), async (req,res,next)=>{try{
 if(!req.body.product_id||!t(req.body.finding)||!['Confirmada','Descartada','Más información'].includes(req.body.decision))return res.status(400).json({error:'Producto, hallazgo y decisión son obligatorios.'});const {rows}=await pool.query(`INSERT INTO warehouse_compatibility_validations(product_id,finding,asset,decision,notes,validated_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[req.body.product_id,t(req.body.finding),t(req.body.asset)||null,req.body.decision,t(req.body.notes)||null,req.user.id]);res.status(201).json({validation:rows[0]});
}catch(e){next(e)}});
app.get('/api/warehouse/compatibility', requireAuth, async (req,res,next)=>{try{const f=t(req.query.finding);const {rows}=await pool.query(`SELECT v.*,p.cg_code,p.part_number,p.name,u.full_name validator FROM warehouse_compatibility_validations v JOIN warehouse_products p ON p.id=v.product_id LEFT JOIN app_users u ON u.id=v.validated_by WHERE ($1='' OR v.finding=$1) ORDER BY v.created_at DESC LIMIT 100`,[f]);res.json({validations:rows})}catch(e){next(e)}});

app.post('/api/warehouse/import', requireAuth, requireRoles('warehouse','admin'), upload.single('file'), async (req,res,next)=>{try{
 if(!req.file)return res.status(400).json({error:'Selecciona un archivo Excel.'});const wb=XLSX.read(req.file.buffer,{type:'buffer'}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''});const review=[];
 for(let i=0;i<rows.length;i++){const r=rows[i], norm={internal_code:t(r['Código']||r['Codigo']||r['codigo']||r['Código interno']),name:t(r['Producto']||r['Nombre']||r['Descripción']||r['Descripcion']),category:t(r['Categoría']||r['Categoria']),brand:t(r['Marca']),unit:t(r['Unidad'])||'PZA',location:t(r['Ubicación']||r['Ubicacion']),initial_stock:n(r['Cantidad']),last_cost:n(r['Costo']),part_number:t(r['N.º de parte']||r['No. parte']||r['P/N']||r['Parte'])};let issues=[];if(!norm.name)issues.push('Sin descripción');if(!norm.category)issues.push('Sin categoría');const dup=await pool.query(`SELECT cg_code,name,part_number FROM warehouse_products WHERE ($1<>'' AND lower(COALESCE(internal_code,''))=lower($1)) OR ($2<>'' AND lower(COALESCE(part_number,''))=lower($2)) OR ($3<>'' AND lower(name)=lower($3)) LIMIT 1`,[norm.internal_code,norm.part_number,norm.name]);if(dup.rowCount)issues.push('Duplicado');review.push({row:i+2,...norm,issues,existing:dup.rows[0]||null});}
 if(String(req.body.commit)!=='true')return res.json({review,summary:{total:review.length,correct:review.filter(x=>!x.issues.length).length,problematic:review.filter(x=>x.issues.length).length}});
 let imported=0;for(const r of review.filter(x=>!x.issues.length)){const loc=r.location.split(/[\/-]/).map(x=>x.trim());const {rows:ins}=await pool.query(`INSERT INTO warehouse_products(internal_code,part_number,name,brand,category,unit,warehouse_name,zone,rack,position_name,physical_stock,last_cost,avg_cost,created_by) VALUES($1,$2,$3,$4,$5,$6,'Principal',$7,$8,$9,$10,$11,$11,$12) RETURNING id,physical_stock`,[r.internal_code||null,r.part_number||null,r.name,r.brand||null,r.category,r.unit,loc[0]||null,loc[1]||null,loc[2]||null,r.initial_stock,r.last_cost,req.user.id]);if(r.initial_stock>0)await pool.query(`INSERT INTO warehouse_movements(product_id,movement_type,quantity,balance_after,reference_type,reference_id,notes,user_id) VALUES($1,'Inventario inicial',$2,$2,'Importación Excel',$3,'Carga inicial / migración',$4)`,[ins[0].id,r.initial_stock,req.file.originalname,req.user.id]);imported++;}
 res.json({imported,skipped:review.length-imported,review});
}catch(e){next(e)}});

// Frontend robusto: usa public/index.html y, si esa carpeta no llegó a GitHub, usa index.html de la raíz.
const PUBLIC_DIR = path.join(__dirname, 'public');
const PUBLIC_INDEX = path.join(PUBLIC_DIR, 'index.html');
const ROOT_INDEX = path.join(__dirname, 'index.html');
const FRONTEND_INDEX = fs.existsSync(PUBLIC_INDEX) ? PUBLIC_INDEX : (fs.existsSync(ROOT_INDEX) ? ROOT_INDEX : null);

if (!FRONTEND_INDEX) {
  throw new Error('No se encontró el frontend. Debe existir public/index.html o index.html en la raíz del repositorio.');
}
console.log('Frontend CraneGuard:', FRONTEND_INDEX);

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { maxAge: 0, etag: true, index: false, setHeaders(res){ res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate'); } }));
}
// Fallbacks seguros para una subida manual en la que public/ haya desaparecido.

registerReporting(app,{pool,requireAuth,requireRoles,audit});

app.get('/reporting-production.js', (req,res) => {
  const f = fs.existsSync(path.join(PUBLIC_DIR,'reporting-production.js')) ? path.join(PUBLIC_DIR,'reporting-production.js') : path.join(__dirname,'reporting-production.js');
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control','no-store'); res.type('application/javascript').sendFile(f);
});

app.get('/warehouse-phase1.js', (req,res) => {
  const f = fs.existsSync(path.join(PUBLIC_DIR,'warehouse-phase1.js')) ? path.join(PUBLIC_DIR,'warehouse-phase1.js') : path.join(__dirname,'warehouse-phase1.js');
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control','no-store'); res.type('application/javascript').sendFile(f);
});

app.get('/service-worker.js', (req,res,next) => {
  const f = fs.existsSync(path.join(PUBLIC_DIR,'service-worker.js')) ? path.join(PUBLIC_DIR,'service-worker.js') : path.join(__dirname,'service-worker.js');
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control','no-store'); res.type('application/javascript').sendFile(f);
});
app.get('/craneguard_logo.png', (req,res,next) => {
  const f = fs.existsSync(path.join(PUBLIC_DIR,'craneguard_logo.png')) ? path.join(PUBLIC_DIR,'craneguard_logo.png') : path.join(__dirname,'craneguard_logo.png');
  if (!fs.existsSync(f)) return res.status(404).end();
  res.type('png').sendFile(f);
});
app.get('*', (req,res,next) => {
  if (req.path.startsWith('/api/')) return next();
  res.setHeader('Cache-Control','no-store'); res.sendFile(FRONTEND_INDEX);
});

app.use((err,req,res,next) => { console.error(err); if (res.headersSent) return next(err); res.status(500).json({ error: 'Error interno del servidor.' }); });

const EMBEDDED_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('direction','sales','sales_manager','coord','tech_resp','tech_comp','engineering','warehouse','purchasing','client','admin')),
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_actor ON auth_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_target ON auth_audit_log(target_user_id, created_at DESC);

`;


const WAREHOUSE_SCHEMA_SQL = `

-- ============================================================
-- CRANEGUARD ERP · ALMACÉN FASE 1 · REFACCIONES
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS warehouse_product_seq START 258;
CREATE SEQUENCE IF NOT EXISTS warehouse_reservation_seq START 1;
CREATE SEQUENCE IF NOT EXISTS warehouse_requisition_seq START 428;
CREATE SEQUENCE IF NOT EXISTS warehouse_receipt_seq START 1;

CREATE TABLE IF NOT EXISTS warehouse_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cg_code TEXT NOT NULL UNIQUE DEFAULT ('PRD-CG-' || lpad(nextval('warehouse_product_seq')::text,6,'0')),
  internal_code TEXT,
  part_number TEXT,
  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  manufacturer TEXT,
  category TEXT,
  subcategory TEXT,
  unit TEXT NOT NULL DEFAULT 'PZA',
  state TEXT NOT NULL DEFAULT 'Activo',
  photo_url TEXT,
  warehouse_name TEXT DEFAULT 'Principal',
  zone TEXT,
  rack TEXT,
  level_name TEXT,
  position_name TEXT,
  stock_min NUMERIC(14,3) NOT NULL DEFAULT 0,
  stock_max NUMERIC(14,3) NOT NULL DEFAULT 0,
  physical_stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (physical_stock >= 0),
  reserved_stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  in_purchase NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (in_purchase >= 0),
  application TEXT,
  system_name TEXT,
  subsystem TEXT,
  compatible_models TEXT,
  critical_measures TEXT,
  exploded_position TEXT,
  previous_part_number TEXT,
  equivalent_part_number TEXT,
  compatibility_notes TEXT,
  last_cost NUMERIC(16,2) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(16,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MXN',
  base_price NUMERIC(16,2) NOT NULL DEFAULT 0,
  habitual_supplier TEXT,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  document_ref TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_products_part ON warehouse_products(part_number);
CREATE INDEX IF NOT EXISTS idx_wh_products_search ON warehouse_products(brand,manufacturer,category);

CREATE TABLE IF NOT EXISTS warehouse_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES warehouse_products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,3) NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  destination TEXT,
  notes TEXT,
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_mov_product ON warehouse_movements(product_id,created_at DESC);

CREATE TABLE IF NOT EXISTS warehouse_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_code TEXT NOT NULL UNIQUE DEFAULT ('RES-CG-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('warehouse_reservation_seq')::text,5,'0')),
  product_id UUID NOT NULL REFERENCES warehouse_products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK(quantity > 0),
  client TEXT,
  plant TEXT,
  asset TEXT,
  finding TEXT,
  crane_order TEXT,
  service_order TEXT,
  project TEXT,
  status TEXT NOT NULL DEFAULT 'Activa',
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wh_res_product ON warehouse_reservations(product_id,status);

CREATE TABLE IF NOT EXISTS purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  req_code TEXT NOT NULL UNIQUE DEFAULT ('REQ-CG-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('warehouse_requisition_seq')::text,4,'0')),
  origin_type TEXT,
  origin_ref TEXT,
  client TEXT,
  plant TEXT,
  asset TEXT,
  finding TEXT,
  crane_order TEXT,
  service_order TEXT,
  project TEXT,
  status TEXT NOT NULL DEFAULT 'Pendiente de revisión',
  notes TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES warehouse_products(id) ON DELETE RESTRICT,
  required_qty NUMERIC(14,3) NOT NULL CHECK(required_qty > 0),
  available_snapshot NUMERIC(14,3) NOT NULL DEFAULT 0,
  requested_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  ordered_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  supplier TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency TEXT NOT NULL DEFAULT 'MXN',
  amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  promised_date DATE,
  status TEXT NOT NULL DEFAULT 'OC registrada — documento pendiente',
  notes TEXT,
  requisition_id UUID REFERENCES purchase_requisitions(id) ON DELETE SET NULL,
  document_name TEXT,
  document_mime TEXT,
  document_data BYTEA,
  uploaded_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_po_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES supplier_purchase_orders(id) ON DELETE CASCADE,
  requisition_line_id UUID REFERENCES purchase_requisition_lines(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES warehouse_products(id) ON DELETE RESTRICT,
  ordered_qty NUMERIC(14,3) NOT NULL CHECK(ordered_qty > 0),
  received_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_code TEXT NOT NULL UNIQUE DEFAULT ('REC-CG-' || to_char(CURRENT_DATE,'YYYY') || '-' || lpad(nextval('warehouse_receipt_seq')::text,5,'0')),
  po_id UUID NOT NULL REFERENCES supplier_purchase_orders(id) ON DELETE RESTRICT,
  supplier TEXT,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  physical_status TEXT NOT NULL DEFAULT 'Conforme',
  location TEXT,
  evidence_note TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES warehouse_receipts(id) ON DELETE CASCADE,
  po_line_id UUID NOT NULL REFERENCES supplier_po_lines(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES warehouse_products(id) ON DELETE RESTRICT,
  received_today NUMERIC(14,3) NOT NULL CHECK(received_today > 0),
  accumulated_after NUMERIC(14,3) NOT NULL DEFAULT 0,
  pending_after NUMERIC(14,3) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouse_compatibility_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES warehouse_products(id) ON DELETE RESTRICT,
  finding TEXT NOT NULL,
  asset TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('Confirmada','Descartada','Más información')),
  notes TEXT,
  validated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_compat_find ON warehouse_compatibility_validations(finding,created_at DESC);
`;

async function initDatabase() {
  const schemaFile = path.join(__dirname,'db','schema.sql');
  let sql = EMBEDDED_SCHEMA_SQL;
  if (fs.existsSync(schemaFile)) {
    console.log('Inicializando base desde db/schema.sql');
    sql = fs.readFileSync(schemaFile,'utf8');
  } else {
    console.warn('db/schema.sql no encontrado; usando esquema incorporado en server.js');
  }
  await pool.query(sql);

  // Migraciones incrementales para instalaciones existentes.
  // CREATE TABLE IF NOT EXISTS no agrega columnas nuevas a tablas ya creadas.
  await pool.query(`
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);
  console.log('Migraciones de autenticación verificadas.');

  await pool.query(WAREHOUSE_SCHEMA_SQL);
  await pool.query(REPORTING_SCHEMA_SQL);
  console.log('Reportes configurables: esquema PostgreSQL verificado.');
  const email = normalizeEmail(process.env.FIRST_ADMIN_EMAIL); const password = process.env.FIRST_ADMIN_PASSWORD; const fullName = process.env.FIRST_ADMIN_NAME || 'Administrador CraneGuard';
  if (email && password) {
    if (!validPassword(password)) throw new Error('FIRST_ADMIN_PASSWORD debe tener al menos 10 caracteres.');
    const existing = await pool.query('SELECT id FROM app_users WHERE email=$1',[email]);
    // El primer administrador no se bloquea con cambio obligatorio de contraseña.
    await pool.query("UPDATE app_users SET must_change_password=FALSE, updated_at=NOW() WHERE email=$1 AND role='admin'",[email]);
    console.log('Desbloqueando primer administrador para acceso directo:', email);
    if (!existing.rowCount) { const hash=await bcrypt.hash(password,12); await pool.query("INSERT INTO app_users(email,full_name,role,password_hash,active,must_change_password) VALUES($1,$2,'admin',$3,TRUE,FALSE)",[email,fullName,hash]); console.log('Primer administrador creado:',email); }
  }

  // Producción: no se insertan datos de demostración automáticamente.

  const count = await pool.query('SELECT COUNT(*)::int AS n FROM app_users');
  if (count.rows[0].n === 0) console.warn('ATENCIÓN: no hay usuarios. Configura FIRST_ADMIN_EMAIL y FIRST_ADMIN_PASSWORD en Render y vuelve a desplegar.');
}

initDatabase().then(() => app.listen(PORT, () => console.log(`CraneGuard ERP escuchando en puerto ${PORT}`))).catch(err => { console.error('No se pudo iniciar CraneGuard:',err); process.exit(1); });
