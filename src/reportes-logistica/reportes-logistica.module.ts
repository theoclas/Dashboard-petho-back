import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pedido } from '../pedidos/entities/pedido.entity';
import { ReportesLogisticaService } from './reportes-logistica.service';
import { ReportesLogisticaController } from './reportes-logistica.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido])],
  controllers: [ReportesLogisticaController],
  providers: [ReportesLogisticaService],
})
export class ReportesLogisticaModule {}
