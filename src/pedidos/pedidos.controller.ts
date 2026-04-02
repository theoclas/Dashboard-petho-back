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
} from '@nestjs/common';
import type { Response } from 'express';
import { PedidosService } from './pedidos.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
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
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      sortField,
      sortOrder,
      startDate,
      endDate,
    });
  }

  /** Mismos filtros que GET /pedidos (sin page/limit); descarga .xlsx con todas las filas coincidentes (tope en servidor). */
  @Get('export')
  async exportExcel(
    @Res({ passthrough: true }) res: Response,
    @Query('estado_unificado') estadoUnificado?: string,
    @Query('transportadora') transportadora?: string,
    @Query('ciudad') ciudad?: string,
    @Query('id_dropi') idDropi?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.pedidosService.exportPedidosExcel({
      estado_unificado: estadoUnificado,
      transportadora,
      ciudad,
      id_dropi: idDropi,
      sortField,
      sortOrder,
      startDate,
      endDate,
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
