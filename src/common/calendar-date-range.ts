/**
 * Normaliza entradas de rango (YYYY-MM-DD o ISO con hora) a `YYYY-MM-DD`
 * para filtrar por día calendario en PostgreSQL de forma inclusive en ambos extremos.
 *
 * Evita que `new Date('2025-01-30')` (medianoche UTC) excluya pedidos del día 30
 * con hora distinta de 00:00.
 */
export function extractCalendarDateParam(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return t.slice(0, 10);
}

/** Condición TypeORM: columna timestamp/date comparada por DATE inclusive. */
export function sqlCastDateBetween(columnSql: string): string {
  return `CAST(${columnSql} AS DATE) BETWEEN CAST(:startDate AS DATE) AND CAST(:endDate AS DATE)`;
}

/** Variante con nombres de parámetro distintos (p. ej. logística: desde/hasta). */
export function sqlCastDateBetweenAliases(
  columnSql: string,
  startParam: string,
  endParam: string,
): string {
  return `CAST(${columnSql} AS DATE) BETWEEN CAST(:${startParam} AS DATE) AND CAST(:${endParam} AS DATE)`;
}
