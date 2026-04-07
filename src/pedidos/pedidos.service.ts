import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import * as XLSX from 'xlsx';
import { Pedido } from './entities/pedido.entity';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { ProductosDetalleService } from '../productos-detalle/productos-detalle.service';
import {
  extractCalendarDateParam,
  sqlCastDateBetween,
} from '../common/calendar-date-range';

/** Filtros y orden compartidos entre listado paginado y exportación Excel. */
export type PedidoListQuery = {
  estado_unificado?: string;
  transportadora?: string;
  ciudad?: string;
  /** PK interna (CAST a texto, búsqueda parcial). */
  id?: string;
  id_dropi?: string;
  cliente?: string;
  telefono?: string;
  guia?: string;
  departamento?: string;
  direccion?: string;
  notas?: string;
  notas_manuales?: string;
  producto?: string;
  estado_operativo?: string;
  estado_cartera?: string;
  estatus_original?: string;
  ultimo_mov?: string;
  /** Búsqueda por texto en el número (CAST a texto). */
  venta?: string;
  ganancia_calc?: string;
  flete?: string;
  cartera?: string;
  costo_proveedor?: string;
  costo_devolucion_estimado?: string;
  dias_desde_ult_mov?: string;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  startDate?: string;
  endDate?: string;
  /** Subcadena en fecha (CAST a texto; combinable con rango). */
  fecha_contains?: string;
};

const PEDIDO_SORTABLE_FIELDS = [
  'id',
  'id_dropi',
  'fecha',
  'cliente',
  'telefono',
  'transportadora',
  'estado_operativo',
  'guia',
  'departamento',
  'ciudad',
  'direccion',
  'notas',
  'producto',
  'venta',
  'ganancia_calc',
  'flete',
  'costo_proveedor',
  'costo_devolucion_estimado',
  'cartera',
  'cartera_aplicada',
  'fecha_ult_mov',
  'dias_desde_ult_mov',
  'ultimo_mov',
  'estatus_original',
  'estado_unificado',
  'estado_cartera',
  'notas_manuales',
  'created_at',
  'updated_at',
] as const;

const EXPORT_MAX_ROWS = 50_000;

