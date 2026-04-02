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

function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zona usada para interpretar qué “día calendario” tiene un `timestamp` (alineado con el front).
 * Por defecto America/Bogota. Override: `DATE_RANGE_TZ=Europe/Madrid` en `.env`.
 */
export function getDateRangeTimeZone(): string {
  const raw = (process.env.DATE_RANGE_TZ || 'America/Bogota').trim();
  if (raw && isValidIanaTimeZone(raw)) return raw;
  return 'America/Bogota';
}

/**
 * Fecha calendario en la zona de negocio, asumiendo la columna `timestamp without time zone`
 * guarda el instante en convención UTC (típico con TypeORM/Node). Así el filtro coincide con
 * `dayjs(fecha).format('DD/MM/YYYY')` en el navegador en esa misma zona.
 */
export function sqlBusinessCalendarDate(columnSql: string): string {
  const tz = getDateRangeTimeZone().replace(/'/g, "''");
  return `((${columnSql} AT TIME ZONE 'UTC') AT TIME ZONE '${tz}')::date`;
}

/** Condición TypeORM: comparación por día calendario en zona de negocio (inclusive). */
export function sqlCastDateBetween(columnSql: string): string {
  const d = sqlBusinessCalendarDate(columnSql);
  return `${d} BETWEEN CAST(:startDate AS DATE) AND CAST(:endDate AS DATE)`;
}

/** Variante con nombres de parámetro distintos (p. ej. logística: desde/hasta). */
export function sqlCastDateBetweenAliases(
  columnSql: string,
  startParam: string,
  endParam: string,
): string {
  const d = sqlBusinessCalendarDate(columnSql);
  return `${d} BETWEEN CAST(:${startParam} AS DATE) AND CAST(:${endParam} AS DATE)`;
}
