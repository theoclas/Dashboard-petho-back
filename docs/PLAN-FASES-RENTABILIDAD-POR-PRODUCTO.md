# Plan por fases — Rentabilidad por producto (backend)

Documento para implementar el endpoint (o endpoints) que alimentan la tabla **Rentabilidad por Producto** del dashboard: métricas por **nombre de producto** (o SKU), alineadas con columnas tipo ENTR, % efectividad, tránsito, % tránsito, devoluciones, % devoluciones, ventas, pauta y utilidad.

**Relación con el código actual**

- Líneas de pedido: `productos_detalle` → [`src/productos-detalle/entities/producto-detalle.entity.ts`](../src/productos-detalle/entities/producto-detalle.entity.ts) (`pedido_id_dropi`, `producto_nombre`, cantidades, costos).
- Cabecera de pedido: [`src/pedidos/entities/pedido.entity.ts`](../src/pedidos/entities/pedido.entity.ts) (`id_dropi`, `venta`, `ganancia_calc`, `estado_unificado`, `fecha`, etc.).
- Gasto / métricas de pauta por producto: `cpas` → [`src/cpa/entities/cpa.entity.ts`](../src/cpa/entities/cpa.entity.ts) (`producto`, `gasto_publicidad`, `rentabilidad`, `utilidad_aproximada`, `fecha`, `semana`, etc.).

**Par documento hermano:** reglas de clasificación de estados (entregado, tránsito, devolución, etc.) deben ser **las mismas** que en [PLAN-FASES-LOGISTICA-TRANSPORTADORAS.md](./PLAN-FASES-LOGISTICA-TRANSPORTADORAS.md) para que porcentajes sean coherentes entre pantallas.

---

## 1. Objetivo y alcance

| Columna (referencia UI) | Origen de datos propuesto |
|-------------------------|---------------------------|
| **Producto** | `ProductoDetalle.producto_nombre` (y/o concatenación con `variacion` si el negocio lo requiere). Clave de agrupación a definir (nombre solo vs nombre+variación). |
| **ENTR** | Conteo de unidades o de “entradas” según definición de negocio: típicamente pedidos entregados que incluyen ese producto, o suma de `cantidad` en líneas cuyo pedido está entregado. |
| **% EFEC.** | `(entregados asociados al producto / denominador) * 100` — mismo criterio que ENTR y estados. |
| **TRÁN / % TRÁN.** | Pedidos (o unidades) en tránsito vinculados al producto. |
| **DEV / % DEV.** | Devoluciones vinculadas al producto. |
| **VENTAS** | Suma de `Pedido.venta` prorrateada por línea **o** suma de ingresos por línea si existe en datos; debe acordarse una regla única. |
| **PAUTA** | Agregado de `Cpa.gasto_publicidad` por `producto` y ventana de tiempo (posiblemente más de una fila CPA por producto/semana → `SUM`). |
| **UTILIDAD** | Suma de `ganancia_calc` a nivel pedido prorrateada por producto, o suma de margen por línea si se calcula; alineado con cómo hoy se usa `ganancia_calc` en reportes. |

**Recomendación de denominador para %:** usar el **total de pedidos (o unidades enviadas)** que incluyen el producto en el periodo, excluyendo cancelados si así lo define negocio — documentar la fórmula en el servicio.

### Estado de avance (checklist)

| Fase | Estado |
|------|--------|
| Fase 0 | Parcial en código: agrupación `TRIM(producto_nombre)`; ventas/utilidad = suma por pedido deduplicado con `DISTINCT ON`; pauta = `SUM(gasto_publicidad)` con join `LOWER(TRIM)`. |
| Fase 1 | **Hecha** — `GET /api/reportes-rentabilidad/por-producto` |
| Fase 2 | **Hecha** — backend (`sortBy` / `search` / `total`) + UI [`RentabilidadProductoPage.tsx`](../../Dashboard-petho-Front/src/pages/RentabilidadProductoPage.tsx) con orden y búsqueda server-side. |
| Fase 3 | No aplica MVP sin paginación server-side (ya hay paginación). |
| Fase 4 | **Casi hecha** — JWT, Logger, tests (unit + e2e mocks + live opcional). Pendiente: decisión de **roles** (quién ve el endpoint) y **checklist manual** / `EXPLAIN` en producción. |

---

## 1.b Qué falta (resumen)

| Pendiente | Tipo |
|-----------|------|
| Alinear **RolesGuard** o política explícita (solo ADMIN vs OPERADOR) con negocio | Producto / seguridad |
| Ejecutar **`EXPLAIN ANALYZE`** en staging/prod y aplicar índices de [`sql-sugerencias/indices-reportes-pedidos.sql`](./sql-sugerencias/indices-reportes-pedidos.sql) si aplica | Rendimiento |
| Validación manual tipo **hoja de cálculo** (2–3 productos vs totales) — criterio Fase 0 | QA |
| **Vista materializada** o job nocturno solo si aparecen timeouts | Escalado |
| Endpoint “lista completa sin paginación” (Fase 3 opcional) | **No planificado** — ya hay paginación server-side |

---

## 2. Supuestos y dependencias

