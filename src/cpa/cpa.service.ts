import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCpaDto } from './dto/create-cpa.dto';
import { UpdateCpaDto } from './dto/update-cpa.dto';
import { Cpa } from './entities/cpa.entity';
import {
  extractCalendarDateParam,
  sqlCastDateBetween,
} from '../common/calendar-date-range';

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
    if (!data.fecha || !data.producto || !data.cuenta_publicitaria) {
      return this.create(data as CreateCpaDto);
    }

    const existing = await this.cpaRepository.findOne({
      where: {
        fecha: data.fecha,
        producto: data.producto,
        cuenta_publicitaria: data.cuenta_publicitaria,
      },
    });

    if (existing) {
      Object.assign(existing, data);
      return this.cpaRepository.save(existing);
    }

    return this.create(data as CreateCpaDto);
  }

  /** Clave natural para upsert (fecha calendario local + producto + cuenta). */
  private cpaNaturalKey(r: Partial<Cpa>): string {
    const f = r.fecha;
    if (!f) return '';
    const d = f instanceof Date ? f : new Date(f);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}|${String(r.producto ?? '').trim()}|${String(r.cuenta_publicitaria ?? '').trim()}`;
  }

  /**
   * Import masivo: deduplica por (fecha, producto, cuenta), carga existentes por lotes
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
      const where = batch.map((r) => ({
        fecha: r.fecha as Date,
        producto: r.producto as string,
        cuenta_publicitaria: (r.cuenta_publicitaria ?? '') as string,
      }));

      const existing = await this.cpaRepository.find({ where });
      const byKey = new Map<string, Cpa>();
      for (const e of existing) {
        byKey.set(this.cpaNaturalKey(e), e);
      }

      const toSave: Cpa[] = [];
      for (const r of batch) {
        const k = this.cpaNaturalKey(r);
        const hit = byKey.get(k);
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

  async findAll(query?: {
    producto?: string;
    sortField?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<Cpa[]> {
    const qb = this.cpaRepository.createQueryBuilder('cpa');
    if (query?.producto?.trim()) {
      qb.andWhere('cpa.producto ILIKE :prod', {
        prod: `%${query.producto.trim()}%`,
      });
    }
    const sortField = query?.sortField || 'fecha';
    const sortOrder = query?.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    const field = this.cpaSortableFields.includes(sortField as (typeof this.cpaSortableFields)[number])
      ? `cpa.${sortField}`
      : 'cpa.fecha';
    qb.orderBy(field, sortOrder);
    if (field !== 'cpa.id') {
      qb.addOrderBy('cpa.id', 'DESC');
    }
    return qb.getMany();
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
      .select('SUM(cpa.cpa)', 'total_cpa')
      .addSelect('SUM(cpa.gasto_publicidad)', 'total_gasto_publicidad')
      .addSelect('SUM(cpa.utilidad_aproximada)', 'total_utilidad')
      .addSelect('SUM(cpa.ventas)', 'total_ventas')
      .addSelect('SUM(cpa.conversaciones)', 'total_conversaciones')
      .getRawOne();

    const dailyResult = await dailyQb
      .select('DATE(cpa.fecha)', 'date')
      .addSelect('SUM(cpa.cpa)', 'total_cpa')
      .addSelect('SUM(cpa.gasto_publicidad)', 'total_gasto_publicidad')
      .addSelect('SUM(cpa.utilidad_aproximada)', 'total_utilidad')
      .addSelect('SUM(cpa.ventas)', 'total_ventas')
      .addSelect('SUM(cpa.conversaciones)', 'total_conversaciones')
      .groupBy('DATE(cpa.fecha)')
      .orderBy('DATE(cpa.fecha)', 'ASC')
      .getRawMany();

    const daily = dailyResult.map(row => {
      const dDateStr = row.date instanceof Date 
        ? row.date.toISOString().split('T')[0] 
        : (row.date ? String(row.date) : '');
      
      return {
        date: dDateStr,
        cpa: Number(row.total_cpa || 0),
        gasto_publicidad: Number(row.total_gasto_publicidad || 0),
        utilidad_aproximada: Number(row.total_utilidad || 0),
        ventas: Number(row.total_ventas || 0),
        conversaciones: Number(row.total_conversaciones || 0),
      };
    }).filter(d => Boolean(d.date));

    // Notice we report 'cpa' as metric, so the chart works easily
    return {
      totalCpa: Number(result.total_cpa || 0),
      totalGasto: Number(result.total_gasto_publicidad || 0),
      totalUtilidadCpa: Number(result.total_utilidad || 0),
      totalVentasCpa: Number(result.total_ventas || 0),
      totalConversacionesCpa: Number(result.total_conversaciones || 0),
      dailyCpa: daily,
    };
  }
}
