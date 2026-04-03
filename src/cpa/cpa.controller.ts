import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Res,
  StreamableFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { CpaService } from './cpa.service';
import { CreateCpaDto } from './dto/create-cpa.dto';
import { UpdateCpaDto } from './dto/update-cpa.dto';
import { ExportCpaDto } from './dto/export-cpa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('cpa')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CpaController {
  constructor(private readonly cpaService: CpaService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  create(@Body() createCpaDto: CreateCpaDto) {
    return this.cpaService.create(createCpaDto);
  }

  @Get('stats')
  getDashboardStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.cpaService.getDashboardStats(startDate, endDate);
  }

  @Get('distinct-productos')
  getDistinctProductos() {
    return this.cpaService.getDistinctProductos();
  }

  /** Resumen jerárquico (mes → semana → día → cuenta → producto) para el rango de fechas. */
  @Get('resumen-diario')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  getResumenDiario(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('producto') producto?: string,
  ) {
    return this.cpaService.getResumenDiario({ startDate, endDate, producto });
  }

  @Get()
  findAll(
    @Query('producto') producto?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.cpaService.findAll({ producto, sortField, sortOrder, startDate, endDate });
  }

  /**
   * Exportación Excel: POST con JSON (mismos criterios que GET /cpa, sin paginación).
   */
  @Post('export')
  @HttpCode(HttpStatus.OK)
  async exportExcel(
    @Body() body: ExportCpaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.cpaService.exportCpaExcel({
      producto: body.producto,
      sortField: body.sortField,
      sortOrder: body.sortOrder,
      startDate: body.startDate,
      endDate: body.endDate,
    });
    const filename = `cpa_export_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cpaService.findOne(+id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  update(@Param('id') id: string, @Body() updateCpaDto: UpdateCpaDto) {
    return this.cpaService.update(+id, updateCpaDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  remove(@Param('id') id: string) {
    return this.cpaService.remove(+id);
  }
}
