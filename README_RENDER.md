# CraneGuard ERP V6 · Render + PostgreSQL

Esta versión **no usa Supabase**. El login, roles, contraseñas, sesiones y administración de usuarios se ejecutan en el backend Node.js de CraneGuard y se guardan en PostgreSQL de Render.

## Arquitectura
- Render Web Service: `server.js` (Node.js / Express).
- Render PostgreSQL: usuarios y sesiones.
- Cookie de sesión HttpOnly, Secure en producción y SameSite=Lax.
- Contraseñas con bcrypt (12 rounds).
- Rate limiting en el login.
- Roles siempre validados en servidor.
- Administrador puede crear usuarios, cambiar rol, activar/desactivar y asignar una nueva contraseña temporal.

## Subir a Render
### Opción recomendada: Blueprint
1. Sube esta carpeta a un repositorio GitHub.
2. En Render: **New > Blueprint**.
3. Selecciona el repositorio. Render leerá `render.yaml` y creará:
   - `craneguard-erp` (Web Service)
   - `craneguard-db` (PostgreSQL)
4. Cuando Render solicite las variables no sincronizadas, define:
   - `FIRST_ADMIN_EMAIL` = correo del primer administrador.
   - `FIRST_ADMIN_PASSWORD` = contraseña temporal de al menos 10 caracteres.
   - `FIRST_ADMIN_NAME` = nombre del administrador.
5. Despliega.
6. Abre la URL pública de Render e inicia sesión. En el primer acceso se obliga a cambiar la contraseña temporal.
7. Después entra a **Administración > Usuarios y permisos** para crear el resto de usuarios.
8. Una vez creado el primer administrador, elimina `FIRST_ADMIN_PASSWORD` de las variables de entorno de Render. El administrador ya permanece guardado en PostgreSQL.

### Si creas los servicios manualmente
Web Service:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/health`

Variables:
- `DATABASE_URL`: Internal Database URL de tu PostgreSQL de Render.
- `DATABASE_SSL=false` si usas la Internal Database URL. Si usas una URL externa con TLS, cambia a `true`.
- `SESSION_SECRET`: valor aleatorio de 32+ caracteres.
- `NODE_ENV=production`.
- `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD`, `FIRST_ADMIN_NAME` únicamente para crear el primer administrador.

## Login y usuarios
El usuario ya no selecciona su rol. Escribe correo y contraseña. El backend consulta PostgreSQL y devuelve únicamente el rol asignado.

El Administrador puede:
- Crear usuarios reales.
- Asignar Administrador, Dirección, Ventas, Jefe de Ventas, Coordinación, Técnico, Ingeniería, Almacén, Compras o Cliente.
- Activar/desactivar usuarios.
- Cambiar roles.
- Generar una nueva contraseña temporal.

## Importante
Esta versión hace real el **control de acceso y usuarios** en Render/PostgreSQL. Los datos operativos históricos del prototipo (órdenes, pólizas, hallazgos, formularios, etc.) siguen teniendo partes que usan `localStorage`. Antes de usar CraneGuard como ERP multiusuario completo, esas entidades deben migrarse también a PostgreSQL/API para que todos los usuarios vean el mismo dato en tiempo real.
