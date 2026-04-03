# Plan — Dashboard CPA Resumen diario (implementado)

Vista jerárquica alineada con la hoja **RESUMEN_DIARIO** del Excel de referencia (`CPA_JD_*_MODELO.xlsx`). Módulo **apartado** del listado plano en `CpaPage`.

**Referencias de código**

- Backend: [`src/cpa/cpa.service.ts`](../src/cpa/cpa.service.ts) (`getResumenDiario`), [`src/cpa/cpa.controller.ts`](../src/cpa/cpa.controller.ts) (`GET /cpa/resumen-diario`).
- Frontend: [`Dashboard-petho-Front/src/pages/CpaResumenDiarioPage.tsx`](../../Dashboard-petho-Front/src/pages/CpaResumenDiarioPage.tsx), [`api.ts`](../../Dashboard-petho-Front/src/api.ts) (`getCpaResumenDiario`).

---

## Objetivo

- Jerarquía: **Mes** → **Semana** (`semana` en BD) → **Fecha** → **Cuenta publicitaria** → **Producto** (hoja).
- Métricas por nodo (agregadas solo desde **filas hoja** tras fusionar duplicados por clave natural):

| Métrica | Cálculo |
|---------|---------|
| Gasto publicidad | `SUM(gasto_publicidad)` |
| Conversaciones | `SUM(conversaciones)` |
| Ventas | `SUM(ventas)` |
| Utilidad aprox. | `SUM(utilidad_aproximada)` |
| Ganancia (prom.) | Media aritmética de `ganancia_promedio` no nulos en hojas del subárbol |
| CPA (prom. Excel) | Media aritmética de `cpa` no nulos en hojas del subárbol |
| CPA (ponderado) | `Σ gasto / Σ ventas` si `Σ ventas > 0`, si no `null` |

- **Duplicados** (misma fecha + cuenta + producto): se fusionan sumando montos enteros y promediando `ganancia_promedio` y `cpa` de las filas fusionadas (mismo criterio que un merge de dos filas).

---

## API

`GET /api/cpa/resumen-diario?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&producto=` (opcional, ILIKE).

**Respuesta** (resumen):

```json
{
  "total": {
    "sumGasto": 0,
    "sumConversaciones": 0,
    "sumVentas": 0,
    "sumUtilidad": 0,
    "avgGananciaPromedio": null,
    "avgCpa": null,
    "cpaPonderado": null
  },
  "nodes": [
    {
      "tipo": "mes",
      "key": "2026-02",
      "label": "FEBRERO 2026",
      "metrics": { },
      "children": [ ]
    }
  ]
}
```

**Roles**: `ADMIN` y `OPERADOR` (igual que el resto de CPA).

---

## Fases y estado

| Fase | Estado |
|------|--------|
| Plan MD | Hecha |
| Endpoint + agregación | Hecha |
| UI tabla jerárquica + menú | Hecha |
| Tooltips / vacíos / scroll | Hecha |

---

## Riesgos

- Paridad exacta con Excel pivot: el pivot puede usar ponderaciones distintas; aquí quedan fijas **AVG(cpa)** y **gasto/ventas** como en acuerdo de producto.
- Filas sin `semana`: etiqueta **Sin semana**.
