import { Module } from '@nestjs/common';
import { ReportesRentabilidadService } from './reportes-rentabilidad.service';
import { ReportesRentabilidadController } from './reportes-rentabilidad.controller';

@Module({
  controllers: [ReportesRentabilidadController],
  providers: [ReportesRentabilidadService],
})
export class ReportesRentabilidadModule {}
