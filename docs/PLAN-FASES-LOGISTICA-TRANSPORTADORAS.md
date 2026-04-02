# Plan por fases — Logística y transportadoras (backend)

Documento de referencia para implementar en **Dashboard-Petho-back** las capacidades que alimentan las vistas de **Efectividad Transportadora** (tabla resumen por empresa) y **Comparativa de Transportadoras** (gráfico de barras agrupadas por geografía con toggles de dimensión y métrica).

**Relación con el código actual**

- Entidad principal: `pedidos` → [`src/pedidos/entities/pedido.entity.ts`](../src/pedidos/entities/pedido.entity.ts) (`transportadora`, `departamento`, `ciudad`, `estado_unificado`, `estado_operativo`, fechas, etc.).
- Normalización de estados por transportadora: `mapeo_estados` → [`src/mapeo-estados/entities/mapeo-estado.entity.ts`](../src/mapeo-estados/entities/mapeo-estado.entity.ts).
- Prefijo API global: `/api` (ver `src/main.ts`).

---

## 1. Objetivo y alcance

| Vista (referencia UI) | Qué debe entregar el backend |
|----------------------|------------------------------|
| **Efectividad Transportadora** | Por cada `transportadora` (empresa): totales de enviados, en tránsito, devoluciones, cancelados, rechazados, entregados; porcentajes respecto a un denominador acordado (típicamente “enviados” o equivalente). |
| **Comparativa de Transportadoras** | Serie agrupada por **departamento** o **ciudad** (top N, p. ej. 15), con una métrica por transportadora: **% efectividad** o **% devolución**, para pintar barras agrupadas en el frontend. |

**Fuera de alcance de este documento** (ver plan hermano): agregados de rentabilidad por producto, CPA/pauta.

### Estado de avance (checklist)

| Fase | Estado |
|------|--------|
| Fase 0 | Parcial: reglas de estado en código (`src/common/pedido-logistica-sql.ts`); sin inventario formal en BD. |
| Fase 1 | **Hecha** — `GET /api/reportes-logistica/efectividad-transportadoras` |
| Fase 2 | **Hecha** — `GET /api/reportes-logistica/comparativa-geografica` |
| Fase 3 | **Casi hecha** — DTO, JWT, índices sugeridos en doc, Logger, tests. Pendiente: **inventario `estado_unificado`**, **MV/job** solo si hay problemas de rendimiento. |

---

## 1.b Qué falta (resumen)

| Pendiente | Tipo |
|-----------|------|
| **Inventariar** valores reales de `estado_unificado` en BD (query ad-hoc o script) y contrastar con [`pedido-logistica-sql.ts`](../src/common/pedido-logistica-sql.ts) | Datos / cobertura |
| **Materialized view** o agregado nocturno si en producción hay timeouts con mucho volumen | Rendimiento |
| Aplicar índices tras **`EXPLAIN ANALYZE`** en entorno real — [`sql-sugerencias/indices-reportes-pedidos.sql`](./sql-sugerencias/indices-reportes-pedidos.sql) | Rendimiento |
| Decidir **roles** (mismo criterio que rentabilidad: quién ve reportes) | Producto / seguridad |
| Bucket **“otros”** / métricas de cobertura si aparecen estados no clasificados | Producto (opcional) |

---

## 2. Supuestos y dependencias de datos

1. **Clasificación de pedidos** se basará en `Pedido.estado_unificado` (índice presente en entidad), coherente con el mapeo desde `mapeo_estados` cuando aplique importaciones por transportadora.
2. Es necesario **definir y documentar en código** el conjunto de valores de `estado_unificado` que cuentan como:
   - entregado,
   - en tránsito,
   - devolución,
   - cancelado,
   - rechazado,
   - y qué hacer con valores `NULL` o no clasificados (bucket “otros” o exclusión del denominador).
3. **`transportadora`**: texto libre; nombres inconsistentes (mayúsculas, espacios) afectan agrupación. En fases posteriores se puede normalizar en query (`TRIM`, `UPPER`) o tabla maestra.
4. **Geografía**: `departamento` y `ciudad` en `pedidos`; validar nulos y duplicados de etiquetas para el “Top 15”.

---

## 3. Fases de implementación

### Fase 0 — Diseño y convenciones

- [ ] Inventariar valores reales de `estado_unificado` en la base (consulta exploratoria o endpoint interno temporal).
- [x] Redactar tabla de **mapeo categoría ↔ valores** — implementado como `CASE` en [`src/common/pedido-logistica-sql.ts`](../src/common/pedido-logistica-sql.ts) (cancelado → rechazado → devolución → entregado → tránsito).
- [x] Fijar **denominador** de porcentajes — `enviados = COUNT(*)` por transportadora; % sobre ese total.
- [x] **Filtros globales** — `desde` / `hasta` opcionales sobre `pedido.fecha`; filtro opcional `transportadora` (ILIKE).

