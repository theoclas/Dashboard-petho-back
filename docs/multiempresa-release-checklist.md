# Checklist de despliegue multiempresa

## Antes de desplegar
- Respaldar base de datos (snapshot).
- Verificar variables de entorno en backend (`JWT_SECRET`, `DB_*`, `IMPORT_WIPE_SECRET`).
- Confirmar versión de frontend apuntando al backend correcto (`VITE_API_URL`).

## Migración de base de datos
- Ejecutar migración `1777000000000-MultiEmpresaBase`.
- Confirmar creación de tablas `empresas` y `user_empresas`.
- Confirmar columnas `empresa_id` en `pedidos`, `cpas`, `productos_detalle`, `cartera_movimientos`, `notas_manuales`, `mapeo_estados`.
- Validar índices compuestos (`pedidos` por `empresa_id + id_dropi`).

## Validación funcional rápida
- Login paso 1 devuelve empresas del usuario.
- Login paso 2 emite token con empresa activa.
- Cambio de empresa (`/auth/switch-company`) actualiza token y contexto.
- Listados de `pedidos` y `cpa` no muestran datos cruzados entre empresas.
- Reportes de logística y rentabilidad responden solo con datos de la empresa activa.
- Importaciones cargan datos únicamente en la empresa activa.

## Rollback
- Si falla la migración o el arranque, restaurar snapshot de BD.
- Revertir deployment backend/frontend a versión previa estable.
- Invalidar sesiones activas (rotar `JWT_SECRET` si hubo inconsistencia de tokens).
