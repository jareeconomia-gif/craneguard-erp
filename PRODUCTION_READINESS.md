# CraneGuard ERP · Production Readiness

Estado: **alcance productivo incremental**. No declarar el ecosistema integral 100% productivo hasta cerrar todos los bloques pendientes de este documento.

## Módulos con backend real actualmente

### Seguridad y administración
- Autenticación y sesiones: PostgreSQL.
- Usuarios, contraseñas, roles y estado: PostgreSQL.

### Clientes
- Clientes / expediente maestro: PostgreSQL (`erp_clients`).
- Plantas, contactos y entidades de facturación dentro del expediente.

### Núcleo operativo · Build 10.3
- Solicitudes de servicio reales (`op_service_requests`).
- Conversión Solicitud → Orden de Servicio sin recaptura (`op_service_orders`).
- Programación de OS y calendario operativo.
- Responsable y acompañantes por orden (`op_order_team`).
- Bandeja restringida para técnicos asignados.
- Apertura de servicio: llegada, liberación, seguridad, recursos y tiempos (`op_service_openings`).
- Actividades colaborativas con responsable, progreso, captura y evidencia (`op_activities`).
- Hallazgos operativos con semáforo técnico y validación de Ingeniería (`op_findings`).
- Cambios en campo versionados y aprobables (`op_field_changes`).
- Cierre de OS con validaciones server-side.
- Auditoría operativa (`op_audit`).

### Almacén / compras proveedor
- Almacén / Refacciones Fase 1: PostgreSQL.
- Requisiciones de compra.
- OC proveedor.
- Recepciones.
- Reservas.
- Kardex.
- Importación Excel.

### Reportes configurables
- Formularios configurables: PostgreSQL.
- Plantillas de reporte: PostgreSQL.
- Reportes técnicos configurables y respuestas: PostgreSQL.
- Hallazgos generados por reglas de reportes: PostgreSQL.

## Bloques que siguen pendientes de migración a producción

### Activos / contratos
- Catálogo maestro de equipos y componentes.
- Expediente de equipo totalmente persistente.
- Pólizas / contratos / partidas / consumos.
- Calendarios por cliente, póliza y equipo construidos desde esas entidades.

### Integración Operación ↔ Reportes ↔ Refacciones
- Crear reporte directamente desde una OS productiva sin recaptura de cliente/planta/equipo/equipo técnico.
- Vincular hallazgo operativo con hallazgo de reporte cuando aplique.
- Solicitud de refacción desde hallazgo operativo.
- Instalación de refacciones vinculada a OS con cantidades reales.
- Cierre de hallazgo posterior a instalación/reinspección.

### Comercial
- Cartera derivada de asignación formal vendedor → cliente.
- Oportunidades comerciales.
- Cotizaciones cliente.
- OC cliente.
- Autorizaciones de cliente.
- Embudo comercial real.

### Financiero
- Remisiones.
- Facturación.
- Cobranza / pagos.
- Cierre contractual / extraordinario.

### Ingeniería / IA
- Biblioteca técnica en servidor; la versión heredada utiliza IndexedDB/localStorage para algunos archivos/datos.
- Versionado documental completo en servidor.
- AI Guard con proveedor/modelo real, recuperación documental y trazabilidad de fuente/modelo/confianza.
- NormGuard / FailureGuard / PartGuard como servicios de IA reales.

### Offline
- Cola offline real con sincronización.
- Resolución de conflictos.
- Preservación de autoría y evidencia.
- El antiguo “simular offline” no se considera funcionalidad productiva.

### Portal cliente
- Relación segura usuario cliente → cuenta / planta.
- Filtros server-side para impedir acceso cruzado.
- Autorizaciones y entrega documental reales.

## Regla de entrega

`production-scope.js` limita el menú base a módulos productivos. `operations-production.js` amplía esa lista únicamente con el núcleo operativo Build 10.3, que ya tiene persistencia y API.

Un módulo puede incorporarse a producción solo cuando tenga:

1. Tabla/esquema persistente o integración oficial.
2. API con permisos server-side.
3. UI de alta/edición/consulta.
4. Mensajes de éxito/error reales.
5. Auditoría mínima.
6. Prueba de recarga y prueba desde segunda sesión/equipo.
7. Estado vacío real sin datos hardcodeados.
8. Sin botones que únicamente ejecuten `toast(...)` o muten `localStorage`.

## Validación automática

`.github/workflows/validate.yml` ejecuta `node --check` sobre los archivos JavaScript críticos en cada push a `main` y pull request.

## Criterio para declarar “100% productivo”

Solo después de cerrar todos los bloques pendientes y ejecutar pruebas end-to-end por rol. Mientras tanto, CraneGuard ERP es productivo en los módulos habilitados, sin presentar módulos heredados de maqueta como terminados.