**Criterio de hecho:** documento de reglas aprobado y lista de estados cubierta al 100 % de los casos frecuentes o con bucket explícito.

---

### Fase 1 — API mínima: efectividad por transportadora

- [x] Crear módulo dedicado — [`src/reportes-logistica/`](../src/reportes-logistica/) registrado en [`app.module.ts`](../src/app.module.ts).
- [x] Servicio con **query agregada** (QueryBuilder) por `TRIM(transportadora)` y conteos por categoría.
- [x] Endpoint `GET /api/reportes-logistica/efectividad-transportadoras` con query `desde`, `hasta`, `transportadora`.
- [x] Respuesta: lista de objetos camelCase (`empresa`, `enviados`, `transito`, `pctTransito`, etc.).
- [x] Protegido con **JwtAuthGuard** (sin `RolesGuard` extra; mismo criterio que rutas solo JWT).

**Criterio de hecho:** respuesta JSON verificable contra totales manuales en un subconjunto de datos; sin N+1 queries.

---

### Fase 2 — API comparativa geográfica (Top N)

- [x] Método en [`reportes-logistica.service.ts`](../src/reportes-logistica/reportes-logistica.service.ts): `dimension=departamento|ciudad`, `metrica=efectividad|devolucion`, `top` (default 15).
- [x] **% efectividad** = `(entregados/enviados)*100`; **% devolución** = `(devoluciones/enviados)*100` por celda ubicación × transportadora.
- [x] Top N por volumen total de pedidos con transportadora y ubicación no vacías.
- [x] Respuesta `{ ubicaciones[], puntos: [{ ubicacion, transportadora, valorPct }] }` — ver [`comparativa-query.dto.ts`](../src/reportes-logistica/dto/comparativa-query.dto.ts).

Endpoint sugerido:

- `GET /api/reportes-logistica/comparativa-geografica?dimension=departamento&metrica=efectividad&top=15&desde=&hasta=`

**Criterio de hecho:** misma semántica con ambas dimensiones y métricas; pruebas con datos reales o fixtures.

---

### Fase 3 — Rendimiento, seguridad y pulido

- [x] Índices sugeridos documentados — [`docs/sql-sugerencias/indices-reportes-pedidos.sql`](../docs/sql-sugerencias/indices-reportes-pedidos.sql) (`CONCURRENTLY`, validar con `EXPLAIN ANALYZE`).
- [ ] Evitar timeouts: para tablas grandes, considerar **materialized view** o job nocturno (documentar si se pospone).
- [x] Validar query params con `class-validator` — [`efectividad-query.dto.ts`](../src/reportes-logistica/dto/efectividad-query.dto.ts).
- [x] Endpoint **no público** (JWT obligatorio).
- [x] Logging mínimo en errores (`ReportesLogisticaService`: mensaje + stack; sin query params ni datos de cliente).
- [x] Tests — [`reportes-logistica.service.spec.ts`](../src/reportes-logistica/reportes-logistica.service.spec.ts), [`test/reportes-logistica.e2e-spec.ts`](../test/reportes-logistica.e2e-spec.ts); live compartido en [`test/reportes-api-live.e2e-spec.ts`](../test/reportes-api-live.e2e-spec.ts).

**Criterio de hecho:** tiempos aceptables en producción con volumen esperado; revisión de seguridad básica completada.

---

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Estados sin clasificar | Bucket “otros” + métricas de cobertura en logs o respuesta meta. |
| Nombres de transportadora duplicados | Normalización en SQL; roadmap hacia catálogo de transportadoras. |
| Ciudades/homónimos | Usar departamento+ciudad como clave de agrupación si hace falta. |

---

## 5. Referencias cruzadas

- Frontend: [Dashboard-petho-Front/docs/PLAN-FASES-UI-LOGISTICA.md](../../Dashboard-petho-Front/docs/PLAN-FASES-UI-LOGISTICA.md) (consumo de estos endpoints y maquetación).
- Rentabilidad por producto (backend): [PLAN-FASES-RENTABILIDAD-POR-PRODUCTO.md](./PLAN-FASES-RENTABILIDAD-POR-PRODUCTO.md).

---

## 6. Changelog del documento

| Fecha (aprox.) | Cambio |
|----------------|--------|
| 2026-04 | Sección “Qué falta”, estado Fase 3 afinado, enlaces a tests. |
