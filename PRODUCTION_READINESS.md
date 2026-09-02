# CraneGuard ERP · Production Readiness

Estado: **NO declarar 100% productivo mientras exista cualquier módulo de esta lista pendiente.**

## Módulos con backend real actualmente

- Autenticación, sesiones, usuarios y roles: PostgreSQL.
- Clientes / expediente maestro: PostgreSQL (`erp_clients`).
- Almacén / Refacciones Fase 1: PostgreSQL.
- Requisiciones de compra, OC proveedor, recepciones, reservas, kardex e importación Excel: PostgreSQL.
- Formularios configurables: PostgreSQL.
- Plantillas de reporte: PostgreSQL.
- Reportes técnicos configurables y respuestas: PostgreSQL.
- Hallazgos generados por reglas de reportes: PostgreSQL.

## Módulos que existían como maqueta o lógica local y NO deben mostrarse en producción hasta migrarlos

### Operación
- Solicitudes de servicio.
- Conversión solicitud → Orden de Servicio.
- Asignación de responsable / acompañantes.
- Calendario operativo general.
- Apertura de servicio y tiempos.
- Actividades colaborativas de orden.
- Captura técnica fuera del motor nuevo de reportes.
- Hallazgos operativos fuera del motor nuevo de reportes.
- Cambios en campo / aprobaciones.
- Instalación de refacciones vinculada a OS con cantidades reales.

### Activos / contratos
- Catálogo maestro de equipos y componentes.
- Expediente de equipo.
- Pólizas / contratos / partidas / consumos.
- Calendarios por cliente, póliza y equipo.

### Comercial
- Cartera derivada de clientes con asignación formal vendedor → cliente.
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
- Biblioteca técnica en servidor (la versión heredada utilizaba IndexedDB/localStorage para algunos datos).
- Versionado documental completo en servidor.
- AI Guard con proveedor/modelo real, RAG y trazabilidad de fuente/modelo/confianza.
- NormGuard / FailureGuard / PartGuard como servicios de IA reales.

### Offline
- Cola offline real con sincronización, resolución de conflictos y preservación de autoría.
- El antiguo “simular offline” no debe considerarse funcionalidad productiva.

### Portal cliente
- Relación segura usuario cliente → cuenta / planta.
- Filtros server-side para que un cliente nunca pueda consultar datos de otro.
- Autorizaciones y entrega documental reales.

## Regla de entrega

`production-scope.js` limita el menú productivo a módulos que ya tienen persistencia real. Esta lista se debe ampliar **solo cuando el módulo correspondiente tenga:**

1. Tabla/esquema persistente o integración oficial.
2. API con permisos server-side.
3. UI de alta/edición/consulta.
4. Mensajes de éxito/error reales.
5. Auditoría mínima.
6. Prueba de recarga y prueba desde segunda sesión/equipo.
7. Estado vacío real sin datos hardcodeados.
8. Sin botones que únicamente ejecuten `toast(...)` o muten `localStorage`.

## Criterio para declarar “100% productivo”

Solo después de cerrar todos los puntos anteriores, ejecutar pruebas end-to-end por rol y documentar resultados. Hasta entonces, la app puede estar **operativa en alcance parcial**, pero no debe presentarse como alcance integral terminado.
