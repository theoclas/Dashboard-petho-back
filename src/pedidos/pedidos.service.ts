import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import * as XLSX from 'xlsx';
import { Pedido } from './entities/pedido.entity';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { ProductosDetalleService } from '../productos-detalle/productos-detalle.service';

/** Filtros y orden compartidos entre listado paginado y exportación Excel. */
export type PedidoListQuery = {
  estado_unificado?: string;
  transportadora?: string;
  ciudad?: string;
  id_dropi?: string;
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

function numCell(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidoRepository: Repository<Pedido>,
    private readonly productosDetalleService: ProductosDetalleService,
  ) { }

  /** Público para flujos batch (remapeo) que preparan filas antes de `bulkUpsertRaw`. */
  recalculateFinancials(pedido: Pedido): void {
    this.calculateFinancials(pedido);
  }

  private calculateFinancials(pedido: Pedido) {
    const venta = Number(pedido.venta ?? 0);
    const flete = Number(pedido.flete ?? 0);
    const costo_proveedor = Number(pedido.costo_proveedor ?? 0);

    pedido.ganancia_calc = venta - flete - costo_proveedor;

    const transportadora = (pedido.transportadora || '').toUpperCase();
    const esInterrapidisimo = transportadora.includes('INTERRAPIDISIMO');
    pedido.costo_devolucion_estimado = esInterrapidisimo ? -flete : -(flete * 0.8);

    // Priorizamos estado_unificado (Estado Asignado) o estado_operativo
    const estado = (pedido.estado_unificado || pedido.estado_operativo || '').toUpperCase();

    if (estado === 'ENTREGADO') {
      pedido.cartera = pedido.ganancia_calc;
    } else if (estado === 'DEVOLUCION' || estado === 'DEVOLUCIÓN') {
      pedido.cartera = pedido.costo_devolucion_estimado;
    } else {
      pedido.cartera = 0;
    }
  }

  async create(createPedidoDto: CreatePedidoDto): Promise<Pedido> {
    const pedido = this.pedidoRepository.create(createPedidoDto);
    this.calculateFinancials(pedido);
    return this.pedidoRepository.save(pedido);
  }

  private createFilteredQueryBuilder(query?: PedidoListQuery): SelectQueryBuilder<Pedido> {
    const qb = this.pedidoRepository.createQueryBuilder('pedido');
    this.applyPedidoFilters(qb, query);
    return qb;
  }

  private applyPedidoFilters(qb: SelectQueryBuilder<Pedido>, query?: PedidoListQuery): void {
    if (query?.startDate && query?.endDate) {
      qb.andWhere('pedido.fecha BETWEEN :startDate AND :endDate', {
        startDate: new Date(query.startDate),
        endDate: new Date(query.endDate),
      });
    }

    if (query?.estado_unificado) {
      qb.andWhere('pedido.estado_unificado ILIKE :estado', {
        estado: `%${query.estado_unificado}%`,
      });
    }

    if (query?.transportadora) {
      qb.andWhere('pedido.transportadora ILIKE :transportadora', {
        transportadora: `%${query.transportadora}%`,
      });
    }

    if (query?.id_dropi) {
      qb.andWhere('pedido.id_dropi ILIKE :id_dropi', {
        id_dropi: `%${query.id_dropi}%`,
      });
    }

    if (query?.ciudad) {
      qb.andWhere('pedido.ciudad ILIKE :ciudad', {
        ciudad: `%${query.ciudad}%`,
      });
    }
  }

  private applyPedidoOrder(qb: SelectQueryBuilder<Pedido>, query?: PedidoListQuery): void {
    const sortField = query?.sortField || 'id';
    const sortOrder = query?.sortOrder || 'DESC';
    const allowedFields = [
      'id',
      'id_dropi',
      'fecha',
      'ciudad',
      'transportadora',
      'venta',
      'ganancia_calc',
      'flete',
      'cartera',
    ];
    const field = allowedFields.includes(sortField) ? `pedido.${sortField}` : 'pedido.id';
    qb.orderBy(field, sortOrder);
    if (field !== 'pedido.id') {
      qb.addOrderBy('pedido.id', 'DESC');
    }
  }

  async findAll(
    query?: PedidoListQuery & { page?: number; limit?: number },
  ): Promise<{ data: Pedido[]; total: number; page: number; limit: number }> {
    const page = query?.page || 1;
    const limit = query?.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.createFilteredQueryBuilder(query);
    this.applyPedidoOrder(qb, query);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * Exporta a Excel los pedidos que cumplen los mismos filtros que el listado (sin paginación).
   * Máximo {@link EXPORT_MAX_ROWS} filas; si hay más coincidencias, se trunca y el cliente puede leerlo en cabeceras HTTP.
   */
  async exportPedidosExcel(query?: PedidoListQuery): Promise<{
    buffer: Buffer;
    rowCount: number;
    totalMatching: number;
    truncated: boolean;
  }> {
    const countQb = this.createFilteredQueryBuilder(query);
    const totalMatching = await countQb.getCount();

    const qb = this.createFilteredQueryBuilder(query);
    this.applyPedidoOrder(qb, query);
    qb.take(EXPORT_MAX_ROWS);
    const rows = await qb.getMany();

    const truncated = totalMatching > EXPORT_MAX_ROWS;

    const sheetRows = rows.map((p) => ({
      'ID Dropi': p.id_dropi ?? '',
      Fecha: fmtDateCell(p.fecha),
      Cliente: p.cliente ?? '',
      Teléfono: p.telefono ?? '',
      Ciudad: p.ciudad ?? '',
      Departamento: p.departamento ?? '',
      Dirección: p.direccion ?? '',
      Transportadora: p.transportadora ?? '',
      Guía: p.guia ?? '',
      'Estado operativo': p.estado_operativo ?? '',
      'Estado unificado': p.estado_unificado ?? '',
      Venta: numCell(p.venta),
      Ganancia: numCell(p.ganancia_calc),
      Flete: numCell(p.flete),
      'Costo proveedor': numCell(p.costo_proveedor),
      'Costo dev. estim.': numCell(p.costo_devolucion_estimado),
      Cartera: numCell(p.cartera),
      'Cartera aplicada': numCell(p.cartera_aplicada),
      'Est. cartera': p.estado_cartera ?? '',
      'Días últ. mov': p.dias_desde_ult_mov ?? '',
      'Notas Dropi': p.notas ?? '',
      'Mis notas': p.notas_manuales ?? '',
      'Estado Dropi': p.estatus_original ?? '',
      'Últ. mov. Dropi': p.ultimo_mov ?? '',
      'Fecha últ. mov': fmtDateCell(p.fecha_ult_mov),
      Producto: p.producto ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return {
      buffer,
      rowCount: rows.length,
      totalMatching,
      truncated,
    };
  }

  async getDashboardStats(startDate?: string, endDate?: string) {
    const qb = this.pedidoRepository.createQueryBuilder('pedido');

    if (startDate && endDate) {
      qb.andWhere('pedido.fecha BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }

    const dailyQb = qb.clone();

    const result = await qb
      .select('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(CASE WHEN pedido.estado_unificado = 'ENTREGADO' OR pedido.estado_operativo = 'ENTREGADO' THEN 1 END)::int`,
        'entregados',
      )
      .addSelect(
        `COUNT(CASE WHEN pedido.estado_unificado ILIKE '%DEVOLUCI%' OR pedido.estado_operativo ILIKE '%DEVOLUCI%' THEN 1 END)::int`,
        'devoluciones',
      )
      .addSelect(
        `COUNT(CASE WHEN pedido.estado_unificado = 'SIN MAPEAR' THEN 1 END)::int`,
        'sin_mapear',
      )
      .addSelect(`COALESCE(SUM(pedido.venta), 0)::numeric`, 'total_ventas')
      .addSelect(`COALESCE(SUM(pedido.ganancia_calc), 0)::numeric`, 'total_ganancia')
      .addSelect(`COALESCE(SUM(pedido.cartera), 0)::numeric`, 'total_cartera')
      .getRawOne();

    const dailyResult = await dailyQb
      .select('DATE(pedido.fecha)', 'date')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(CASE WHEN pedido.estado_unificado = 'ENTREGADO' OR pedido.estado_operativo = 'ENTREGADO' THEN 1 END)::int`,
        'entregados',
      )
      .addSelect(
        `COUNT(CASE WHEN pedido.estado_unificado ILIKE '%DEVOLUCI%' OR pedido.estado_operativo ILIKE '%DEVOLUCI%' THEN 1 END)::int`,
        'devoluciones',
      )
      .addSelect(
        `COUNT(CASE WHEN pedido.estado_unificado = 'SIN MAPEAR' THEN 1 END)::int`,
        'sin_mapear',
      )
      .addSelect(`COALESCE(SUM(pedido.venta), 0)::numeric`, 'total_ventas')
      .addSelect(`COALESCE(SUM(pedido.ganancia_calc), 0)::numeric`, 'total_ganancia')
      .addSelect(`COALESCE(SUM(pedido.cartera), 0)::numeric`, 'total_cartera')
      .groupBy('DATE(pedido.fecha)')
      .orderBy('DATE(pedido.fecha)', 'ASC')
      .getRawMany();

    const daily = dailyResult.map(row => {
      const dTotal = row.total || 0;
      const dEntregados = row.entregados || 0;
      const dDevoluciones = row.devoluciones || 0;
      const dSinMapear = row.sin_mapear || 0;
      const dEnProceso = Math.max(0, dTotal - dEntregados - dDevoluciones - dSinMapear);

      const dDateStr = row.date instanceof Date 
        ? row.date.toISOString().split('T')[0] 
        : (row.date ? String(row.date) : '');

      return {
        date: dDateStr,
        total: dTotal,
        entregados: dEntregados,
        devoluciones: dDevoluciones,
        enProceso: dEnProceso,
        sinMapear: dSinMapear,
        totalVentas: Number(row.total_ventas || 0),
        totalGanancia: Number(row.total_ganancia || 0),
        totalCartera: Number(row.total_cartera || 0),
      };
    }).filter(d => Boolean(d.date));

    const total = result.total || 0;
    const entregados = result.entregados || 0;
    const devoluciones = result.devoluciones || 0;
    const sinMapear = result.sin_mapear || 0;
    const enProceso = Math.max(0, total - entregados - devoluciones - sinMapear);

    return {
      total,
      entregados,
      devoluciones,
      enProceso,
      totalVentas: Number(result.total_ventas || 0),
      totalGanancia: Number(result.total_ganancia || 0),
      totalCartera: Number(result.total_cartera || 0),
      sinMapear,
      daily,
    };
  }

  async findOne(id: number): Promise<Pedido> {
    const pedido = await this.pedidoRepository.findOneBy({ id });
    if (!pedido) {
      throw new NotFoundException(`Pedido con ID ${id} no encontrado`);
    }
    return pedido;
  }

  async findByDropiId(idDropi: string) {
    const pedido = await this.pedidoRepository.findOneBy({ id_dropi: idDropi });
    if (!pedido) {
      throw new NotFoundException(`Pedido con id_dropi ${idDropi} no encontrado`);
    }

    // Traer los productos relacionados por id_dropi
    const productos = await this.productosDetalleService.findAll(idDropi);

    return {
      ...pedido,
      productos,
    };
  }

  async update(id: number, updatePedidoDto: UpdatePedidoDto): Promise<Pedido> {
    const pedido = await this.findOne(id);
    Object.assign(pedido, updatePedidoDto);
    this.calculateFinancials(pedido);
    return this.pedidoRepository.save(pedido);
  }

  async remove(id: number): Promise<void> {
    const pedido = await this.findOne(id);
    await this.pedidoRepository.remove(pedido);
  }

  async upsertByDropiId(data: Partial<Pedido>): Promise<Pedido> {
    const existing = await this.pedidoRepository.findOneBy({
      id_dropi: data.id_dropi,
    });
    if (existing) {
      Object.assign(existing, data);
      this.calculateFinancials(existing);
      return this.pedidoRepository.save(existing);
    }
    const pedido = this.pedidoRepository.create(data);
    this.calculateFinancials(pedido);
    return this.pedidoRepository.save(pedido);
  }

  async bulkUpsert(records: Partial<Pedido>[]): Promise<number> {
    let count = 0;
    for (const record of records) {
      await this.upsertByDropiId(record);
      count++;
    }
    return count;
  }

  /**
   * OPTIMIZADO: Upsert masivo en lotes de 500 filas usando
   * INSERT ... ON CONFLICT (id_dropi) DO UPDATE.
   * De N roundtrips a la BD → ceil(N/500) roundtrips.
   */
  async bulkUpsertRaw(records: Partial<Pedido>[]): Promise<number> {
    if (!records.length) return 0;

    const BATCH_SIZE = 500;
    let total = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await this.pedidoRepository
        .createQueryBuilder()
        .insert()
        .into(Pedido)
        .values(batch as Pedido[])
        .orUpdate(
          [
            'fecha', 'cliente', 'transportadora', 'estado_operativo', 'guia',
            'departamento', 'ciudad', 'direccion', 'telefono', 'notas',
            'venta', 'ganancia_calc', 'flete', 'costo_devolucion_estimado',
            'costo_proveedor', 'estatus_original', 'ultimo_mov', 'fecha_ult_mov',
            'hora_ult_mov', 'dias_desde_ult_mov', 'estado_unificado',
            'cartera', 'cartera_aplicada', 'estado_cartera',
          ],
          ['id_dropi'],
        )
        .execute();
      total += batch.length;
    }

    return total;
  }
}

