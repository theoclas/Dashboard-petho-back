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
} from '@nestjs/common';
import { NotasService } from './notas.service';
import { NotaManual } from './entities/nota-manual.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AuthUserParam } from '../auth/decorators/auth-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('notas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotasController {
  constructor(private readonly notasService: NotasService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  create(@AuthUserParam() auth: AuthUser, @Body() data: Partial<NotaManual>) {
    return this.notasService.create(auth.companyId, data);
  }

  @Get()
  findAll(@AuthUserParam() auth: AuthUser, @Query('id_dropi') idDropi?: string) {
    return this.notasService.findAll(auth.companyId, idDropi);
  }

  @Get(':id')
  findOne(@AuthUserParam() auth: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notasService.findOne(auth.companyId, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  update(
    @AuthUserParam() auth: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<NotaManual>,
  ) {
    return this.notasService.update(auth.companyId, id, data);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  remove(@AuthUserParam() auth: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.notasService.remove(auth.companyId, id);
  }
}
