import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesRentabilidadService } from './reportes-rentabilidad.service';
import { PorProductoQueryDto } from './dto/por-producto-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUserParam } from '../auth/decorators/auth-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('reportes-rentabilidad')
@UseGuards(JwtAuthGuard)
export class ReportesRentabilidadController {
  constructor(
    private readonly reportesRentabilidadService: ReportesRentabilidadService,
  ) {}

  @Get('por-producto')
  getPorProducto(@AuthUserParam() auth: AuthUser, @Query() query: PorProductoQueryDto) {
    return this.reportesRentabilidadService.getPorProducto({
      companyId: auth.companyId,
      desde: query.desde,
      hasta: query.hasta,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sortBy: query.sortBy ?? 'utilidad',
      order: query.order ?? 'desc',
      search: query.search,
      minEntr: query.minEntr,
      maxEntr: query.maxEntr,
      minTran: query.minTran,
      maxTran: query.maxTran,
      minDev: query.minDev,
      maxDev: query.maxDev,
      minPctEfectividad: query.minPctEfectividad,
      maxPctEfectividad: query.maxPctEfectividad,
      minPctTransito: query.minPctTransito,
      maxPctTransito: query.maxPctTransito,
      minPctDevolucion: query.minPctDevolucion,
      maxPctDevolucion: query.maxPctDevolucion,
      minVentas: query.minVentas,
      maxVentas: query.maxVentas,
      minPauta: query.minPauta,
      maxPauta: query.maxPauta,
      minUtilidad: query.minUtilidad,
      maxUtilidad: query.maxUtilidad,
    });
  }
}
