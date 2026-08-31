# CraneGuard ERP — Producción

Repositorio productivo para Render + PostgreSQL.

## Despliegue
1. Subir el contenido de esta carpeta a la raíz del repositorio de GitHub.
2. En Render usar Blueprint (`render.yaml`) o Web Service Node.
3. Mantener `DATABASE_URL`, `SESSION_SECRET` y las variables del primer administrador.
4. Health check: `/health`.

## Seguridad
- Autenticación real y sesiones de servidor.
- Roles administrados desde CraneGuard.
- Contraseñas con bcrypt.
- Almacén/Refacciones Fase 1 respaldado por PostgreSQL.

## Nota de arquitectura
La interfaz productiva no carga datos demostrativos. Algunos módulos históricos del prototipo aún requieren migración de persistencia local a PostgreSQL para operación multiusuario completa. No se deben reactivar datos de prueba en producción.
