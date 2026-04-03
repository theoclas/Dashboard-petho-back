import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import * as XLSX from 'xlsx';
import { CreateCpaDto } from './dto/create-cpa.dto';
import { UpdateCpaDto } from './dto/update-cpa.dto';
import { Cpa } from './entities/cpa.entity';
import {
  extractCalendarDateParam,
  sqlCastDateBetween,
} from '../common/calendar-date-range';
import type {
  CpaResumenDiarioResponse,
  CpaResumenMetrics,
  CpaResumenNode,
} from './dto/cpa-resumen-diario.dto';

/** Filtros y orden compartidos entre GET /cpa y exportación Excel. */
export type CpaListQuery = {
  producto?: string;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  startDate?: string;
  endDate?: string;
};

const EXPORT_MAX_ROWS = 50_000;

function fmtDateCell(d: Date | string | null | undefined): string {
  if (d == null) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

/** Export CPA: null/undefined → celda vacía en Excel (no 0). */
function exportCpaNumCell(v: unknown): number | string {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

const MESES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];
const MESES_CORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

interface CpaLeafAccum {
  gasto: number;
  conversaciones: number;
  ventas: number;
  utilidad: number;
  gananciaVals: number[];
  cpaVals: number[];
}

interface CpaLeafData {
  mesKey: string;
  mesLabel: string;
  semana: string;
  fechaKey: string;
  fechaLabel: string;
  cuenta: string;
  producto: string;
  accum: CpaLeafAccum;
}

function emptyAccum(): CpaLeafAccum {
  return {
    gasto: 0,
    conversaciones: 0,
    ventas: 0,
    utilidad: 0,
    gananciaVals: [],
    cpaVals: [],
  };
}

/**
 * Fila sin actividad numérica (a menudo celdas vacías importadas como 0).
 * No debe contar en AVG(CPA) ni AVG(ganancia); los 0 con otras métricas > 0 sí cuentan.
 */
function isLegacyCpaAllZeroPlaceholderRow(row: Cpa): boolean {
  const z = (x: number | null | undefined) =>
    x == null || Number.isNaN(Number(x)) || Number(x) === 0;
  return (
    z(row.gasto_publicidad) &&
    z(row.ventas) &&
    z(row.cpa) &&
    z(row.utilidad_aproximada) &&
    z(row.conversaciones) &&
    z(row.ganancia_promedio)
  );
}

function addRowToAccum(a: CpaLeafAccum, row: Cpa): CpaLeafAccum {
  const skipAvg = isLegacyCpaAllZeroPlaceholderRow(row);
  const g =
    !skipAvg &&
    row.ganancia_promedio != null &&
    !Number.isNaN(Number(row.ganancia_promedio));
  const c = !skipAvg && row.cpa != null && !Number.isNaN(Number(row.cpa));
  return {
    gasto: a.gasto + (row.gasto_publicidad != null ? Number(row.gasto_publicidad) : 0),
    conversaciones: a.conversaciones + (row.conversaciones != null ? Number(row.conversaciones) : 0),
    ventas: a.ventas + (row.ventas != null ? Number(row.ventas) : 0),
    utilidad: a.utilidad + (row.utilidad_aproximada != null ? Number(row.utilidad_aproximada) : 0),
    gananciaVals: [...a.gananciaVals, ...(g ? [Number(row.ganancia_promedio)] : [])],
    cpaVals: [...a.cpaVals, ...(c ? [Number(row.cpa)] : [])],
  };
}

function mergeAccum(a: CpaLeafAccum, b: CpaLeafAccum): CpaLeafAccum {
  return {
    gasto: a.gasto + b.gasto,
    conversaciones: a.conversaciones + b.conversaciones,
    ventas: a.ventas + b.ventas,
    utilidad: a.utilidad + b.utilidad,
    gananciaVals: [...a.gananciaVals, ...b.gananciaVals],
    cpaVals: [...a.cpaVals, ...b.cpaVals],
  };
}

function accumToMetrics(a: CpaLeafAccum): CpaResumenMetrics {
  const avgGan = a.gananciaVals.length
    ? a.gananciaVals.reduce((s, x) => s + x, 0) / a.gananciaVals.length
    : null;
  const avgC = a.cpaVals.length ? a.cpaVals.reduce((s, x) => s + x, 0) / a.cpaVals.length : null;
  const cpaPond = a.ventas > 0 ? a.gasto / a.ventas : null;
  return {
    sumGasto: a.gasto,
    sumConversaciones: a.conversaciones,
    sumVentas: a.ventas,
    sumUtilidad: a.utilidad,
    avgGananciaPromedio: avgGan,
    avgCpa: avgC,
    cpaPonderado: cpaPond,
  };
}

function metricsFromLeaves(leaves: CpaLeafData[]): CpaResumenMetrics {
  if (leaves.length === 0) {
    return {
      sumGasto: 0,
      sumConversaciones: 0,
      sumVentas: 0,
      sumUtilidad: 0,
      avgGananciaPromedio: null,
      avgCpa: null,
      cpaPonderado: null,
    };
  }
  const merged = leaves.reduce((acc, l) => mergeAccum(acc, l.accum), emptyAccum());
  return accumToMetrics(merged);
}

function calendarParts(fecha: Date): { y: number; m: number; day: number } {
  return {
    y: fecha.getFullYear(),
    m: fecha.getMonth() + 1,
    day: fecha.getDate(),
  };
}

function buildSemanaNode(semana: string, semLeaves: CpaLeafData[]): CpaResumenNode {
  const days = [...new Set(semLeaves.map((l) => l.fechaKey))].sort();
  const children = days.map((d) =>
    buildDayNode(d, semLeaves.filter((l) => l.fechaKey === d)),
  );
  return {
    tipo: 'semana',
    key: semana,
    label: semana,
    metrics: metricsFromLeaves(semLeaves),
    children,
  };
}

function buildDayNode(fechaKey: string, dayLeaves: CpaLeafData[]): CpaResumenNode {
  const cuentas = [...new Set(dayLeaves.map((l) => l.cuenta))].sort();
  const fechaLabel = dayLeaves[0]?.fechaLabel || fechaKey;
  const children = cuentas.map((c) =>
    buildCuentaNode(c, dayLeaves.filter((l) => l.cuenta === c)),
  );
  return {
    tipo: 'dia',
    key: fechaKey,
    label: fechaLabel,
    metrics: metricsFromLeaves(dayLeaves),
    children,
  };
}

function buildCuentaNode(cuenta: string, cuentaLeaves: CpaLeafData[]): CpaResumenNode {
  const prods = [...new Set(cuentaLeaves.map((l) => l.producto))].sort();
  const children: CpaResumenNode[] = prods.map((p) => {
    const ls = cuentaLeaves.filter((l) => l.producto === p);
    return {
      tipo: 'producto',
      key: p,
      label: p,
      metrics: metricsFromLeaves(ls),
      children: [],
    };
  });
  return {
    tipo: 'cuenta',
    key: cuenta,
    label: cuenta,
    metrics: metricsFromLeaves(cuentaLeaves),
    children,
  };
}

function buildMonthNode(mesKey: string, monthLeaves: CpaLeafData[]): CpaResumenNode {
  const mesLabel = monthLeaves[0]?.mesLabel || mesKey;
  const semanas = [...new Set(monthLeaves.map((l) => l.semana))].sort((a, b) => {
    const fa =
      monthLeaves.filter((l) => l.semana === a).map((l) => l.fechaKey).sort()[0] || '';
    const fb =
      monthLeaves.filter((l) => l.semana === b).map((l) => l.fechaKey).sort()[0] || '';
    return fa.localeCompare(fb);
  });
  const children = semanas.map((s) =>
    buildSemanaNode(s, monthLeaves.filter((l) => l.semana === s)),
  );
  return {
    tipo: 'mes',
    key: mesKey,
    label: mesLabel,
    metrics: metricsFromLeaves(monthLeaves),
    children,
  };
}

function buildResumenTree(leaves: CpaLeafData[]): CpaResumenDiarioResponse {
  const total = metricsFromLeaves(leaves);
  const mesKeys = [...new Set(leaves.map((l) => l.mesKey))].sort();
  const nodes: CpaResumenNode[] = mesKeys.map((mk) =>
    buildMonthNode(mk, leaves.filter((l) => l.mesKey === mk)),
  );
  return { total, nodes };
}

@Injectable()
export class CpaService {
  constructor(
    @InjectRepository(Cpa)
    private readonly cpaRepository: Repository<Cpa>,
  ) {}

  create(createCpaDto: CreateCpaDto) {
    const cpa = this.cpaRepository.create(createCpaDto);
    return this.cpaRepository.save(cpa);
  }

  async upsert(data: Partial<Cpa>) {
    if (!data.fecha || !String(data.producto ?? '').trim()) {
      return this.create(data as CreateCpaDto);
    }

    const prod = String(data.producto).trim();
    const rows = await this.cpaRepository
      .createQueryBuilder('cpa')
      .where('CAST(cpa.fecha AS date) = CAST(:fd AS date)', { fd: data.fecha })
      .andWhere('TRIM(cpa.producto) = :prod', { prod })
      .orderBy('cpa.id', 'ASC')
      .getMany();

    if (rows.length === 0) {
      return this.create(data as CreateCpaDto);
    }

    const primary = rows[0];
    if (rows.length > 1) {
      await this.cpaRepository.delete({ id: In(rows.slice(1).map((x) => x.id)) });
    }
    Object.assign(primary, data);
    return this.cpaRepository.save(primary);
  }

  /** Clave natural para upsert/import: fecha calendario + producto (sin cuenta). */
  private cpaNaturalKey(r: Partial<Cpa>): string {
    const f = r.fecha;
    if (!f) return '';
    const d = f instanceof Date ? f : new Date(f);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}|${String(r.producto ?? '').trim()}`;
  }

  /**
   * Import masivo: deduplica por (fecha, producto), carga existentes por lotes
   * y persiste con pocos round-trips (mismo criterio que upsert manual).
   */
  async bulkUpsertFromImport(records: Partial<Cpa>[]): Promise<number> {
    if (records.length === 0) return 0;

    const merged = new Map<string, Partial<Cpa>>();
    for (const r of records) {
      const k = this.cpaNaturalKey(r);
      if (!k) continue;
      const prev = merged.get(k);
      merged.set(k, prev ? { ...prev, ...r } : { ...r });
    }

    const unique = [...merged.values()];
    const CHUNK = 120;
    let persisted = 0;

    for (let i = 0; i < unique.length; i += CHUNK) {
      const batch = unique.slice(i, i + CHUNK);

      const qb = this.cpaRepository.createQueryBuilder('cpa');
      qb.where(
        new Brackets((qb1) => {
          batch.forEach((r, idx) => {
            qb1.orWhere(
              new Brackets((qb2) => {
                qb2
                  .where(`CAST(cpa.fecha AS date) = CAST(:d${idx} AS date)`, { [`d${idx}`]: r.fecha })
                  .andWhere(`TRIM(cpa.producto) = :p${idx}`, { [`p${idx}`]: String(r.producto ?? '').trim() });
              }),
            );
          });
        }),
      );

      const existing = await qb.getMany();

      const byKey = new Map<string, Cpa[]>();
      for (const e of existing) {
        const k = this.cpaNaturalKey(e);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k)!.push(e);
      }

      const primaryByKey = new Map<string, Cpa>();
      const duplicateIds: number[] = [];
      for (const [, arr] of byKey) {
        arr.sort((a, b) => a.id - b.id);
        primaryByKey.set(this.cpaNaturalKey(arr[0]), arr[0]);
        for (let j = 1; j < arr.length; j++) duplicateIds.push(arr[j].id);
      }
      if (duplicateIds.length > 0) {
        await this.cpaRepository.delete({ id: In(duplicateIds) });
      }

      const toSave: Cpa[] = [];
      for (const r of batch) {
        const k = this.cpaNaturalKey(r);
        const hit = primaryByKey.get(k);
        if (hit) {
          Object.assign(hit, r);
          toSave.push(hit);
        } else {
          toSave.push(this.cpaRepository.create(r as CreateCpaDto));
        }
      }

      if (toSave.length > 0) {
        await this.cpaRepository.save(toSave);
        persisted += toSave.length;
      }
    }

    return persisted;
  }

  private readonly cpaSortableFields = [
    'id',
    'semana',
    'fecha',
    'producto',
    'cuenta_publicitaria',
    'gasto_publicidad',
    'conversaciones',
    'total_facturado',
    'ganancia_promedio',
    'ventas',
    'ticket_promedio_producto',
    'cpa',
    'conversion_rate',
    'costo_publicitario',
    'rentabilidad',
    'utilidad_aproximada',
  ] as const;

  private createCpaListQueryBuilder(query?: CpaListQuery): SelectQueryBuilder<Cpa> {
    const qb = this.cpaRepository.createQueryBuilder('cpa');
    if (query?.producto?.trim()) {
      qb.andWhere('cpa.producto ILIKE :prod', {
        prod: `%${query.producto.trim()}%`,
      });
    }
    if (query?.startDate && query?.endDate) {
      qb.andWhere(sqlCastDateBetween('cpa.fecha'), {
        startDate: extractCalendarDateParam(query.startDate),
        endDate: extractCalendarDateParam(query.endDate),
      });
    }
    const sortField = query?.sortField || 'fecha';
    const sortOrder = query?.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const sortableFields = this.cpaSortableFields;
    const field = sortableFields.includes(sortField as (typeof sortableFields)[number])
      ? `cpa.${sortField}`
      : 'cpa.fecha';
    qb.orderBy(field, sortOrder);
    if (field !== 'cpa.id') {
      qb.addOrderBy('cpa.id', 'DESC');
    }
    return qb;
  }

  async findAll(query?: CpaListQuery): Promise<Cpa[]> {
    return this.createCpaListQueryBuilder(query).getMany();
  }

  /**
   * Exporta a Excel los registros CPA con los mismos filtros que el listado (sin paginación).
   * Máximo {@link EXPORT_MAX_ROWS} filas; si hay más coincidencias, se trunca.
   */
  async exportCpaExcel(query?: CpaListQuery): Promise<{
    buffer: Buffer;
    rowCount: number;
    totalMatching: number;
    truncated: boolean;
  }> {
    const countQb = this.createCpaListQueryBuilder(query);
    const totalMatching = await countQb.getCount();

    const qb = this.createCpaListQueryBuilder(query);
    qb.take(EXPORT_MAX_ROWS);
    const rows = await qb.getMany();

    const truncated = totalMatching > EXPORT_MAX_ROWS;

    const sheetRows = rows.map((r) => ({
      ID: r.id,
      Semana: r.semana ?? '',
      Fecha: fmtDateCell(r.fecha),
      Producto: r.producto ?? '',
      'Cuenta publicitaria': r.cuenta_publicitaria ?? '',
      'Gasto publicidad': exportCpaNumCell(r.gasto_publicidad),
      Conversaciones: exportCpaNumCell(r.conversaciones),
      'Total facturado': exportCpaNumCell(r.total_facturado),
      'Ganancia promedio': exportCpaNumCell(r.ganancia_promedio),
      Ventas: exportCpaNumCell(r.ventas),
      'Ticket promedio producto': exportCpaNumCell(r.ticket_promedio_producto),
      CPA: exportCpaNumCell(r.cpa),
      'Conversion rate': exportCpaNumCell(r.conversion_rate),
      'Costo publicitario': exportCpaNumCell(r.costo_publicitario),
      Rentabilidad: exportCpaNumCell(r.rentabilidad),
      'Utilidad aproximada': exportCpaNumCell(r.utilidad_aproximada),
    }));

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CPA');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return {
      buffer,
      rowCount: rows.length,
      totalMatching,
      truncated,
    };
  }

  /** Nombres de producto distintos en CPA (para filtros en UI). */
  async getDistinctProductos(): Promise<string[]> {
    const rows = await this.cpaRepository
      .createQueryBuilder('cpa')
      .select('DISTINCT TRIM(cpa.producto)', 'producto')
      .where("cpa.producto IS NOT NULL AND TRIM(cpa.producto) <> ''")
      .orderBy('producto', 'ASC')
      .getRawMany<{ producto: string }>();
    return rows.map((r) => String(r.producto ?? '').trim()).filter(Boolean);
  }

  async findOne(id: number) {
    const cpa = await this.cpaRepository.findOne({ where: { id } });
    if (!cpa) {
      throw new NotFoundException(`CPA with ID ${id} not found`);
    }
    return cpa;
  }

  async update(id: number, updateCpaDto: UpdateCpaDto) {
    const cpa = await this.findOne(id);
    Object.assign(cpa, updateCpaDto);
    return this.cpaRepository.save(cpa);
  }

  async remove(id: number) {
    const cpa = await this.findOne(id);
    return this.cpaRepository.remove(cpa);
  }

  async getDashboardStats(startDate?: string, endDate?: string) {
    const qb = this.cpaRepository.createQueryBuilder('cpa');

    if (startDate && endDate) {
      qb.andWhere(sqlCastDateBetween('cpa.fecha'), {
        startDate: extractCalendarDateParam(startDate),
        endDate: extractCalendarDateParam(endDate),
      });
    }

    const dailyQb = qb.clone();

    const result = await qb
      .select('SUM(cpa.gasto_publicidad)', 'total_gasto_publicidad')
      .addSelect('SUM(cpa.utilidad_aproximada)', 'total_utilidad')
      .addSelect('SUM(cpa.ventas)', 'total_ventas')
      .addSelect('SUM(cpa.conversaciones)', 'total_conversaciones')
      .getRawOne();

    /**
     * CPA agregado: gasto ÷ ventas en el rango (ponderado).
     * No usar SUM(cpa): cada fila ya es un CPA por cuenta/día; sumarlos no tiene sentido económico.
     */
    const totalGasto = Number(result.total_gasto_publicidad || 0);
    const totalVentasCpa = Number(result.total_ventas || 0);
    const totalCpaWeighted = totalVentasCpa > 0 ? totalGasto / totalVentasCpa : 0;

    const dailyResult = await dailyQb
      .select('DATE(cpa.fecha)', 'date')
      .addSelect('SUM(cpa.gasto_publicidad)', 'total_gasto_publicidad')
      .addSelect('SUM(cpa.utilidad_aproximada)', 'total_utilidad')
      .addSelect('SUM(cpa.ventas)', 'total_ventas')
      .addSelect('SUM(cpa.conversaciones)', 'total_conversaciones')
      .groupBy('DATE(cpa.fecha)')
      .orderBy('DATE(cpa.fecha)', 'ASC')
      .getRawMany();

    const daily = dailyResult.map((row) => {
      const dDateStr =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : row.date
            ? String(row.date)
            : '';

      const gasto = Number(row.total_gasto_publicidad || 0);
      const ventas = Number(row.total_ventas || 0);
      const cpaDia = ventas > 0 ? gasto / ventas : 0;

      return {
        date: dDateStr,
        cpa: cpaDia,
        gasto_publicidad: gasto,
        utilidad_aproximada: Number(row.total_utilidad || 0),
        ventas,
        conversaciones: Number(row.total_conversaciones || 0),
      };
    }).filter((d) => Boolean(d.date));

    return {
      totalCpa: totalCpaWeighted,
      totalGasto,
      totalUtilidadCpa: Number(result.total_utilidad || 0),
      totalVentasCpa,
      totalConversacionesCpa: Number(result.total_conversaciones || 0),
      dailyCpa: daily,
    };
  }

  async getResumenDiario(params: {
    startDate?: string;
    endDate?: string;
    producto?: string;
  }): Promise<CpaResumenDiarioResponse> {
    const { startDate, endDate, producto } = params;
    if (!startDate?.trim() || !endDate?.trim()) {
      throw new BadRequestException('startDate y endDate son obligatorios (YYYY-MM-DD).');
    }
    const qb = this.cpaRepository.createQueryBuilder('cpa');
    qb.andWhere(sqlCastDateBetween('cpa.fecha'), {
      startDate: extractCalendarDateParam(startDate),
      endDate: extractCalendarDateParam(endDate),
    });
    if (producto?.trim()) {
      qb.andWhere('cpa.producto ILIKE :prod', { prod: `%${producto.trim()}%` });
    }
    qb.orderBy('cpa.fecha', 'ASC').addOrderBy('cpa.id', 'ASC');
    const rows = await qb.getMany();

    const mergeMap = new Map<string, CpaLeafData>();
    for (const row of rows) {
      if (!row.fecha) continue;
      const fecha = row.fecha instanceof Date ? row.fecha : new Date(row.fecha);
      if (Number.isNaN(fecha.getTime())) continue;
      const p = calendarParts(fecha);
      const mesKey = `${p.y}-${String(p.m).padStart(2, '0')}`;
      const mesLabel = `${MESES[p.m - 1]} ${p.y}`;
      const fechaKey = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      const fechaLabel = `${String(p.day).padStart(2, '0')}-${MESES_CORT[p.m - 1]}`;
      const semana = (row.semana ?? '').trim() || 'Sin semana';
      const cuenta = (row.cuenta_publicitaria ?? '').trim() || '(Sin cuenta)';
      const productoN = (row.producto ?? '').trim() || '(Sin producto)';
      const key = `${mesKey}|${semana}|${fechaKey}|${cuenta}|${productoN}`;
      const exist = mergeMap.get(key);
      const accum = addRowToAccum(exist?.accum ?? emptyAccum(), row);
      mergeMap.set(key, {
        mesKey,
        mesLabel,
        semana,
        fechaKey,
        fechaLabel,
        cuenta,
        producto: productoN,
        accum,
      });
    }
    const leaves = [...mergeMap.values()];
    return buildResumenTree(leaves);
  }
}
