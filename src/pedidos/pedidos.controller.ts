import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  Res,
  StreamableFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { PedidosService } from './pedidos.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { ExportPedidosDto } from './dto/export-pedidos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('pedidos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) { }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  create(@Body() createPedidoDto: CreatePedidoDto) {
    return this.pedidosService.create(createPedidoDto);
  }

  @Get()
  findAll(
    @Query('estado_unificado') estadoUnificado?: string,
    @Query('transportadora') transportadora?: string,
    @Query('ciudad') ciudad?: string,
    @Query('id_dropi') idDropi?: string,
    @Query('cliente') cliente?: string,
    @Query('telefono') telefono?: string,
    @Query('guia') guia?: string,
    @Query('departamento') departamento?: string,
    @Query('direccion') direccion?: string,
    @Query('notas') notas?: string,
    @Query('notas_manuales') notasManuales?: string,
    @Query('producto') producto?: string,
    @Query('estado_operativo') estadoOperativo?: string,
    @Query('estado_cartera') estadoCartera?: string,
    @Query('estatus_original') estatusOriginal?: string,
    @Query('ultimo_mov') ultimoMov?: string,
    @Query('venta') venta?: string,
    @Query('ganancia_calc') gananciaCalc?: string,
    @Query('flete') flete?: string,
    @Query('cartera') cartera?: string,
    @Query('costo_proveedor') costoProveedor?: string,
    @Query('costo_devolucion_estimado') costoDevolucionEstimado?: string,
    @Query('dias_desde_ult_mov') diasDesdeUltMov?: string,
    @Query('fecha_contains') fechaContains?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.pedidosService.findAll({
      estado_unificado: estadoUnificado,
      transportadora,
      ciudad,
      id_dropi: idDropi,
      cliente,
      telefono,
      guia,
      departamento,
      direccion,
      notas,
      notas_manuales: notasManuales,
      producto,
      estado_operativo: estadoOperativo,
      estado_cartera: estadoCartera,
      estatus_original: estatusOriginal,
      ultimo_mov: ultimoMov,
      venta,
      ganancia_calc: gananciaCalc,
      flete,
      cartera,
      costo_proveedor: costoProveedor,
      costo_devolucion_estimado: costoDevolucionEstimado,
      dias_desde_ult_mov: diasDesdeUltMov,
      fecha_contains: fechaContains,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      sortField,
      sortOrder,
      startDate,
      endDate,
    });
  }

  /**
   * Exportación Excel: POST con JSON para que los filtros no se pierdan en proxies
   * y no se cachee como un GET. Mismos criterios que GET /pedidos (sin page/limit).
   */
  @Post('export')
  @HttpCode(HttpStatus.OK)
  async exportExcel(
    @Body() body: ExportPedidosDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.pedidosService.exportPedidosExcel({
      estado_unificado: body.estado_unificado,
      transportadora: body.transportadora,
      ciudad: body.ciudad,
      id_dropi: body.id_dropi,
      cliente: body.cliente,
      telefono: body.telefono,
      guia: body.guia,
      departamento: body.departamento,
      direccion: body.direccion,
      notas: body.notas,
      notas_manuales: body.notas_manuales,
      producto: body.producto,
      estado_operativo: body.estado_operativo,
      estado_cartera: body.estado_cartera,
      estatus_original: body.estatus_original,
      ultimo_mov: body.ultimo_mov,
      venta: body.venta,
      ganancia_calc: body.ganancia_calc,
      flete: body.flete,
      cartera: body.cartera,
      costo_proveedor: body.costo_proveedor,
      costo_devolucion_estimado: body.costo_devolucion_estimado,
      dias_desde_ult_mov: body.dias_desde_ult_mov,
      fecha_contains: body.fecha_contains,
      sortField: body.sortField,
      sortOrder: body.sortOrder,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    const filename = `pedidos_export_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Export-Row-Count', String(result.rowCount));
    res.setHeader('X-Export-Total-Matching', String(result.totalMatching));
    res.setHeader('X-Export-Truncated', result.truncated ? 'true' : 'false');
    return new StreamableFile(result.buffer);
  }

  @Get('stats')
  getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.pedidosService.getDashboardStats(startDate, endDate);
  }

  @Get('dropi/:idDropi')
  findByDropiId(@Param('idDropi') idDropi: string) {
    return this.pedidosService.findByDropiId(idDropi);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePedidoDto: UpdatePedidoDto,
  ) {
    return this.pedidosService.update(id, updatePedidoDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pedidosService.remove(id);
  }
}
