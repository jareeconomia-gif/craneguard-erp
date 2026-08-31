# Reportes configurables reales

Esta versión mueve Formularios, Plantillas y Reportes a PostgreSQL.

Flujo de prueba:
1. Inicia sesión como Administrador.
2. Reportes → Formularios → Nuevo formulario.
3. Agrega preguntas y configura parámetros/reglas.
4. Guarda y publica.
5. Reportes → Constructor plantilla → Nueva plantilla.
6. Agrega el formulario publicado, guarda y publica.
7. Reportes → Crear reporte.
8. Captura cliente/equipo, selecciona plantilla y crea.
9. Responde las preguntas y pulsa Guardar / evaluar reglas.
10. El reporte, respuestas y hallazgos quedan guardados en PostgreSQL y son visibles para otros usuarios autorizados.

No se requiere ejecutar SQL manual: server.js ejecuta las migraciones con CREATE TABLE IF NOT EXISTS en cada despliegue.
