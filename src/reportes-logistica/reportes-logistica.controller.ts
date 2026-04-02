import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesLogisticaService } from './reportes-logistica.service';
import { EfectividadQueryDto } from './dto/efectividad-query.dto';
import { ComparativaQueryDto } from './dto/comparativa-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reportes-logistica')
@UseGuards(JwtAuthGuard)
export class ReportesLogisticaController {
  constructor(private readonly reportesLogisticaService: ReportesLogisticaService) {}

  @Get('efectividad-transportadoras')
  getEfectividadTransportadoras(@Query() query: EfectividadQueryDto) {
    return this.reportesLogisticaService.getEfectividadTransportadoras({
      desde: query.desde,
      hasta: query.hasta,
      transportadora: query.transportadora,
    });
  }

  @Get('comparativa-geografica')
  getComparativaGeografica(@Query() query: ComparativaQueryDto) {
    return this.reportesLogisticaService.getComparativaGeografica({
      dimension: query.dimension ?? 'departamento',
      metrica: query.metrica ?? 'efectividad',
      top: query.top ?? 15,
      desde: query.desde,
      hasta: query.hasta,
    });
  }
}
