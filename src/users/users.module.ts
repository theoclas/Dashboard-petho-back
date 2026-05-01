import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Empresa } from '../empresas/entities/empresa.entity';
import { UserEmpresa } from '../empresas/entities/user-empresa.entity';
import { MasterAdminGuard } from '../auth/guards/master-admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, Empresa, UserEmpresa])],
  controllers: [UsersController],
  providers: [UsersService, MasterAdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
