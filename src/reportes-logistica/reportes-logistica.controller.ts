import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesLogisticaService } from './reportes-logistica.service';
import { EfectividadQueryDto } from './dto/efectividad-query.dto';
import { ComparativaQueryDto } from './dto/comparativa-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUserParam } from '../auth/decorators/auth-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('reportes-logistica')
@UseGuards(JwtAuthGuard)
export class ReportesLogisticaController {
  constructor(private readonly reportesLogisticaService: ReportesLogisticaService) {}

  @Get('efectividad-transportadoras')
  getEfectividadTransportadoras(@AuthUserParam() auth: AuthUser, @Query() query: EfectividadQueryDto) {
    return this.reportesLogisticaService.getEfectividadTransportadoras({
      companyId: auth.companyId,
      desde: query.desde,
      hasta: query.hasta,
      transportadora: query.transportadora,
    });
  }

  @Get('ciudades-comparativa')
  getCiudadesComparativa(@AuthUserParam() auth: AuthUser, @Query() query: EfectividadQueryDto) {
    return this.reportesLogisticaService.getCiudadesParaComparativa({
      companyId: auth.companyId,
      desde: query.desde,
      hasta: query.hasta,
    });
  }

  @Get('comparativa-geografica')
  getComparativaGeografica(@AuthUserParam() auth: AuthUser, @Query() query: ComparativaQueryDto) {
    return this.reportesLogisticaService.getComparativaGeografica({
      companyId: auth.companyId,
      dimension: query.dimension ?? 'departamento',
      metrica: query.metrica ?? 'efectividad',
      top: query.top ?? 15,
      desde: query.desde,
      hasta: query.hasta,
      ciudad: query.ciudad,
    });
  }
}
