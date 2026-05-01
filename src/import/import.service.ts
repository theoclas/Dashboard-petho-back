import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { DataSource } from 'typeorm';
import { PedidosService } from '../pedidos/pedidos.service';
import { CarteraService } from '../cartera/cartera.service';
import { MapeoEstadosService } from '../mapeo-estados/mapeo-estados.service';
import { NotasService } from '../notas/notas.service';
import { ProductosDetalleService } from '../productos-detalle/productos-detalle.service';
import { CpaService } from '../cpa/cpa.service';
import { applyCpaDerivedFields } from '../cpa/cpa-derived-fields';
import { Cpa } from '../cpa/entities/cpa.entity';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { ProductoDetalle } from '../productos-detalle/entities/producto-detalle.entity';
import { CarteraMovimiento } from '../cartera/entities/cartera-movimiento.entity';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly pedidosService: PedidosService,
    private readonly carteraService: CarteraService,
    private readonly mapeoEstadosService: MapeoEstadosService,
    private readonly notasService: NotasService,
    private readonly productosDetalleService: ProductosDetalleService,
    private readonly cpaService: CpaService,
    private readonly dataSource: DataSource,
  ) {}

  private hashWipeSecret(plain: string): Buffer {
    return crypto.createHash('sha256').update(plain, 'utf8').digest();
  }

  /** Misma clave que IMPORT_WIPE_SECRET (hash SHA-256, comparación timing-safe). */
  private assertWipePassword(password: string): void {
    const configured = process.env.IMPORT_WIPE_SECRET?.trim();
    if (!configured) {
      throw new ForbiddenException(
        'Limpieza deshabilitada: define IMPORT_WIPE_SECRET en el servidor.',
      );
    }
    const a = this.hashWipeSecret(password);
    const b = this.hashWipeSecret(configured);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }
  }

  /**
   * Vacía tablas cargadas por import (pedidos, líneas de producto, movimientos de cartera).
   * Requiere IMPORT_WIPE_SECRET en .env y contraseña idéntica (comparación por hash, timing-safe).
   * No borra: mapeo_estados, notas_manuales, cpas, usuarios.
   */
  async wipeImportedTables(companyId: number, password: string): Promise<{
    deleted: {
      productos_detalle: number;
      cartera_movimientos: number;
      pedidos: number;
    };
  }> {
    this.assertWipePassword(password);

    return this.dataSource.transaction(async (manager) => {
      const nPd = await manager.count(ProductoDetalle, { where: { empresa_id: companyId } });
      const nCar = await manager.count(CarteraMovimiento, { where: { empresa_id: companyId } });
      const nPe = await manager.count(Pedido, { where: { empresa_id: companyId } });

      await manager.createQueryBuilder().delete().from(ProductoDetalle).where('empresa_id = :companyId', { companyId }).execute();
      await manager.createQueryBuilder().delete().from(CarteraMovimiento).where('empresa_id = :companyId', { companyId }).execute();
      await manager.createQueryBuilder().delete().from(Pedido).where('empresa_id = :companyId', { companyId }).execute();

      this.logger.warn(
        `WIPE tablas import: productos_detalle=${nPd}, cartera_movimientos=${nCar}, pedidos=${nPe}`,
      );

      return {
        deleted: {
          productos_detalle: nPd,
          cartera_movimientos: nCar,
          pedidos: nPe,
        },
      };
    });
  }

  /**
   * Elimina todos los registros de la tabla cpas.
   * Usa la misma contraseña que IMPORT_WIPE_SECRET (igual que wipe-imported-tables).
   */
  async wipeCpaTable(companyId: number, password: string): Promise<{ deleted: number }> {
    this.assertWipePassword(password);

    return this.dataSource.transaction(async (manager) => {
      const n = await manager.count(Cpa, { where: { empresa_id: companyId } });
      await manager.createQueryBuilder().delete().from(Cpa).where('empresa_id = :companyId', { companyId }).execute();
      this.logger.warn(`WIPE tabla cpas: ${n} filas eliminadas`);
      return { deleted: n };
    });
  }

  private async getResolverEnMemoria(companyId: number) {
    const todosMapeos = await this.mapeoEstadosService.findAll(companyId);
    const normStr = (s?: string | null) => {
      if (!s) return '';
      let text = s.toLowerCase().trim();
      text = text.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
                 .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
      return text;
    };

    const mapeosNormalizados = todosMapeos.map((m) => ({
      t: normStr(m.transportadora),
      e: normStr(m.estatus_original),
      m: normStr(m.ultimo_movimiento),
      estadoUnificado: m.estado_unificado,
    }));

    return (transportadora?: string, pedidoKey?: string, ultimoMov?: string) => {
      const t = normStr(transportadora);
      const e = normStr(pedidoKey);
      const m = normStr(ultimoMov);

      let match = mapeosNormalizados.find((x) => x.t === t && x.e === e && x.m === m);
      if (match) return match.estadoUnificado;

      match = mapeosNormalizados.find((x) => x.t === t && x.e === e && x.m === '');
      if (match) return match.estadoUnificado;

      match = mapeosNormalizados.find((x) => x.e === e);
      if (match) return match.estadoUnificado;

      return null;
    };
  }

  /**
   * OPTIMIZADO: Importa PEDIDOS con bulk insert por lotes de 500.
   * Elimina el N+1 de cartera cargando todo el mapa de cartera en memoria de una sola vez.
   */
  async importPedidos(
    companyId: number,
    buffer: Buffer,
  ): Promise<{ imported: number; errors: string[] }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames.find((s) => s === 'Sheet1') || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    if (!ws) throw new BadRequestException('No se encontró la hoja Sheet1');

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
      defval: null,
    });

    this.logger.log(`Procesando ${rows.length} filas de pedidos...`);

    const errors: string[] = [];
    const pedidosParaInsertar: Partial<Pedido>[] = [];

    // ══ 1. Cargar mapa de estados EN MEMORIA (1 sola query) ══
    const resolveEstadoEnMemoria = await this.getResolverEnMemoria(companyId);

    // ══ 2. Extraer todos los IDs del Excel para hacer 1 sola consulta de cartera ══
    const todosLosIds: string[] = rows
      .map((r) => this.toString(r['ID']))
      .filter((id): id is string => !!id);

    // ══ 3. Cargar TODA la cartera relevante en memoria de UN SOLO GOLPE ══
    this.logger.log(`Cargando mapa de cartera para ${todosLosIds.length} pedidos en una sola query...`);
    const carteraMap = await this.carteraService.getCarteraMapByOrdenIds(companyId, todosLosIds);
    this.logger.log(`Mapa de cartera cargado: ${carteraMap.size} entradas.`);

    // ══ 4. Procesar todas las filas en memoria (sin tocar la BD) ══
    const normalizeKey = (text: string): string => {
      let s = text.toLowerCase().trim();
      s = s.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
           .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
      return s;
    };

    for (const row of rows) {
      try {
        const idDropi = this.toString(row['ID']);
        if (!idDropi) continue;

        const transportadora = this.toString(row['TRANSPORTADORA']);
        const venta =
          this.toNumber(row['VALOR DE COMPRA EN PRODUCTOS']) ||
          this.toNumber(row['VALOR FACTURADO']) ||
          this.toNumber(row['TOTAL DE LA ORDEN']) ||
          0;
        const flete = this.toNumber(row['PRECIO FLETE']) || 0;
        const costoProveedor = this.toNumber(row['TOTAL EN PRECIOS DE PROVEEDOR']) || 0;
        const estatusOriginal = this.toString(row['ESTATUS']) || '';
        const ultimoMov = this.toString(row['ÚLTIMO MOVIMIENTO']);
        const fechaUltMov = this.parseDate(row['FECHA DE ÚLTIMO MOVIMIENTO']);

        const gananciaCalc = venta - flete - costoProveedor;

        const esInterrapidisimo = transportadora
          ? transportadora.toUpperCase().includes('INTERRAPIDISIMO')
          : false;
        const costoDevolucionEstimado = esInterrapidisimo ? -(flete) : -(flete * 0.8);

        let diasDesdeUltMov: number | undefined;
        if (fechaUltMov) {
          const now = new Date();
          diasDesdeUltMov = Math.floor(
            (now.getTime() - fechaUltMov.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        const estNorm = normalizeKey(estatusOriginal);
        const movNorm = ultimoMov ? normalizeKey(ultimoMov) : '';

        let pedidoKey: string | undefined;
        if (estNorm !== '' && estNorm !== 'guia_generada' && estNorm !== 'guia generada') {
          pedidoKey = estatusOriginal;
        } else if (movNorm !== '') {
          pedidoKey = ultimoMov;
        } else {
          pedidoKey = estatusOriginal;
        }

        let estadoUnificado = resolveEstadoEnMemoria(transportadora, pedidoKey, ultimoMov);
        if (!estadoUnificado || estadoUnificado.trim() === '') {
          estadoUnificado = 'SIN MAPEAR';
        }

        let estadoOperativo = estadoUnificado;
        if (estadoUnificado === 'OFICINA' && diasDesdeUltMov !== undefined && diasDesdeUltMov > 1) {
          estadoOperativo = 'OFICINA 1';
        }

        // ═══ Lookup en memoria O(1) — sin query a la BD ═══
        const carteraNeto = carteraMap.get(idDropi) || 0;

        const estadosConCartera = ['ENTREGADO', 'DEVOLUCION', 'DEVOLUCIÓN'];
        const carteraAplicada = estadosConCartera.includes(estadoUnificado.toUpperCase())
          ? carteraNeto
          : 0;

        const estadoCartera =
          carteraNeto !== 0 && estadosConCartera.includes(estadoUnificado.toUpperCase())
            ? 'OK'
            : '';

        let cartera = 0;
        if (estadoOperativo === 'ENTREGADO') {
          cartera = gananciaCalc;
        } else if (estadoOperativo === 'DEVOLUCION' || estadoOperativo === 'DEVOLUCIÓN') {
          cartera = costoDevolucionEstimado;
        }

        pedidosParaInsertar.push({
          id_dropi: idDropi,
          fecha: this.parseDate(row['FECHA']),
          cliente: this.toString(row['NOMBRE CLIENTE']),
          transportadora,
          estado_operativo: estadoOperativo,
          guia: this.toString(row['NÚMERO GUIA']),
          departamento: this.toString(row['DEPARTAMENTO DESTINO']),
          ciudad: this.toString(row['CIUDAD DESTINO']),
          direccion: this.toString(row['DIRECCION']),
          telefono: this.toString(row['TELÉFONO']),
          notas: this.toString(row['NOTAS']),
          venta,
          ganancia_calc: gananciaCalc,
          flete,
          costo_devolucion_estimado: costoDevolucionEstimado,
          costo_proveedor: costoProveedor,
          estatus_original: estatusOriginal,
          ultimo_mov: ultimoMov,
          fecha_ult_mov: fechaUltMov,
          hora_ult_mov: this.parseTime(row['HORA DE ÚLTIMO MOVIMIENTO']),
          dias_desde_ult_mov: diasDesdeUltMov,
          estado_unificado: estadoUnificado,
          cartera,
          cartera_aplicada: carteraAplicada,
          estado_cartera: estadoCartera,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Fila con ID ${row['ID']}: ${msg}`);
      }
    }

    // ══ 5. Enviar TODOS los pedidos a la BD en lotes de 500 ══
    this.logger.log(`Enviando ${pedidosParaInsertar.length} pedidos a la BD en lotes de 500...`);
    const imported = await this.pedidosService.bulkUpsertRaw(companyId, pedidosParaInsertar);

    this.logger.log(`Pedidos importados: ${imported}. Errores: ${errors.length}`);
    return { imported, errors };
  }

  /**
   * OPTIMIZADO: Importa PRODUCTOS agrupando todo y haciendo bulk delete + bulk insert
   * de todos los grupos en el menor número de queries posible.
   */
  async importProductos(
    companyId: number,
    buffer: Buffer,
  ): Promise<{ imported: number; errors: string[] }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames.find((s) => s === 'Sheet1') || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    if (!ws) throw new BadRequestException('No se encontró la hoja Sheet1');

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
      defval: null,
    });

    this.logger.log(`Procesando ${rows.length} filas de productos...`);

    const errors: string[] = [];
    let imported = 0;

    // Agrupar todos los productos por pedido en memoria
    const productosPorPedido = new Map<string, any[]>();

    for (const row of rows) {
      const pedidoIdDropi = this.toString(row['ID']);
      if (!pedidoIdDropi) continue;

      const productoData = {
        pedido_id_dropi: pedidoIdDropi,
        producto_id: this.toString(row['PRODUCTO ID']),
        sku: this.toString(row['SKU']),
        variacion_id: this.toString(row['VARIACION ID']),
        producto_nombre: this.toString(row['PRODUCTO']),
        variacion: this.toString(row['VARIACION']),
        cantidad: this.toNumber(row['CANTIDAD']) || 0,
        precio_proveedor: this.toNumber(row['PRECIO PROVEEDOR']),
        precio_proveedor_x_cantidad: this.toNumber(row['PRECIO PROVEEDOR X CANTIDAD']),
      };

      if (!productosPorPedido.has(pedidoIdDropi)) {
        productosPorPedido.set(pedidoIdDropi, []);
      }
      productosPorPedido.get(pedidoIdDropi)!.push(productoData);
    }

    // Aplanar TODOS los productos en un array y colectar todos los IDs de pedidos
    const todosLosProductos: any[] = [];
    const todosPedidoIds = Array.from(productosPorPedido.keys());

    for (const productos of productosPorPedido.values()) {
      todosLosProductos.push(...productos);
    }

    try {
      // 1 sola operación de DELETE para todos los pedidos afectados (IN (...))
      if (todosPedidoIds.length > 0) {
        // Hacemos delete en lotes para no exceder el límite de parámetros de postgres
        const DELETE_BATCH = 1000;
        for (let i = 0; i < todosPedidoIds.length; i += DELETE_BATCH) {
          const batch = todosPedidoIds.slice(i, i + DELETE_BATCH);
          await Promise.all(
            batch.map((id) => this.productosDetalleService.deleteByPedidoDropiId(companyId, id)),
          );
        }
      }

      // 1 solo bulk insert para todos los productos
      if (todosLosProductos.length > 0) {
        imported = await this.productosDetalleService.bulkInsert(companyId, todosLosProductos);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error en inserción masiva de productos: ${msg}`);
    }

    this.logger.log(`Productos importados: ${imported}. Errores: ${errors.length}`);
    return { imported, errors };
  }

  /**
   * OPTIMIZADO: Importa CARTERA acumulando todos los registros en memoria
   * y enviándolos en un solo bulk upsert por lotes de 500.
   */
  async importCartera(
    companyId: number,
    buffer: Buffer,
  ): Promise<{ imported: number; errors: string[] }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName =
      wb.SheetNames.find((s) => s === 'HISTORIAL DE CARTERA') ||
      wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    if (!ws)
      throw new BadRequestException(
        'No se encontró la hoja HISTORIAL DE CARTERA',
      );

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
      defval: null,
    });

    this.logger.log(`Procesando ${rows.length} filas de cartera...`);

    const errors: string[] = [];
    const registros: any[] = [];

    // Parsear todo en memoria, sin tocar la BD
    for (const row of rows) {
      try {
        const id = this.toNumber(row['ID']);
        if (!id) continue;

        registros.push({
          id,
          fecha: this.parseDateTime(row['FECHA']),
          tipo: this.toString(row['TIPO']),
          monto: this.toNumber(row['MONTO']),
          monto_previo: this.toNumber(row['MONTO PREVIO']),
          orden_id: this.toString(row['ORDEN ID']),
          numero_guia: this.toString(row['NUMERO DE GUIA']),
          descripcion: this.toString(row['DESCRIPCIÓN']),
          concepto_retiro: this.toString(row['CONCEPTO DE RETIRO']),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Fila cartera ID ${row['ID']}: ${msg}`);
      }
    }

    // Un solo bulk upsert con lotes de 500
    const imported = await this.carteraService.bulkUpsert(companyId, registros);

    this.logger.log(`Cartera importada: ${imported}. Errores: ${errors.length}`);
    return { imported, errors };
  }

  /**
   * OPTIMIZADO: CPA con cabeceras flexibles, varias hojas posibles y persistencia por lotes
   * (bulkUpsertFromImport), sin un round-trip a BD por fila.
   */
  async importCpa(
    companyId: number,
    buffer: Buffer,
  ): Promise<{ imported: number; errors: string[] }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName =
      wb.SheetNames.find((s) => s.toLowerCase().replace(/\s+/g, '_') === 'input_data') ||
      wb.SheetNames.find((s) => s === 'Sheet1') ||
      wb.SheetNames[0];
    const ws = sheetName ? wb.Sheets[sheetName] : undefined;

    if (!ws) {
      throw new BadRequestException(
        `No se encontró una hoja válida en el Excel. Hojas: ${wb.SheetNames.join(', ')}`,
      );
    }

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
      defval: null,
    });

    this.logger.log(`CPA: hoja "${sheetName}", ${rows.length} filas (cabeceras flexibles + bulk upsert)...`);

    const errors: string[] = [];
    const toImport: Partial<Cpa>[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const excelRow = idx + 2;

      try {
        const fecha = this.parseDate(
          this.getExcelCell(row, 'Fecha', 'FECHA', 'Date', 'DATE', 'Día', 'Dia'),
        );
        const producto = this.toString(
          this.getExcelCell(row, 'Producto', 'PRODUCTO', 'Product', 'SKU', 'Nombre producto'),
        );

        if (!fecha && !producto) continue;
        if (!fecha || !producto) {
          errors.push(`Fila ${excelRow}: se requieren fecha y producto`);
          continue;
        }

        const cuentaRaw = this.toString(
          this.getExcelCell(
            row,
            'Cuenta publicitaria',
            'Cuenta Publicitaria',
            'CUENTA PUBLICITARIA',
            'Cuenta',
            'CUENTA',
            'Cuenta pub',
            'Cuenta Pub.',
            'Account',
          ),
        );
        const cuenta_publicitaria = cuentaRaw ?? '';

        const cpaData: Partial<Cpa> = {
          semana: this.toString(this.getExcelCell(row, 'SEMANA', 'Semana', 'Week', 'Semana mes')),
          fecha,
          producto,
          cuenta_publicitaria,
          gasto_publicidad: this.toCpaNullableNumber(
            this.getExcelCell(
              row,
              'GASTO PUBLICIDAD',
              'Gasto publicidad',
              'Gasto Publicidad',
              'Gasto pub',
              'Gasto Pub.',
              'Gasto Pub',
              'GASTO PUB',
            ),
          ),
          conversaciones: this.toCpaNullableNumber(
            this.getExcelCell(row, 'CONVERSACIONES', 'Conversaciones', 'Conversiones'),
          ),
          total_facturado: this.toCpaNullableNumber(
            this.getExcelCell(row, 'TOTAL FACTURADO', 'Total facturado', 'Total Facturado'),
          ),
          ganancia_promedio: this.toCpaNullableNumber(
            this.getExcelCell(row, 'GANANCIA PROMEDIO', 'Ganancia promedio', 'Ganancia Promedio'),
          ),
          ventas: this.toCpaNullableNumber(
            this.getExcelCell(row, 'VENTAS', 'Ventas', 'Unidades', 'Cantidad ventas'),
          ),
          ticket_promedio_producto: this.toCpaNullableNumber(
            this.getExcelCell(
              row,
              'TICKET PROMEDIO DE PRODUCTO   ',
              'TICKET PROMEDIO DE PRODUCTO',
              'Ticket promedio de producto',
              'Ticket promedio producto',
              'Ticket Promedio',
            ),
          ),
          cpa: this.toCpaNullableNumber(this.getExcelCell(row, 'CPA', 'Cpa', 'Costo por adquisición')),
          conversion_rate: this.toCpaNullableNumber(
            this.getExcelCell(row, 'CONVERSION RATE', 'Conversion rate', 'Conversion Rate', 'Tasa conversión'),
          ),
          costo_publicitario: this.toCpaNullableNumber(
            this.getExcelCell(row, 'COSTO PUBLICITARIO', 'Costo publicitario', 'Costo Publicitario'),
          ),
          rentabilidad: this.toCpaNullableNumber(this.getExcelCell(row, 'RENTABILIDAD', 'Rentabilidad')),
          utilidad_aproximada: this.toCpaNullableNumber(
            this.getExcelCell(
              row,
              'UTILIDAD APROXIMADA',
              'Utilidad aproximada',
              'Utilidad Aproximada',
              'UTILIDAD APROX',
            ),
          ),
        };

        applyCpaDerivedFields(cpaData);
        toImport.push(cpaData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Fila ${excelRow}: ${msg}`);
      }
    }

    const imported = await this.cpaService.bulkUpsertFromImport(companyId, toImport);

    this.logger.log(`CPA importado: ${imported} registros. Errores de fila: ${errors.length}`);
    return { imported, errors };
  }


  /**
   * Importa el archivo de MAPEO DE ESTADOS.
   */
  async importMapeoEstados(
    companyId: number,
    buffer: Buffer,
  ): Promise<{ imported: number; errors: string[] }> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes('mapeo')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    if (!ws) throw new BadRequestException('No se encontró la hoja en el archivo Excel');

    const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    });

    this.logger.log(`Procesando filas crudas de Mapeo de Estados...`);

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, rawRows.length); i++) {
      const row = rawRows[i];
      if (Array.isArray(row) && row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('estatus_original'))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new BadRequestException('No se encontró la columna "estatus_original" en las primeras filas del Excel');
    }

    const headers = rawRows[headerRowIndex].map(h => (h ? String(h).toLowerCase().trim() : ''));
    
    const errors: string[] = [];
    const records = [];

    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!Array.isArray(row) || row.length === 0 || row.every(cell => cell === null || cell === '')) continue;

      try {
        const getVal = (colNameMatches: string[]) => {
          const index = headers.findIndex(h => colNameMatches.some(m => h.includes(m)));
          return index !== -1 ? this.toString(row[index]) : undefined;
        };

        const estatusOriginal = getVal(['estatus_original', 'estatus original']);
        if (!estatusOriginal) continue;

        const record = {
          transportadora: getVal(['transportadora']) || '',
          estatus_original: estatusOriginal,
          ultimo_movimiento: getVal(['ultimo_movimiento', 'último movimiento', 'ultimo movimiento']) || '',
          estado_unificado: getVal(['estado_unificado', 'estado unificado']) || 'SIN MAPEAR',
        };

        records.push(record);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Error en fila ${i + 1}: ${msg}`);
      }
    }

    let imported = 0;
    if (records.length > 0) {
      imported = await this.mapeoEstadosService.bulkUpsert(companyId, records);
    }

    this.logger.log(`Mapeos importados: ${imported}. Errores: ${errors.length}`);
    return { imported, errors };
  }

  /**
   * Remapeo masivo optimizado (mismo patrón que import Excel):
   * - Paginación fija en `SIN MAPEAR` (siempre página 1 hasta agotar).
   * - Una query de cartera por lote (`getCarteraMapByOrdenIds`).
   * - Persistencia con `bulkUpsertRaw` (pocos round-trips vs N upserts).
   */
  async remapearPedidos(companyId: number): Promise<{ procesados: number; remapeados: number }> {
    const BATCH = 400;
    const resolveEstadoEnMemoria = await this.getResolverEnMemoria(companyId);

    const normalizeKey = (text: string): string => {
      let s = text.toLowerCase().trim();
      s = s.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
           .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
      return s;
    };

    let procesados = 0;
    let remapeados = 0;
    let batchIndex = 0;

    while (true) {
      const { data: pedidosPendientes } = await this.pedidosService.findAll({
        companyId,
        estado_unificado: 'SIN MAPEAR',
        page: 1,
        limit: BATCH,
      });

      if (pedidosPendientes.length === 0) break;

      batchIndex++;
      const ids = pedidosPendientes.map((p) => p.id_dropi).filter(Boolean);
      const carteraMap = await this.carteraService.getCarteraMapByOrdenIds(companyId, ids);

      const toUpsert: Pedido[] = [];

      for (const pedido of pedidosPendientes) {
        procesados++;

        const estNorm = normalizeKey(pedido.estatus_original || '');
        const movNorm = pedido.ultimo_mov ? normalizeKey(pedido.ultimo_mov) : '';

        let pedidoKey: string | undefined;
        if (estNorm !== '' && estNorm !== 'guia_generada' && estNorm !== 'guia generada') {
          pedidoKey = pedido.estatus_original;
        } else if (movNorm !== '') {
          pedidoKey = pedido.ultimo_mov;
        } else {
          pedidoKey = pedido.estatus_original;
        }

        const estadoUnificado = resolveEstadoEnMemoria(
          pedido.transportadora,
          pedidoKey,
          pedido.ultimo_mov,
        );

        if (!estadoUnificado || estadoUnificado.trim() === '') continue;

        let estadoOperativo = estadoUnificado;
        if (
          estadoUnificado === 'OFICINA' &&
          pedido.dias_desde_ult_mov !== undefined &&
          pedido.dias_desde_ult_mov > 1
        ) {
          estadoOperativo = 'OFICINA 1';
        }

        const carteraNeto = carteraMap.get(pedido.id_dropi) ?? 0;
        const estadosConCartera = ['ENTREGADO', 'DEVOLUCION', 'DEVOLUCIÓN'];
        const eu = estadoUnificado.toUpperCase();
        const carteraAplicada = estadosConCartera.includes(eu) ? carteraNeto : 0;
        const estadoCartera =
          carteraNeto !== 0 && estadosConCartera.includes(eu) ? 'OK' : '';

        const row = Object.assign(new Pedido(), pedido);
        row.estado_unificado = estadoUnificado;
        row.estado_operativo = estadoOperativo;
        row.cartera_aplicada = carteraAplicada;
        row.estado_cartera = estadoCartera;
        this.pedidosService.recalculateFinancials(row);

        toUpsert.push(row);
        remapeados++;
      }

      if (toUpsert.length > 0) {
        await this.pedidosService.bulkUpsertRaw(companyId, toUpsert);
      } else if (pedidosPendientes.length > 0) {
        this.logger.warn(
          `Remapeo: ${pedidosPendientes.length} pedidos "SIN MAPEAR" sin coincidencia en mapeo_estados; se detiene para evitar bucle infinito. Revise tablas de mapeo.`,
        );
        break;
      }

      this.logger.log(
        `Remapeo lote ${batchIndex}: leídos ${pedidosPendientes.length}, persistidos ${toUpsert.length} (acum. actualizados ${remapeados})`,
      );

      if (pedidosPendientes.length < BATCH) break;
    }

    this.logger.log(`Remapeo terminado: evaluados ${procesados}, actualizados ${remapeados}`);
    return { procesados, remapeados };
  }

  // ─── Utilidades de parsing ────────────────────────────────────

  /** Normaliza cabeceras de Excel para coincidir aunque cambien mayúsculas, espacios o acentos. */
  private normalizeExcelHeaderKey(header: string): string {
    return header
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\u00A0/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Busca el primer valor no vacío entre columnas cuyo nombre coincide con algún alias. */
  private getExcelCell(row: Record<string, unknown>, ...headerAliases: string[]): unknown {
    const map = new Map<string, unknown>();
    for (const [k, v] of Object.entries(row)) {
      map.set(this.normalizeExcelHeaderKey(k), v);
    }
    for (const alias of headerAliases) {
      const key = this.normalizeExcelHeaderKey(alias);
      const v = map.get(key);
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return v;
      }
    }
    return undefined;
  }

  private toString(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    return String(value).trim() || undefined;
  }

  private toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    const str = String(value).trim();
    if (str === '') return undefined;
    const num = Number(str);
    return Number.isNaN(num) ? undefined : num;
  }

  /**
   * CPA: celda vacía o no numérica → null en BD (no 0), para no falsear sumas/promedios.
   */
  private toCpaNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const str = String(value).trim();
    if (str === '' || str === '-' || str === '—' || /^#N\/A$/i.test(str)) return null;
    const num = Number(str);
    return Number.isNaN(num) ? null : num;
  }

  /**
   * Parsea fechas en formato "DD-MM-YYYY" o serial de Excel
   */
  private parseDate(value: unknown): Date | undefined {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'number') {
      return this.excelSerialToDate(value);
    }

    const str = String(value).trim();
    if (!str) return undefined;

    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
    if (iso) {
      const y = parseInt(iso[1], 10);
      const mo = parseInt(iso[2], 10);
      const d = parseInt(iso[3], 10);
      const date = new Date(y, mo - 1, d);
      if (!isNaN(date.getTime())) return date;
    }

    const slash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (slash) {
      const day = parseInt(slash[1], 10);
      const month = parseInt(slash[2], 10);
      const year = parseInt(slash[3], 10);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) return date;
    }

    const parts = str.split('-');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const date = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
      );
      if (!isNaN(date.getTime())) return date;
    }

    const date = new Date(str);
    return isNaN(date.getTime()) ? undefined : date;
  }

  /**
   * Parsea datetime en formato "DD-MM-YYYY HH:mm" o serial de Excel
   */
  private parseDateTime(value: unknown): Date | undefined {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'number') {
      return this.excelSerialToDate(value);
    }

    const str = String(value).trim();
    if (!str) return undefined;

    const match = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/);
    if (match) {
      const [, day, month, year, hour, minute] = match;
      return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
      );
    }

    return this.parseDate(value);
  }

  /**
   * Parsea hora en formato "HH:mm" a fracción decimal
   */
  private parseTime(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'number') return value;

    const str = String(value).trim();
    const match = str.match(/^(\d{2}):(\d{2})$/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      return (hours + minutes / 60) / 24;
    }

    return undefined;
  }

  /**
   * Convierte serial numérico de Excel a Date de JavaScript
   */
  private excelSerialToDate(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const fractionalDay = serial - Math.floor(serial);
    const totalSeconds = Math.floor(86400 * fractionalDay);

    const date = new Date(utcValue * 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    date.setUTCHours(hours, minutes, 0, 0);

    return date;
  }
}
