import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { pedidoBucketCaseSql } from '../common/pedido-logistica-sql';
import {
  extractCalendarDateParam,
  sqlCastDateBetweenAliases,
} from '../common/calendar-date-range';

export interface EfectividadTransportadoraRow {
  empresa: string;
  enviados: number;
  transito: number;
  pctTransito: number;
  devoluciones: number;
  pctDevoluciones: number;
  cancelados: number;
  rechazados: number;
  entregados: number;
  pctEntregados: number;
}

export interface ComparativaGeograficaPunto {
  ubicacion: string;
  transportadora: string;
  valorPct: number;
}

export interface ComparativaGeograficaResponse {
  dimension: 'departamento' | 'ciudad';
  metrica: 'efectividad' | 'devolucion';
  ubicaciones: string[];
  puntos: ComparativaGeograficaPunto[];
}

@Injectable()
export class ReportesLogisticaService {
  private readonly logger = new Logger(ReportesLogisticaService.name);

  constructor(
    @InjectRepository(Pedido)
    private readonly pedidoRepository: Repository<Pedido>,
  ) {}

  async getEfectividadTransportadoras(params: {
    desde?: string;
    hasta?: string;
    transportadora?: string;
  }): Promise<EfectividadTransportadoraRow[]> {
    try {
    const bucket = pedidoBucketCaseSql('pedido');
    const qb = this.pedidoRepository
      .createQueryBuilder('pedido')
      .select('TRIM(pedido.transportadora)', 'empresa')
      .addSelect('COUNT(*)::int', 'enviados')
      .addSelect(
        `SUM(CASE WHEN ${bucket} = 'transito' THEN 1 ELSE 0 END)::int`,
        'transito',
      )
      .addSelect(
        `SUM(CASE WHEN ${bucket} = 'devolucion' THEN 1 ELSE 0 END)::int`,
        'devoluciones',
      )
      .addSelect(
        `SUM(CASE WHEN ${bucket} = 'cancelado' THEN 1 ELSE 0 END)::int`,
        'cancelados',
      )
      .addSelect(
        `SUM(CASE WHEN ${bucket} = 'rechazado' THEN 1 ELSE 0 END)::int`,
        'rechazados',
      )
      .addSelect(
        `SUM(CASE WHEN ${bucket} = 'entregado' THEN 1 ELSE 0 END)::int`,
        'entregados',
      )
      .where("pedido.transportadora IS NOT NULL AND TRIM(pedido.transportadora) <> ''");

    if (params.desde && params.hasta) {
      qb.andWhere(sqlCastDateBetweenAliases('pedido.fecha', 'desde', 'hasta'), {
        desde: extractCalendarDateParam(params.desde),
        hasta: extractCalendarDateParam(params.hasta),
      });
    }

    if (params.transportadora?.trim()) {
      qb.andWhere('TRIM(pedido.transportadora) ILIKE :t', {
        t: `%${params.transportadora.trim()}%`,
      });
    }

    qb.groupBy('TRIM(pedido.transportadora)').orderBy('enviados', 'DESC');

    const rows = await qb.getRawMany<{
      empresa: string;
      enviados: string;
      transito: string;
      devoluciones: string;
      cancelados: string;
      rechazados: string;
      entregados: string;
    }>();

    return rows.map((r) => {
      const enviados = Number(r.enviados) || 0;
      const transito = Number(r.transito) || 0;
      const devoluciones = Number(r.devoluciones) || 0;
      const cancelados = Number(r.cancelados) || 0;
      const rechazados = Number(r.rechazados) || 0;
      const entregados = Number(r.entregados) || 0;
      const den = enviados > 0 ? enviados : 1;
      return {
        empresa: r.empresa || '',
        enviados,
        transito,
        pctTransito: Math.round((transito / den) * 1000) / 10,
        devoluciones,
        pctDevoluciones: Math.round((devoluciones / den) * 1000) / 10,
        cancelados,
        rechazados,
        entregados,
        pctEntregados: Math.round((entregados / den) * 1000) / 10,
      };
    });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`getEfectividadTransportadoras: ${err.message}`, err.stack);
      throw e;
    }
  }

  async getComparativaGeografica(params: {
    dimension: 'departamento' | 'ciudad';
    metrica: 'efectividad' | 'devolucion';
    top: number;
    desde?: string;
    hasta?: string;
  }): Promise<ComparativaGeograficaResponse> {
    try {
    const geoPath =
      params.dimension === 'ciudad' ? 'pedido.ciudad' : 'pedido.departamento';
    const bucket = pedidoBucketCaseSql('pedido');

    const qbTop = this.pedidoRepository
      .createQueryBuilder('pedido')
      .select(`TRIM(${geoPath})`, 'loc')
      .addSelect('COUNT(*)::int', 'vol')
      .where("pedido.transportadora IS NOT NULL AND TRIM(pedido.transportadora) <> ''")
      .andWhere(`${geoPath} IS NOT NULL AND TRIM(${geoPath}) <> ''`);

    if (params.desde && params.hasta) {
      qbTop.andWhere(sqlCastDateBetweenAliases('pedido.fecha', 'desde', 'hasta'), {
        desde: extractCalendarDateParam(params.desde),
        hasta: extractCalendarDateParam(params.hasta),
      });
    }

    qbTop
      .groupBy(`TRIM(${geoPath})`)
      .orderBy('vol', 'DESC')
      .limit(params.top);

    const topRows = await qbTop.getRawMany<{ loc: string; vol: string }>();
    const ubicaciones = topRows.map((r) => r.loc).filter(Boolean);
    if (ubicaciones.length === 0) {
      return {
        dimension: params.dimension,
        metrica: params.metrica,
        ubicaciones: [],
        puntos: [],
      };
    }

    const qbDet = this.pedidoRepository
      .createQueryBuilder('pedido')
      .select(`TRIM(${geoPath})`, 'loc')
      .addSelect('TRIM(pedido.transportadora)', 'empresa')
      .addSelect('COUNT(*)::int', 'enviados')
      .addSelect(
        `SUM(CASE WHEN ${bucket} = 'entregado' THEN 1 ELSE 0 END)::int`,
        'entregados',
      )
      .addSelect(
        `SUM(CASE WHEN ${bucket} = 'devolucion' THEN 1 ELSE 0 END)::int`,
        'devoluciones',
      )
      .where("pedido.transportadora IS NOT NULL AND TRIM(pedido.transportadora) <> ''")
      .andWhere(`TRIM(${geoPath}) IN (:...locs)`, { locs: ubicaciones });

    if (params.desde && params.hasta) {
      qbDet.andWhere(sqlCastDateBetweenAliases('pedido.fecha', 'desde', 'hasta'), {
        desde: extractCalendarDateParam(params.desde),
        hasta: extractCalendarDateParam(params.hasta),
      });
    }

    qbDet.groupBy(`TRIM(${geoPath})`).addGroupBy('TRIM(pedido.transportadora)');

    const det = await qbDet.getRawMany<{
      loc: string;
      empresa: string;
      enviados: string;
      entregados: string;
      devoluciones: string;
    }>();

    const puntos: ComparativaGeograficaPunto[] = [];
    for (const r of det) {
      const env = Number(r.enviados) || 0;
      if (env === 0) continue;
      const ent = Number(r.entregados) || 0;
      const dev = Number(r.devoluciones) || 0;
      const raw =
        params.metrica === 'efectividad'
          ? (ent / env) * 100
          : (dev / env) * 100;
      const valorPct = Math.round(raw * 10) / 10;
      puntos.push({
        ubicacion: r.loc,
        transportadora: (r.empresa || '').toUpperCase(),
        valorPct,
      });
    }

    return {
      dimension: params.dimension,
      metrica: params.metrica,
      ubicaciones,
      puntos,
    };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`getComparativaGeografica: ${err.message}`, err.stack);
      throw e;
    }
  }
}
