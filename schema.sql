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



CREATE SEQUENCE IF NOT EXISTS report_form_seq START 1;
CREATE SEQUENCE IF NOT EXISTS report_template_seq START 1;
CREATE SEQUENCE IF NOT EXISTS technical_report_seq START 1;
CREATE SEQUENCE IF NOT EXISTS report_finding_seq START 1;

CREATE TABLE IF NOT EXISTS report_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT,
  version_no INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'Borrador' CHECK(state IN ('Borrador','Publicado','Obsoleto')),
  config JSONB NOT NULL DEFAULT '{"questions":[]}'::jsonb,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code,version_no)
);
CREATE INDEX IF NOT EXISTS idx_report_forms_state ON report_forms(state,code,version_no DESC);

CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'Borrador' CHECK(state IN ('Borrador','Publicado','Obsoleto')),
  sla_days INTEGER NOT NULL DEFAULT 4,
  form_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  signatures JSONB NOT NULL DEFAULT '["Técnico responsable","Supervisor MKR","Cliente"]'::jsonb,
  pdf_mode TEXT NOT NULL DEFAULT 'Cliente + interno',
  repeat_per_equipment BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(code,version_no)
);
CREATE INDEX IF NOT EXISTS idx_report_templates_state ON report_templates(state,code,version_no DESC);

CREATE TABLE IF NOT EXISTS technical_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_code TEXT NOT NULL UNIQUE,
  os_ref TEXT,
  client TEXT NOT NULL,
  plant TEXT,
  asset TEXT NOT NULL,
  report_type TEXT,
  origin TEXT NOT NULL DEFAULT 'PD',
  status TEXT NOT NULL DEFAULT 'Borrador / no iniciado',
  priority TEXT NOT NULL DEFAULT 'Media',
  service_date DATE,
  due_date DATE,
  responsible TEXT,
  collaborator TEXT,
  reviewer TEXT,
  approver TEXT,
  template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  template_snapshot JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress JSONB NOT NULL DEFAULT '{"capture":0,"evidence":0,"findings":0,"review":0,"signatures":0}'::jsonb,
  revision TEXT NOT NULL DEFAULT 'Rev.0',
  block_reason TEXT,
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_technical_reports_dates ON technical_reports(due_date,status);
CREATE INDEX IF NOT EXISTS idx_technical_reports_client ON technical_reports(client,asset);

CREATE TABLE IF NOT EXISTS report_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_code TEXT NOT NULL UNIQUE,
  report_id UUID NOT NULL REFERENCES technical_reports(id) ON DELETE CASCADE,
  question_uid TEXT,
  equipment TEXT,
  component TEXT,
  severity TEXT NOT NULL DEFAULT 'MEDIO',
  state TEXT NOT NULL DEFAULT 'Borrador',
  original_text TEXT,
  condition_text TEXT,
  risk TEXT,
  recommendation TEXT,
  question_text TEXT,
  question_version TEXT,
  photo_data TEXT,
  validated BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(report_id,question_uid)
);
CREATE INDEX IF NOT EXISTS idx_report_findings_report ON report_findings(report_id,created_at);

