# FIX 9.2 — Botones sin respuesta

## Causa real
Helmet agrega por defecto `script-src-attr 'none'` a Content Security Policy. CraneGuard usa actualmente atributos `onclick` en botones generados dinámicamente. El navegador mostraba la pantalla, pero bloqueaba cada acción de clic.

## Corrección
En `server.js` se agregó explícitamente:

```js
scriptSrcAttr: ["'unsafe-inline'"]
```

El build cambia a **9.2.0**. En la app debe aparecer **BUILD 9.2 · CLICKS ACTIVOS**.

## Despliegue
1. Reemplazar el contenido del repo GitHub con este paquete.
2. Commit/push.
3. Render → Manual Deploy → Deploy latest commit.
4. Abrir la app con Ctrl+F5.
5. Confirmar que aparezca BUILD 9.2 · CLICKS ACTIVOS.

No requiere nuevas variables ni modificar PostgreSQL.