/** Celda fecha en export: día calendario (evita correr un día con toISOString en medianoche UTC). */
function fmtDateCell(d: Date | string | null | undefined): string {
  if (d == null) return '';
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const y = x.getFullYear();
  const mo = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
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

  private applyIlike(
    qb: SelectQueryBuilder<Pedido>,
    value: string | undefined,
    column: string,
    param: string,
  ): void {
    const t = value?.trim();
    if (!t) return;
    qb.andWhere(`${column} ILIKE :${param}`, { [param]: `%${t}%` });
  }

  private applyNumericTextSearch(
    qb: SelectQueryBuilder<Pedido>,
    value: string | undefined,
    column: string,
    param: string,
  ): void {
    const t = value?.trim();
    if (!t) return;
    qb.andWhere(`CAST(${column} AS TEXT) ILIKE :${param}`, { [param]: `%${t}%` });
  }

  private applyPedidoFilters(qb: SelectQueryBuilder<Pedido>, query?: PedidoListQuery): void {
    if (query?.startDate && query?.endDate) {
      qb.andWhere(sqlCastDateBetween('pedido.fecha'), {
        startDate: extractCalendarDateParam(query.startDate),
        endDate: extractCalendarDateParam(query.endDate),
      });
    }

    this.applyIlike(qb, query?.estado_unificado, 'pedido.estado_unificado', 'estado');
    this.applyIlike(qb, query?.transportadora, 'pedido.transportadora', 'transportadora');
    this.applyNumericTextSearch(qb, query?.id, 'pedido.id', 'pedido_id_txt');
    this.applyIlike(qb, query?.id_dropi, 'pedido.id_dropi', 'id_dropi');
    this.applyIlike(qb, query?.ciudad, 'pedido.ciudad', 'ciudad');
    this.applyIlike(qb, query?.cliente, 'pedido.cliente', 'cliente');
    this.applyIlike(qb, query?.telefono, 'pedido.telefono', 'telefono');
    this.applyIlike(qb, query?.guia, 'pedido.guia', 'guia');
    this.applyIlike(qb, query?.departamento, 'pedido.departamento', 'departamento');
    this.applyIlike(qb, query?.direccion, 'pedido.direccion', 'direccion');
    this.applyIlike(qb, query?.notas, 'pedido.notas', 'notas');
    this.applyIlike(qb, query?.notas_manuales, 'pedido.notas_manuales', 'notas_manuales');
    this.applyIlike(qb, query?.producto, 'pedido.producto', 'producto');
    this.applyIlike(qb, query?.estado_operativo, 'pedido.estado_operativo', 'estado_operativo');
    this.applyIlike(qb, query?.estado_cartera, 'pedido.estado_cartera', 'estado_cartera');
    this.applyIlike(qb, query?.estatus_original, 'pedido.estatus_original', 'estatus_original');
    this.applyIlike(qb, query?.ultimo_mov, 'pedido.ultimo_mov', 'ultimo_mov');

    this.applyNumericTextSearch(qb, query?.venta, 'pedido.venta', 'venta_txt');
    this.applyNumericTextSearch(qb, query?.ganancia_calc, 'pedido.ganancia_calc', 'ganancia_txt');
    this.applyNumericTextSearch(qb, query?.flete, 'pedido.flete', 'flete_txt');
    this.applyNumericTextSearch(qb, query?.cartera, 'pedido.cartera', 'cartera_txt');
    this.applyNumericTextSearch(qb, query?.costo_proveedor, 'pedido.costo_proveedor', 'costo_prov_txt');
    this.applyNumericTextSearch(
      qb,
      query?.costo_devolucion_estimado,
      'pedido.costo_devolucion_estimado',
      'costo_dev_txt',
    );
    this.applyNumericTextSearch(
      qb,
      query?.dias_desde_ult_mov,
      'pedido.dias_desde_ult_mov',
      'dias_mov_txt',
    );

    const fc = query?.fecha_contains?.trim();
    if (fc) {
      qb.andWhere(`CAST(pedido.fecha AS TEXT) ILIKE :fecha_contains`, {
        fecha_contains: `%${fc}%`,
      });
    }
  }

  private applyPedidoOrder(qb: SelectQueryBuilder<Pedido>, query?: PedidoListQuery): void {
    const sortField = query?.sortField || 'id';
    const sortOrder = query?.sortOrder || 'DESC';
    const allowed = PEDIDO_SORTABLE_FIELDS as readonly string[];
    const field = allowed.includes(sortField) ? `pedido.${sortField}` : 'pedido.id';
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
      qb.andWhere(sqlCastDateBetween('pedido.fecha'), {
        startDate: extractCalendarDateParam(startDate),
        endDate: extractCalendarDateParam(endDate),
      });
    }

    const dailyQb = qb.clone();

    const productosQb = this.pedidoRepository
      .createQueryBuilder('pedido')
      .innerJoin('productos_detalle', 'pd', 'pd.pedido_id_dropi = pedido.id_dropi');
    if (startDate && endDate) {
      productosQb.andWhere(sqlCastDateBetween('pedido.fecha'), {
        startDate: extractCalendarDateParam(startDate),
        endDate: extractCalendarDateParam(endDate),
      });
    }

    const guiasDailyQb = this.pedidoRepository.createQueryBuilder('pedido');
    if (startDate && endDate) {
      guiasDailyQb.andWhere(sqlCastDateBetween('pedido.fecha'), {
        startDate: extractCalendarDateParam(startDate),
        endDate: extractCalendarDateParam(endDate),
      });
    }

    const prodDailyQb = this.pedidoRepository
      .createQueryBuilder('pedido')
      .innerJoin('productos_detalle', 'pd', 'pd.pedido_id_dropi = pedido.id_dropi');
    if (startDate && endDate) {
      prodDailyQb.andWhere(sqlCastDateBetween('pedido.fecha'), {
        startDate: extractCalendarDateParam(startDate),
        endDate: extractCalendarDateParam(endDate),
      });
    }

    const [result, productosRow, guiasDailyRows, prodDailyRows] = await Promise.all([
      qb
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
        .addSelect(
          `COUNT(CASE WHEN pedido.guia IS NOT NULL AND TRIM(COALESCE(pedido.guia, '')) <> '' THEN 1 END)::int`,
          'total_guias',
        )
        .getRawOne(),
      productosQb.select('COALESCE(SUM(pd.cantidad), 0)', 'productos_vendidos').getRawOne(),
      guiasDailyQb
        .select('DATE(pedido.fecha)', 'date')
        .addSelect(
          `COUNT(CASE WHEN pedido.guia IS NOT NULL AND TRIM(COALESCE(pedido.guia, '')) <> '' THEN 1 END)::int`,
          'totalGuias',
        )
        .groupBy('DATE(pedido.fecha)')
        .orderBy('DATE(pedido.fecha)', 'ASC')
        .getRawMany(),
      prodDailyQb
        .select('DATE(pedido.fecha)', 'date')
        .addSelect('COALESCE(SUM(pd.cantidad), 0)::bigint', 'productosVendidos')
        .groupBy('DATE(pedido.fecha)')
        .orderBy('DATE(pedido.fecha)', 'ASC')
        .getRawMany(),
    ]);

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

    const dateKey = (v: unknown): string => {
      if (v instanceof Date) return v.toISOString().split('T')[0];
      return v ? String(v).slice(0, 10) : '';
    };

    const guiasByDate = new Map<string, number>();
    for (const r of guiasDailyRows as { date?: unknown; totalGuias?: string | number }[]) {
      const k = dateKey(r.date);
      if (k) guiasByDate.set(k, Number(r.totalGuias ?? 0));
    }
    const prodByDate = new Map<string, number>();
    for (const r of prodDailyRows as { date?: unknown; productosVendidos?: string | number }[]) {
      const k = dateKey(r.date);
      if (k) prodByDate.set(k, Number(r.productosVendidos ?? 0));
    }

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
        totalGuias: guiasByDate.get(dDateStr.slice(0, 10)) ?? 0,
        productosVendidos: prodByDate.get(dDateStr.slice(0, 10)) ?? 0,
      };
    }).filter(d => Boolean(d.date));

    const total = result.total || 0;
    const entregados = result.entregados || 0;
    const devoluciones = result.devoluciones || 0;
    const sinMapear = result.sin_mapear || 0;
    const enProceso = Math.max(0, total - entregados - devoluciones - sinMapear);

    const pr = productosRow as { productos_vendidos?: string | number } | undefined;

    return {
      total,
      entregados,
      devoluciones,
      enProceso,
      totalVentas: Number(result.total_ventas || 0),
      totalGanancia: Number(result.total_ganancia || 0),
      totalCartera: Number(result.total_cartera || 0),
      sinMapear,
      totalGuias: Number(result.total_guias ?? 0),
      productosVendidos: Number(pr?.productos_vendidos ?? 0),
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

