import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesRentabilidadService } from './reportes-rentabilidad.service';
import { PorProductoQueryDto } from './dto/por-producto-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reportes-rentabilidad')
@UseGuards(JwtAuthGuard)
export class ReportesRentabilidadController {
  constructor(
    private readonly reportesRentabilidadService: ReportesRentabilidadService,
  ) {}

  @Get('por-producto')
  getPorProducto(@Query() query: PorProductoQueryDto) {
    return this.reportesRentabilidadService.getPorProducto({
      desde: query.desde,
      hasta: query.hasta,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'utilidad',
      order: query.order ?? 'desc',
      search: query.search,
    });
  }
}