1. **Join** entre `productos_detalle.pedido_id_dropi` y `pedidos.id_dropi` (ambos string); validar que siempre coincidan tras importaciones.
2. **Emparejamiento CPA ↔ producto:** `Cpa.producto` vs `ProductoDetalle.producto_nombre` pueden diferir en mayúsculas o texto. Fase 0 debe definir: igualdad normalizada (`LOWER(TRIM())`), mapa manual, o clave externa futura.
3. **Ventas y utilidad a nivel línea:** si hoy solo existe `venta` y `ganancia_calc` en el pedido completo, la **prorrateo** por cantidad/precio de línea es una decisión de producto; alternativa MVP: atribuir todo el pedido al “primer” producto o repetir totales (no ideal). El plan recomienda **prorrateo por `precio_proveedor_x_cantidad` o subtotal de línea** si está disponible.
4. **Filtros de fecha:** aplicar sobre `Pedido.fecha` (o campo acordado) y, para pauta, sobre `Cpa.fecha` o `semana` en el mismo rango o periodo reportado.

---

## 3. Fases de implementación

### Fase 0 — Diseño de métricas y claves

- [x] **Clave de producto** — `TRIM(producto_nombre)` (sin variación en v1).
- [x] Misma clasificación de estados vía [`pedido-logistica-sql.ts`](../src/common/pedido-logistica-sql.ts).
- [x] **VENTAS / UTILIDAD** — una fila por par `(producto, id_dropi)` (`DISTINCT ON`), luego `SUM(venta)` y `SUM(ganancia_calc)` por producto (no prorrateo por línea).
- [x] **PAUTA** — `SUM(gasto_publicidad)` en `cpas` por `LOWER(TRIM(producto))`, mismo rango de fechas opcional que pedidos.
- [x] **Paginación** — `page`, `limit` en API.

**Criterio de hecho:** hoja de cálculo o query SQL de validación con 2–3 productos cuadrando con totales manuales.

---

### Fase 1 — Query agregada y endpoint lectura

- [x] Servicio [`src/reportes-rentabilidad/reportes-rentabilidad.service.ts`](../src/reportes-rentabilidad/reportes-rentabilidad.service.ts): CTEs `pedido_producto` → `agg` → `pauta_agg` → `final`.
- [x] `GET /api/reportes-rentabilidad/por-producto`.
- [x] Query params: `desde`, `hasta`, `page`, `limit`, `sortBy`, `order`, `search` — DTO [`por-producto-query.dto.ts`](../src/reportes-rentabilidad/dto/por-producto-query.dto.ts).
- [x] Respuesta `{ data, total, page, limit }`.

**Criterio de hecho:** contrato estable documentado; validación con `class-validator` en DTO de query.

---

### Fase 2 — Orden y filtro en servidor (obligatorio a escala)

- [x] `ORDER BY` solo vía mapa fijo `SORT_SQL` en el servicio.
- [x] `search` → `WHERE producto ILIKE` parametrizado.
- [x] `total` con query `COUNT` sobre el mismo CTE `final` (sin cargar todo en memoria de app).

**Criterio de hecho:** con 10k+ productos distintos, tiempo de respuesta aceptable y uso de memoria estable.

---

### Fase 3 — MVP alternativo solo cliente (opcional, documentado)

**Estado:** no aplica — el API y la UI ya usan **paginación y orden en servidor**. No se implementará endpoint “toda la lista” salvo requisito nuevo explícito.

- [~] Endpoint sin paginación — **descartado** para el MVP actual.
- [~] Deprecated en código — **N/A** (no hay endpoint duplicado).

---

### Fase 4 — Seguridad y consistencia

- [x] **JwtAuthGuard** en [`reportes-rentabilidad.controller.ts`](../src/reportes-rentabilidad/reportes-rentabilidad.controller.ts) (revisar alineación de roles con negocio).
- [x] Respuesta sin datos de cliente (solo producto y agregados).
- [x] Errores SQL logueados en servicio (`Logger`, sin PII).
- [x] Tests automatizados — unit: [`reportes-rentabilidad.service.spec.ts`](../src/reportes-rentabilidad/reportes-rentabilidad.service.spec.ts); e2e: [`test/reportes-rentabilidad.e2e-spec.ts`](../test/reportes-rentabilidad.e2e-spec.ts); live opcional: [`test/reportes-api-live.e2e-spec.ts`](../test/reportes-api-live.e2e-spec.ts) (`E2E_BASE_URL`, `E2E_JWT`).

**Criterio de hecho:** revisión de permisos y ausencia de fugas de datos.

**Pendiente explícito:** revisar con negocio si **OPERADOR** debe seguir viendo este reporte igual que hoy (solo `JwtAuthGuard`).

---

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Desalineación CPA–producto | Normalización de texto; tabla de alias; mejora futura con ID de producto. |
| Doble conteo en ventas/utilidad | Una sola regla de prorrateo documentada y revisada con negocio. |
| Consultas pesadas | Índices en `productos_detalle(pedido_id_dropi)`, `producto_nombre`; considerar vista materializada. |

---

## 5. Referencias cruzadas

- Frontend: [Dashboard-petho-Front/docs/PLAN-FASES-UI-RENTABILIDAD-PRODUCTO.md](../../Dashboard-petho-Front/docs/PLAN-FASES-UI-RENTABILIDAD-PRODUCTO.md).
- Logística (estados): [PLAN-FASES-LOGISTICA-TRANSPORTADORAS.md](./PLAN-FASES-LOGISTICA-TRANSPORTADORAS.md).

---

## 6. Changelog del documento

| Fecha (aprox.) | Cambio |
|----------------|--------|
| 2026-04 | Añadidos tests automatizados, sección “Qué falta”, Fase 3 marcada como N/A, pendiente roles. |
