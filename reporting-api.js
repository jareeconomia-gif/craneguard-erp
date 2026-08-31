const crypto = require('crypto');

const REPORTING_SCHEMA_SQL = `
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
`;

function clean(v){ return String(v ?? '').trim(); }
function rev(v){ return 'Rev.' + Number(v || 1); }
function dateText(v){ try{return v ? new Date(v).toLocaleDateString('es-MX') : ''}catch{return ''} }
function nextRevision(v){ return Number(v || 1) + 1; }
function codePad(prefix,n,digits=3){ return `${prefix}-${String(n).padStart(digits,'0')}`; }
function formView(r){
  const cfg=r.config||{};
  return {uid:r.id,code:r.code,name:r.name,category:r.category,description:r.description||'',version:rev(r.version_no),versionNo:r.version_no,state:r.state,date:dateText(r.updated_at),owner:r.owner_name||'',uses:Number(r.uses||0),questions:Array.isArray(cfg.questions)?cfg.questions:[],audit:Array.isArray(cfg.audit)?cfg.audit:[]};
}
function templateView(r){
  const cfg=r.config||{};
  return {uid:r.id,code:r.code,name:r.name,version:rev(r.version_no),versionNo:r.version_no,state:r.state,sla:Number(r.sla_days||4),formRefs:Array.isArray(r.form_refs)?r.form_refs:[],forms:Array.isArray(cfg.forms)?cfg.forms:[],signatures:Array.isArray(r.signatures)?r.signatures:[],pdf:r.pdf_mode||'Cliente + interno',repeatPerEquipment:r.repeat_per_equipment!==false,pdfSections:Array.isArray(cfg.pdfSections)?cfg.pdfSections:['Resumen','Hallazgos','Evidencias','Firmas'],audit:Array.isArray(cfg.audit)?cfg.audit:[]};
}
function reportView(r){
  const snap=r.template_snapshot||{}, p=r.progress||{};
  return {uid:r.id,id:r.report_code,os:r.os_ref||'',client:r.client||'',plant:r.plant||'',equipment:[r.asset],asset:r.asset||'',type:r.report_type||snap.name||'Reporte técnico',origin:r.origin||'PD',status:r.status||'Borrador / no iniciado',priority:r.priority||'Media',serviceDate:r.service_date?String(r.service_date).slice(0,10):'',due:r.due_date?String(r.due_date).slice(0,10):'',responsible:r.responsible||'',collaborator:r.collaborator||'',reviewer:r.reviewer||'',approver:r.approver||'',template:(snap.code||'')+' '+(snap.version||''),revision:r.revision||'Rev.0',delivered:!!r.delivered,progressParts:{capture:Number(p.capture||0),evidence:Number(p.evidence||0),findings:Number(p.findings||0),review:Number(p.review||0),signatures:Number(p.signatures||0)},last:r.updated_at?new Date(r.updated_at).toLocaleString('es-MX'):'',block:r.block_reason||'',answers:r.answers||{},templateSnapshot:snap,documentRefs:[],signaturesData:{}};
}
function findingView(r){return {uid:r.id,id:r.finding_code,report:r.report_code,equipment:r.equipment||'',component:r.component||'',severity:r.severity||'MEDIO',state:r.state||'Borrador',condition:r.condition_text||'',originalText:r.original_text||'',questionText:r.question_text||'',questionVersion:r.question_version||'',risk:r.risk||'Pendiente de validación técnica.',recommendation:r.recommendation||'Validar criterio y definir acción.',validated:!!r.validated,installed:false,photoData:r.photo_data||''}}
function ruleTriggered(rule,value){if(!rule?.enabled)return false;const v=String(value??''),target=String(rule.value??'');if(rule.operator==='equals')return v.toLowerCase()===target.toLowerCase();const a=Number(v),b=Number(target);if(!Number.isFinite(a)||!Number.isFinite(b))return false;return rule.operator==='lt'?a<b:rule.operator==='lte'?a<=b:rule.operator==='gt'?a>b:rule.operator==='gte'?a>=b:false;}

