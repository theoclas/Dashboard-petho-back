import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { pedidoBucketCaseSql } from '../common/pedido-logistica-sql';
import {
  extractCalendarDateParam,
  sqlBusinessCalendarDate,
} from '../common/calendar-date-range';
import type { RentabilidadSortBy } from './dto/por-producto-query.dto';

export interface RentabilidadProductoRow {
  producto: string;
  entr: number;
  pctEfectividad: number;
  tran: number;
  pctTransito: number;
  dev: number;
  pctDevolucion: number;
  ventas: number;
  pauta: number;
  utilidad: number;
}

const SORT_SQL: Record<RentabilidadSortBy, string> = {
  producto: 'producto',
  entr: 'entr',
  tran: 'tran',
  dev: 'dev',
  pctEfectividad: 'pct_efectividad',
  pctTransito: 'pct_transito',
  pctDevolucion: 'pct_devolucion',
  ventas: 'ventas',
  pauta: 'pauta',
  utilidad: 'utilidad',
};

@Injectable()
export class ReportesRentabilidadService {
  private readonly logger = new Logger(ReportesRentabilidadService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getPorProducto(params: {
    desde?: string;
    hasta?: string;
    page: number;
    limit: number;
    sortBy: RentabilidadSortBy;
    order: 'asc' | 'desc';
    search?: string;
  }): Promise<{ data: RentabilidadProductoRow[]; total: number; page: number; limit: number }> {
    try {
    const bucketExpr = pedidoBucketCaseSql('p');
    const hasRange = Boolean(params.desde && params.hasta);
    const desdeCal = hasRange ? extractCalendarDateParam(params.desde!) : null;
    const hastaCal = hasRange ? extractCalendarDateParam(params.hasta!) : null;
    const searchPattern = `%${(params.search ?? '').trim()}%`;
    const offset = (params.page - 1) * params.limit;
    const sortCol = SORT_SQL[params.sortBy] ?? SORT_SQL.utilidad;
    const orderSql = params.order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const values: unknown[] = [];
    const push = (v: unknown) => {
      values.push(v);
      return `$${values.length}`;
    };

    let dateCondPedido = '';
    let dateCondCpa = '';
    if (hasRange) {
      const d1 = push(desdeCal);
      const d2 = push(hastaCal);
      const pDate = sqlBusinessCalendarDate('p.fecha');
      const cpaDate = sqlBusinessCalendarDate('cpa.fecha');
      dateCondPedido = `AND ${pDate} BETWEEN ${d1}::date AND ${d2}::date`;
      dateCondCpa = `AND ${cpaDate} BETWEEN ${d1}::date AND ${d2}::date`;
    }

    const ilikePh = push(searchPattern);
    const limitPh = push(params.limit);
    const offsetPh = push(offset);

    /**
     * Universo de filas = productos que aparecen en CPA (mismo rango de fechas que pedidos cuando aplica).
     * Nombre mostrado = texto CPA (MIN estable por pk). Pauta = suma gasto CPA.
     * Métricas logística/ventas/utilidad = agregado desde pedidos filas cuyo nombre Dropi coincide con CPA:
     * igualdad LOWER(TRIM) o el pk CPA está contenido en el nombre pedido (POSITION); si varios CPA encajan,
     * gana el pk más largo para reducir dobles conteos.
     */
    const cte = `
      cpa_products AS (
        SELECT
          LOWER(TRIM(cpa.producto)) AS pk,
          MIN(TRIM(cpa.producto)) AS nombre_display,
          SUM(COALESCE(cpa.gasto_publicidad, 0))::numeric AS pauta_total
        FROM cpas cpa
        WHERE cpa.producto IS NOT NULL AND TRIM(cpa.producto) <> ''
          ${dateCondCpa}
        GROUP BY LOWER(TRIM(cpa.producto))
      ),
      pedido_producto AS (
        SELECT DISTINCT ON (TRIM(pd.producto_nombre), p.id_dropi)
          TRIM(pd.producto_nombre) AS producto,
          p.id_dropi,
          p.venta::numeric AS venta,
          p.ganancia_calc::numeric AS ganancia,
          (${bucketExpr}) AS bucket
        FROM productos_detalle pd
        INNER JOIN pedidos p ON p.id_dropi = pd.pedido_id_dropi
        WHERE pd.producto_nombre IS NOT NULL AND TRIM(pd.producto_nombre) <> ''
          ${dateCondPedido}
        ORDER BY TRIM(pd.producto_nombre), p.id_dropi, pd.id
      ),
      agg AS (
        SELECT
          producto,
          COUNT(*)::int AS enviados,
          COUNT(*) FILTER (WHERE bucket = 'transito')::int AS transito,
          COUNT(*) FILTER (WHERE bucket = 'devolucion')::int AS devoluciones,
          COUNT(*) FILTER (WHERE bucket = 'entregado')::int AS entregados,
          COALESCE(SUM(venta), 0)::numeric AS ventas,
          COALESCE(SUM(ganancia), 0)::numeric AS utilidad
        FROM pedido_producto
        GROUP BY producto
      ),
      agg_mapped AS (
        SELECT
          a.producto,
          a.enviados,
          a.transito,
          a.devoluciones,
          a.entregados,
          a.ventas,
          a.utilidad,
          (
            SELECT cp.pk
            FROM cpa_products cp
            WHERE cp.pk = LOWER(TRIM(a.producto))
               OR POSITION(cp.pk IN LOWER(TRIM(a.producto))) > 0
            ORDER BY LENGTH(cp.pk) DESC
            LIMIT 1
          ) AS cpa_pk
        FROM agg a
      ),
      agg_by_cpa AS (
        SELECT
          cpa_pk,
          SUM(enviados)::int AS enviados,
          SUM(transito)::int AS transito,
          SUM(devoluciones)::int AS devoluciones,
          SUM(entregados)::int AS entregados,
          SUM(ventas)::numeric AS ventas,
          SUM(utilidad)::numeric AS utilidad
        FROM agg_mapped
        WHERE cpa_pk IS NOT NULL
        GROUP BY cpa_pk
      ),
      final AS (
        SELECT
          cp.nombre_display AS producto,
          COALESCE(ab.entregados, 0)::int AS entr,
          COALESCE(ab.transito, 0)::int AS tran,
          COALESCE(ab.devoluciones, 0)::int AS dev,
          COALESCE(ab.enviados, 0)::int AS enviados,
          COALESCE(ab.ventas, 0)::numeric AS ventas,
          cp.pauta_total::numeric AS pauta,
          COALESCE(ab.utilidad, 0)::numeric AS utilidad,
          CASE WHEN COALESCE(ab.enviados, 0) > 0
            THEN ROUND((COALESCE(ab.entregados, 0)::numeric / ab.enviados) * 1000) / 10
            ELSE 0 END AS pct_efectividad,
          CASE WHEN COALESCE(ab.enviados, 0) > 0
            THEN ROUND((COALESCE(ab.transito, 0)::numeric / ab.enviados) * 1000) / 10
            ELSE 0 END AS pct_transito,
          CASE WHEN COALESCE(ab.enviados, 0) > 0
            THEN ROUND((COALESCE(ab.devoluciones, 0)::numeric / ab.enviados) * 1000) / 10
            ELSE 0 END AS pct_devolucion
        FROM cpa_products cp
        LEFT JOIN agg_by_cpa ab ON ab.cpa_pk = cp.pk
        WHERE cp.nombre_display ILIKE ${ilikePh}
      )
    `;

    const countValues = values.slice(0, values.length - 2);
    const countSql = `WITH ${cte} SELECT COUNT(*)::int AS c FROM final`;
    const countRow = await this.dataSource.query(countSql, countValues);
    const total = Number(countRow[0]?.c ?? 0);

    const dataSql = `
      WITH ${cte}
      SELECT * FROM final
      ORDER BY ${sortCol} ${orderSql} NULLS LAST, producto ASC
      LIMIT ${limitPh} OFFSET ${offsetPh}
    `;

    const rows = await this.dataSource.query(dataSql, values);

    const data: RentabilidadProductoRow[] = rows.map(
      (r: Record<string, unknown>) => ({
        producto: String(r.producto ?? ''),
        entr: Number(r.entr ?? 0),
        pctEfectividad: Number(r.pct_efectividad ?? 0),
        tran: Number(r.tran ?? 0),
        pctTransito: Number(r.pct_transito ?? 0),
        dev: Number(r.dev ?? 0),
        pctDevolucion: Number(r.pct_devolucion ?? 0),
        ventas: Number(r.ventas ?? 0),
        pauta: Number(r.pauta ?? 0),
        utilidad: Number(r.utilidad ?? 0),
      }),
    );

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
    };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`getPorProducto: ${err.message}`, err.stack);
      throw e;
    }
  }
}
