# CraneGuard ERP · Build 9.1 · acciones funcionales

Este build corrige un problema de producción donde HTML/JS podía quedar desfasado por caché del navegador/Service Worker y varios botones parecían no ejecutar acciones.

Cambios:
- Desactiva y elimina el Service Worker legado y sus cachés.
- Desactiva caché de HTML/JS/API en Render durante esta etapa.
- Versiona `warehouse-phase1.js` y `reporting-production.js` con `?v=9.1.0`.
- Muestra errores JavaScript/operación en pantalla en vez de fallar silenciosamente.
- REQ-CG valida producto y cantidad, muestra estado `Procesando…`, éxito y error.
- Requisiciones ya no precargan cliente/hallazgo de demostración.
- Si no hay catálogo, la pantalla dirige a crear/importar una refacción en vez de enviar una requisición inválida.

## Despliegue
1. Sustituye el contenido del repositorio por este paquete.
2. Commit/push.
3. Render → Manual Deploy → Deploy latest commit.
4. Al abrir CraneGuard, usa Ctrl+F5 una vez. El propio build elimina el Service Worker legado.
5. Confirma que el encabezado muestre `Build 9.1`.

Si un botón falla, ahora aparecerá el error real en una banda roja inferior; ese texto permite diagnosticar el backend sin adivinar.
