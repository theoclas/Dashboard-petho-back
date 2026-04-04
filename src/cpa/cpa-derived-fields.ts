import type { Cpa } from './entities/cpa.entity';

function roundDec(n: number, scale: number): number {
  const f = 10 ** scale;
  return Math.round(n * f) / f;
}

/**
 * Campos derivados alineados al modelo Excel (CPA_JD):
 * - Ticket promedio = TOTAL FACTURADO / VENTAS (si ventas > 0)
 * - CPA = GASTO PUBLICIDAD / VENTAS (si ventas > 0), vacío si ventas = 0
 * - Costo publicitario = gasto publicidad (misma magnitud)
 * - Conversion rate = VENTAS / CONVERSACIONES (si conversaciones > 0)
 * - Utilidad aprox. = (ganancia promedio × ventas) − gasto publicidad
 * - Rentabilidad = utilidad / gasto (si gasto > 0)
 */
export function applyCpaDerivedFields(r: Partial<Cpa>): void {
  const gasto =
    r.gasto_publicidad != null && !Number.isNaN(Number(r.gasto_publicidad))
      ? Number(r.gasto_publicidad)
      : null;
  const ventas =
    r.ventas != null && !Number.isNaN(Number(r.ventas)) ? Math.trunc(Number(r.ventas)) : null;
  const conv =
    r.conversaciones != null && !Number.isNaN(Number(r.conversaciones))
      ? Math.trunc(Number(r.conversaciones))
      : null;
  const total =
    r.total_facturado != null && !Number.isNaN(Number(r.total_facturado))
      ? Number(r.total_facturado)
      : null;
  const gan =
    r.ganancia_promedio != null && !Number.isNaN(Number(r.ganancia_promedio))
      ? Number(r.ganancia_promedio)
      : null;

  r.costo_publicitario = gasto != null ? roundDec(gasto, 2) : null;

  if (ventas != null && ventas > 0) {
    r.ticket_promedio_producto =
      total != null ? roundDec(total / ventas, 2) : null;
    r.cpa = gasto != null ? roundDec(gasto / ventas, 2) : null;
  } else {
    r.ticket_promedio_producto = null;
    r.cpa = null;
  }

  if (conv != null && conv > 0 && ventas != null && !Number.isNaN(ventas)) {
    r.conversion_rate = roundDec(ventas / conv, 4);
  } else {
    r.conversion_rate = null;
  }

  if (gan != null && ventas != null && gasto != null) {
    r.utilidad_aproximada = roundDec(gan * ventas - gasto, 2);
  } else {
    r.utilidad_aproximada = null;
  }

  const util =
    r.utilidad_aproximada != null && !Number.isNaN(Number(r.utilidad_aproximada))
      ? Number(r.utilidad_aproximada)
      : null;
  if (gasto != null && gasto > 0 && util != null) {
    r.rentabilidad = roundDec(util / gasto, 4);
  } else {
    r.rentabilidad = null;
  }
}
