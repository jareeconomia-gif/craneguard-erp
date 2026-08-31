# CraneGuard ERP · Almacén Fase 1 · Refacciones

Esta versión integra el alcance Fase 1 de Almacén: catálogo, existencias, reservas, requisiciones, OC proveedor, PDF de OC, recepciones parciales, material en tránsito, listo para instalar, Kardex, importación Excel y validación humana de PartGuard/StockGuard.

## Fuera de alcance en esta versión
Herramientas, EPP, resguardos, préstamos, NFC, kits por técnico y calibraciones.

## Dependencias nuevas
- `multer`: carga temporal en memoria para PDF de OC y Excel.
- `xlsx`: lectura de inventario Excel.

## Base de datos
`db/schema.sql` crea las tablas de Almacén. `server.js` también incluye el esquema como respaldo para Render.

## Prueba
Entra como Administrador y abre **Almacén Fase 1 → Caso de prueba**. Se crean como semilla DEMO-001 (existencia 2) y KIT-FR-DEMO (existencia 0).

## Importante para Render
Al actualizar el repo, Render ejecutará `npm install` e instalará las dos dependencias nuevas. No borres `package.json`, `server.js`, `db/` ni `public/`.