function registerReporting(app,{pool,requireAuth,requireRoles,audit}){
  const editor=requireRoles('admin','coord','engineering');
  const creator=requireRoles('admin','coord','engineering','tech_resp');
  const capturer=requireRoles('admin','coord','engineering','tech_resp','tech_comp');

  app.get('/api/reporting/bootstrap', requireAuth, async (req,res,next)=>{try{
    const [f,t,r,fi]=await Promise.all([
      pool.query(`SELECT f.*,u.full_name owner_name,(SELECT COUNT(*) FROM report_templates rt WHERE rt.form_refs ? f.id::text)::int uses FROM report_forms f LEFT JOIN app_users u ON u.id=f.created_by ORDER BY f.code,f.version_no DESC`),
      pool.query(`SELECT * FROM report_templates ORDER BY code,version_no DESC`),
      pool.query(`SELECT * FROM technical_reports ORDER BY created_at DESC LIMIT 500`),
      pool.query(`SELECT rf.*,tr.report_code FROM report_findings rf JOIN technical_reports tr ON tr.id=rf.report_id ORDER BY rf.created_at DESC LIMIT 1000`)
    ]);
    res.json({forms:f.rows.map(formView),templates:t.rows.map(templateView),reports:r.rows.map(reportView),findings:fi.rows.map(findingView)});
  }catch(e){next(e)}});

  app.get('/api/reporting/forms', requireAuth, async(req,res,next)=>{try{const {rows}=await pool.query(`SELECT f.*,u.full_name owner_name FROM report_forms f LEFT JOIN app_users u ON u.id=f.created_by ORDER BY f.code,f.version_no DESC`);res.json({forms:rows.map(formView)})}catch(e){next(e)}});
  app.post('/api/reporting/forms', requireAuth, editor, async(req,res,next)=>{try{
    const seq=(await pool.query(`SELECT nextval('report_form_seq') n`)).rows[0].n;
    const code=clean(req.body.code)||codePad('FRM',seq,3), name=clean(req.body.name)||'Nuevo formulario', category=clean(req.body.category)||'General';
    const {rows}=await pool.query(`INSERT INTO report_forms(code,name,category,description,config,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *`,[code,name,category,clean(req.body.description),{questions:[],audit:[]},req.user.id]);
    await audit(req,'REPORT_FORM_CREATED',null,{id:rows[0].id,code});res.status(201).json({form:formView({...rows[0],owner_name:req.user.full_name})});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'Ya existe esa revisión del formulario.'});next(e)}});
  app.patch('/api/reporting/forms/:id', requireAuth, editor, async(req,res,next)=>{try{
    const cur=(await pool.query('SELECT * FROM report_forms WHERE id=$1',[req.params.id])).rows[0];if(!cur)return res.status(404).json({error:'Formulario no encontrado.'});if(cur.state==='Publicado'||cur.state==='Obsoleto')return res.status(409).json({error:'Una revisión publicada/histórica no se edita. Crea una nueva revisión.'});
    const config={...(cur.config||{}),questions:Array.isArray(req.body.questions)?req.body.questions:(cur.config?.questions||[]),audit:Array.isArray(req.body.audit)?req.body.audit:(cur.config?.audit||[])};
    const {rows}=await pool.query(`UPDATE report_forms SET code=$1,name=$2,category=$3,description=$4,config=$5,updated_by=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,[clean(req.body.code)||cur.code,clean(req.body.name)||cur.name,clean(req.body.category)||cur.category,req.body.description??cur.description,config,req.user.id,req.params.id]);
    res.json({form:formView({...rows[0],owner_name:req.user.full_name})});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'Ese código/revisión ya existe.'});next(e)}});
  app.post('/api/reporting/forms/:id/publish', requireAuth, editor, async(req,res,next)=>{const c=await pool.connect();try{
    await c.query('BEGIN');const cur=(await c.query('SELECT * FROM report_forms WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!cur){await c.query('ROLLBACK');return res.status(404).json({error:'Formulario no encontrado.'})}if(cur.state!=='Borrador'){await c.query('ROLLBACK');return res.status(409).json({error:'Solo una revisión en borrador puede publicarse.'})}
    const qs=cur.config?.questions||[];if(!qs.length){await c.query('ROLLBACK');return res.status(400).json({error:'Agrega al menos una pregunta antes de publicar.'})}const invalid=qs.find(q=>!clean(q.text)||!clean(q.type)||(q.ruleConfig?.enabled&&!clean(q.ruleConfig?.value)));if(invalid){await c.query('ROLLBACK');return res.status(400).json({error:'Hay preguntas o reglas incompletas.'})}
    await c.query(`UPDATE report_forms SET state='Obsoleto',updated_at=NOW() WHERE code=$1 AND state='Publicado' AND id<>$2`,[cur.code,cur.id]);
    const {rows}=await c.query(`UPDATE report_forms SET state='Publicado',published_at=NOW(),updated_by=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[req.user.id,cur.id]);await c.query('COMMIT');await audit(req,'REPORT_FORM_PUBLISHED',null,{id:cur.id,code:cur.code,version:cur.version_no});res.json({form:formView({...rows[0],owner_name:req.user.full_name})});
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}});
  app.post('/api/reporting/forms/:id/revision', requireAuth, editor, async(req,res,next)=>{try{
    const cur=(await pool.query('SELECT * FROM report_forms WHERE id=$1',[req.params.id])).rows[0];if(!cur)return res.status(404).json({error:'Formulario no encontrado.'});const next=Number((await pool.query('SELECT COALESCE(MAX(version_no),0)+1 n FROM report_forms WHERE code=$1',[cur.code])).rows[0].n);
    const {rows}=await pool.query(`INSERT INTO report_forms(code,name,category,description,version_no,state,config,created_by,updated_by) VALUES($1,$2,$3,$4,$5,'Borrador',$6,$7,$7) RETURNING *`,[cur.code,cur.name,cur.category,cur.description,next,cur.config,req.user.id]);res.status(201).json({form:formView({...rows[0],owner_name:req.user.full_name})});
  }catch(e){next(e)}});

  app.get('/api/reporting/templates', requireAuth, async(req,res,next)=>{try{const {rows}=await pool.query('SELECT * FROM report_templates ORDER BY code,version_no DESC');res.json({templates:rows.map(templateView)})}catch(e){next(e)}});
  app.post('/api/reporting/templates', requireAuth, editor, async(req,res,next)=>{try{
    const seq=(await pool.query(`SELECT nextval('report_template_seq') n`)).rows[0].n,code=clean(req.body.code)||codePad('TPL',seq,3),name=clean(req.body.name)||'Nueva plantilla';
    const {rows}=await pool.query(`INSERT INTO report_templates(code,name,created_by,updated_by) VALUES($1,$2,$3,$3) RETURNING *`,[code,name,req.user.id]);res.status(201).json({template:templateView(rows[0])});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'Ya existe esa revisión de plantilla.'});next(e)}});
  app.patch('/api/reporting/templates/:id', requireAuth, editor, async(req,res,next)=>{try{
    const cur=(await pool.query('SELECT * FROM report_templates WHERE id=$1',[req.params.id])).rows[0];if(!cur)return res.status(404).json({error:'Plantilla no encontrada.'});if(cur.state!=='Borrador')return res.status(409).json({error:'Una plantilla publicada/histórica no se edita. Crea nueva revisión.'});
    const refs=Array.isArray(req.body.formRefs)?req.body.formRefs:(cur.form_refs||[]),signs=Array.isArray(req.body.signatures)?req.body.signatures:(cur.signatures||[]),cfg={...(cur.config||{}),forms:req.body.forms||cur.config?.forms||[],pdfSections:req.body.pdfSections||cur.config?.pdfSections||[]};
    const {rows}=await pool.query(`UPDATE report_templates SET code=$1,name=$2,sla_days=$3,form_refs=$4,signatures=$5,pdf_mode=$6,repeat_per_equipment=$7,config=$8,updated_by=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,[clean(req.body.code)||cur.code,clean(req.body.name)||cur.name,Number(req.body.sla||cur.sla_days||4),JSON.stringify(refs),JSON.stringify(signs),clean(req.body.pdf)||cur.pdf_mode,req.body.repeatPerEquipment!==undefined?!!req.body.repeatPerEquipment:cur.repeat_per_equipment,cfg,req.user.id,req.params.id]);res.json({template:templateView(rows[0])});
  }catch(e){if(e.code==='23505')return res.status(409).json({error:'Ese código/revisión ya existe.'});next(e)}});
  app.post('/api/reporting/templates/:id/publish', requireAuth, editor, async(req,res,next)=>{const c=await pool.connect();try{
    await c.query('BEGIN');const cur=(await c.query('SELECT * FROM report_templates WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!cur){await c.query('ROLLBACK');return res.status(404).json({error:'Plantilla no encontrada.'})}if(cur.state!=='Borrador'){await c.query('ROLLBACK');return res.status(409).json({error:'Solo un borrador puede publicarse.'})}const refs=cur.form_refs||[];if(!refs.length){await c.query('ROLLBACK');return res.status(400).json({error:'Agrega al menos un formulario publicado.'})}
    const valid=(await c.query(`SELECT COUNT(*)::int n FROM report_forms WHERE id=ANY($1::uuid[]) AND state='Publicado'`,[refs])).rows[0].n;if(valid!==refs.length){await c.query('ROLLBACK');return res.status(400).json({error:'Todos los formularios incluidos deben estar publicados.'})}
    await c.query(`UPDATE report_templates SET state='Obsoleto',updated_at=NOW() WHERE code=$1 AND state='Publicado' AND id<>$2`,[cur.code,cur.id]);const {rows}=await c.query(`UPDATE report_templates SET state='Publicado',published_at=NOW(),updated_by=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,[req.user.id,cur.id]);await c.query('COMMIT');res.json({template:templateView(rows[0])});
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}});
  app.post('/api/reporting/templates/:id/revision', requireAuth, editor, async(req,res,next)=>{try{
    const cur=(await pool.query('SELECT * FROM report_templates WHERE id=$1',[req.params.id])).rows[0];if(!cur)return res.status(404).json({error:'Plantilla no encontrada.'});const next=Number((await pool.query('SELECT COALESCE(MAX(version_no),0)+1 n FROM report_templates WHERE code=$1',[cur.code])).rows[0].n);const {rows}=await pool.query(`INSERT INTO report_templates(code,name,version_no,state,sla_days,form_refs,signatures,pdf_mode,repeat_per_equipment,config,created_by,updated_by) VALUES($1,$2,$3,'Borrador',$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,[cur.code,cur.name,next,cur.sla_days,JSON.stringify(cur.form_refs||[]),JSON.stringify(cur.signatures||[]),cur.pdf_mode,cur.repeat_per_equipment,cur.config,req.user.id]);res.status(201).json({template:templateView(rows[0])});
  }catch(e){next(e)}});

  app.get('/api/reporting/reports', requireAuth, async(req,res,next)=>{try{const {rows}=await pool.query('SELECT * FROM technical_reports ORDER BY created_at DESC LIMIT 500');res.json({reports:rows.map(reportView)})}catch(e){next(e)}});
  app.post('/api/reporting/reports', requireAuth, creator, async(req,res,next)=>{const c=await pool.connect();try{
    await c.query('BEGIN');const tpl=(await c.query(`SELECT * FROM report_templates WHERE id=$1 AND state='Publicado' FOR SHARE`,[req.body.templateId])).rows[0];if(!tpl){await c.query('ROLLBACK');return res.status(400).json({error:'Selecciona una plantilla publicada.'})}const refs=tpl.form_refs||[],formRows=[];for(const id of refs){const f=(await c.query('SELECT * FROM report_forms WHERE id=$1',[id])).rows[0];if(!f){await c.query('ROLLBACK');return res.status(400).json({error:'La plantilla contiene un formulario no disponible.'})}formRows.push(formView(f))}
    const snapshot={uid:tpl.id,code:tpl.code,name:tpl.name,version:rev(tpl.version_no),state:tpl.state,sla:Number(tpl.sla_days),formRefs:refs,signatures:tpl.signatures||[],pdf:tpl.pdf_mode,repeatPerEquipment:tpl.repeat_per_equipment,formsSnapshot:formRows};
    const seq=(await c.query(`SELECT nextval('technical_report_seq') n`)).rows[0].n,code=`REP-${new Date().getFullYear()}-${String(seq).padStart(5,'0')}`;
    const {rows}=await c.query(`INSERT INTO technical_reports(report_code,os_ref,client,plant,asset,report_type,origin,status,priority,service_date,due_date,responsible,collaborator,reviewer,approver,template_id,template_snapshot,block_reason,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,'Borrador / no iniciado',$8,$9,$10,$11,$12,$13,$14,$15,$16,'Captura no iniciada',$17,$17) RETURNING *`,[code,clean(req.body.os),clean(req.body.client),clean(req.body.plant),clean(req.body.asset),tpl.name,clean(req.body.origin)||'PD',clean(req.body.priority)||'Media',req.body.serviceDate||null,req.body.due||null,clean(req.body.responsible),clean(req.body.collaborator),clean(req.body.reviewer),clean(req.body.approver),tpl.id,snapshot,req.user.id]);await c.query('COMMIT');await audit(req,'TECHNICAL_REPORT_CREATED',null,{report_code:code,template:tpl.code});res.status(201).json({report:reportView(rows[0])});
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}});
  app.get('/api/reporting/reports/:id', requireAuth, async(req,res,next)=>{try{const r=(await pool.query('SELECT * FROM technical_reports WHERE id::text=$1 OR report_code=$1',[req.params.id])).rows[0];if(!r)return res.status(404).json({error:'Reporte no encontrado.'});const fi=await pool.query(`SELECT rf.*,tr.report_code FROM report_findings rf JOIN technical_reports tr ON tr.id=rf.report_id WHERE rf.report_id=$1 ORDER BY rf.created_at`,[r.id]);res.json({report:reportView(r),findings:fi.rows.map(findingView)})}catch(e){next(e)}});
  app.patch('/api/reporting/reports/:id', requireAuth, capturer, async(req,res,next)=>{try{const cur=(await pool.query('SELECT * FROM technical_reports WHERE id::text=$1 OR report_code=$1',[req.params.id])).rows[0];if(!cur)return res.status(404).json({error:'Reporte no encontrado.'});const {rows}=await pool.query(`UPDATE technical_reports SET status=COALESCE($1,status),answers=COALESCE($2,answers),progress=COALESCE($3,progress),block_reason=COALESCE($4,block_reason),delivered=COALESCE($5,delivered),updated_by=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,[req.body.status||null,req.body.answers||null,req.body.progress||null,req.body.block??null,req.body.delivered===undefined?null:!!req.body.delivered,req.user.id,cur.id]);res.json({report:reportView(rows[0])})}catch(e){next(e)}});
  app.post('/api/reporting/reports/:id/capture', requireAuth, capturer, async(req,res,next)=>{const c=await pool.connect();try{
    await c.query('BEGIN');const r=(await c.query('SELECT * FROM technical_reports WHERE id::text=$1 OR report_code=$1 FOR UPDATE',[req.params.id])).rows[0];if(!r){await c.query('ROLLBACK');return res.status(404).json({error:'Reporte no encontrado.'})}const answers=req.body.answers&&typeof req.body.answers==='object'?req.body.answers:{},forms=r.template_snapshot?.formsSnapshot||[];let required=0,done=0,evidenceReq=0,evidenceDone=0;
    for(const f of forms){for(const q of (f.questions||[])){const key=`${f.uid}::${q.uid}::${r.asset}`,a=answers[key]||{};if(q.required){required++;if(clean(a.value)||a.photoData)done++}const trig=ruleTriggered(q.ruleConfig,a.value);if(trig&&q.ruleConfig?.enabled){if(q.ruleConfig.requirePhoto){evidenceReq++;if(a.photoData)evidenceDone++}if(q.ruleConfig.requireComment){evidenceReq++;if(clean(a.comment))evidenceDone++}if(q.ruleConfig.createFinding){let ex=(await c.query('SELECT id FROM report_findings WHERE report_id=$1 AND question_uid=$2',[r.id,q.uid])).rows[0];if(!ex){const seq=(await c.query(`SELECT nextval('report_finding_seq') n`)).rows[0].n,fc=`H-CG-${new Date().getFullYear()}-${String(seq).padStart(5,'0')}`;await c.query(`INSERT INTO report_findings(finding_code,report_id,question_uid,equipment,component,severity,state,original_text,condition_text,risk,recommendation,question_text,question_version,photo_data,created_by) VALUES($1,$2,$3,$4,$5,$6,'Borrador',$7,$8,'Pendiente de validación técnica.','Validar criterio y definir acción.',$9,$10,$11,$12)`,[fc,r.id,q.uid,r.asset,q.component||q.system||q.text,q.ruleConfig.severity||'MEDIO',clean(a.comment)||String(a.value??''),clean(a.comment)||('Respuesta: '+String(a.value??'')),q.text,`${f.code} ${f.version}`,a.photoData||null,req.user.id])}}}}
    }
    const fcount=Number((await c.query('SELECT COUNT(*)::int n FROM report_findings WHERE report_id=$1',[r.id])).rows[0].n),progress={capture:required?Math.round(done/required*100):100,evidence:evidenceReq?Math.round(evidenceDone/evidenceReq*100):100,findings:fcount?50:100,review:Number(r.progress?.review||0),signatures:Number(r.progress?.signatures||0)},status=(done<required||evidenceDone<evidenceReq)?'Pendiente de completar':'En revisión técnica',block=done<required?'Preguntas obligatorias pendientes':evidenceDone<evidenceReq?'Evidencia requerida pendiente':'Enviar a revisión';
    const out=(await c.query(`UPDATE technical_reports SET answers=$1,progress=$2,status=$3,block_reason=$4,updated_by=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[answers,progress,status,block,req.user.id,r.id])).rows[0];const fi=await c.query(`SELECT rf.*,tr.report_code FROM report_findings rf JOIN technical_reports tr ON tr.id=rf.report_id WHERE rf.report_id=$1 ORDER BY rf.created_at`,[r.id]);await c.query('COMMIT');res.json({report:reportView(out),findings:fi.rows.map(findingView)});
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}});
}

module.exports={REPORTING_SCHEMA_SQL,registerReporting};
