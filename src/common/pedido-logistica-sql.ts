/**
 * Expresión SQL (CASE) que clasifica un pedido en buckets mutuamente excluyentes.
 * Alineado conceptualmente con getDashboardStats en pedidos.service (ENTREGADO, DEVOLUCI, etc.).
 */
export function pedidoBucketCaseSql(alias: string): string {
  return `CASE
    WHEN ${alias}.estado_unificado ILIKE '%CANCEL%' OR COALESCE(${alias}.estado_operativo, '') ILIKE '%CANCEL%' THEN 'cancelado'
    WHEN ${alias}.estado_unificado ILIKE '%RECHAZ%' OR COALESCE(${alias}.estado_operativo, '') ILIKE '%RECHAZ%' THEN 'rechazado'
    WHEN ${alias}.estado_unificado ILIKE '%DEVOLUCI%' OR COALESCE(${alias}.estado_operativo, '') ILIKE '%DEVOLUCI%' THEN 'devolucion'
    WHEN ${alias}.estado_unificado = 'ENTREGADO' OR ${alias}.estado_operativo = 'ENTREGADO' THEN 'entregado'
    ELSE 'transito'
  END`;
}
