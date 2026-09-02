# CraneGuard ERP · Production Readiness

Estado: **Release Candidate integral 11.3**.

La aplicación ya no depende de pantallas de maqueta para los módulos habilitados. Las acciones productivas están respaldadas por PostgreSQL/API, permisos server-side, estados vacíos reales y mensajes de error/éxito.

## Alcance productivo

### Seguridad y administración
- Autenticación y sesiones PostgreSQL.
- Usuarios, roles, activación y contraseñas.
- Administrador inicial por variables seguras de Render.
- Auditoría de autenticación.

### Clientes
- Expediente maestro de clientes.
- Plantas, contactos, facturación, crédito y vendedor.

### Activos
- Alta y expediente de grúas/polipastos.
- Componentes.
- Fabricante, modelo, serie, capacidad, criticidad y semáforo técnico.
- Próxima inspección e historial de servicio.

### Contratos / pólizas
- Pólizas y contratos.
- Partidas, cantidades y precios.
- Consumo de partida con validación contra cantidad contratada.
- Fechas de vigencia integradas al calendario maestro.

### Operación
- Solicitud de servicio.
- Solicitud → Orden de Servicio sin recaptura.
- Programación y calendario.
- Responsable + acompañantes.
- Bandeja restringida de técnicos.
- Apertura de servicio y tiempos.
- Actividades colaborativas.
- Hallazgos y semáforo técnico.
- Validación de Ingeniería para ROJO.
- Cambios en campo versionados.
- Cierre de OS con validaciones server-side.
- Auditoría operativa.

### Reportes
- Formularios configurables y versionados.
- Plantillas configurables y versionadas.
- Reportes técnicos persistentes.
- Captura y hallazgos por reglas.
- Creación de reporte desde OS sin recaptura.
- Entrega de reportes liberados al portal cliente.

### Refacciones / almacén / compras
- Catálogo y existencias.
- Reservas.
- Requisiciones.
- OC proveedor.
- Recepciones.
- Kardex.
- Importación Excel.
- Solicitud de refacción vinculable a OS/hallazgo.
- Instalación y reinspección/cierre de hallazgo.

### Comercial
- Oportunidades.
- Embudo comercial.
- Cotizaciones cliente.
- Registro de OC cliente y autorización de cotización.
- Seguimiento comercial.

### Financiero
- Remisiones, facturas, notas de crédito y extraordinarios.
- Vencimientos.
- Pagos/cobranza.
- Saldo calculado desde documentos y pagos reales.

### Biblioteca Técnica / AI Guard
- Documentos técnicos en PostgreSQL.
- Archivo original y revisiones/versiones.
- Estado Vigente/Obsoleto y autorización para consulta.
- AI Guard documental en modo **Retrieval controlado**, limitado a fuentes autorizadas.
- La interpretación técnica mantiene validación humana.

> Nota: un modelo generativo externo no se simula. Si MKR desea generación LLM, debe configurarse un proveedor/API autorizado; la aplicación ya funciona sin inventar respuestas y conserva el soporte documental controlado.

### Offline
- PWA/service worker.
- Cola IndexedDB para escrituras de Operación y Enterprise.
- Conserva usuario y hora original de captura.
- Reintento automático al recuperar internet.
- Conflictos 409 visibles.
- Resolución explícita: conservar cambio local/reintentar o descartar local.
- Historial server-side de sincronización (`offline_sync_log`).

### Portal cliente
- Vinculación server-side usuario → cliente.
- Filtro de cuenta en servidor.
- Equipos, servicios, cotizaciones, autorizaciones y estado financiero.
- Reportes entregados filtrados por la cuenta vinculada.

### Calendario Maestro
- Órdenes de Servicio programadas.
- Próximas inspecciones.
- Fin de pólizas.
- Vencimientos financieros.

## Pruebas automáticas

`.github/workflows/validate.yml` ejecuta en cada push/PR:

1. `node --check` de backend y frontend productivo.
2. Generación y validación de la versión final de `enterprise-production.js`.
3. PostgreSQL 16 completamente vacío.
4. Arranque desde cero.
5. Health check.
6. Login real del administrador.
7. Pruebas HTTP sobre Clientes, Operación, Enterprise, Reportes, Almacén y Offline.

Un fallo en cualquiera de estas pruebas deja el workflow en rojo.

## Criterio de entrega

Código: **Release Candidate integral**.

Antes de entrega formal a cliente, ejecutar UAT en Render con un usuario por rol y un caso real completo: Cliente → Solicitud → OS → Apertura → Actividad → Hallazgo → Reporte → Refacción/Compra → Instalación → Cierre → Cotización/OC → Factura/Pago → Portal.

No se deben reactivar pantallas heredadas que no estén mapeadas a las capas productivas.
