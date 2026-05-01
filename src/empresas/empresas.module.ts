import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Empresa } from './entities/empresa.entity';
import { UserEmpresa } from './entities/user-empresa.entity';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { MasterAdminGuard } from '../auth/guards/master-admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Empresa, UserEmpresa])],
  controllers: [EmpresasController],
  providers: [EmpresasService, MasterAdminGuard],
  exports: [EmpresasService],
})
export class EmpresasModule {}
