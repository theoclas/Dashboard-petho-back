import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { MapeoEstadosService } from './mapeo-estados.service';
import { CreateMapeoEstadoDto } from './dto/create-mapeo-estado.dto';
import { UpdateMapeoEstadoDto } from './dto/update-mapeo-estado.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AuthUserParam } from '../auth/decorators/auth-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('mapeo-estados')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN) // Todo el controlador solo para ADMIN
export class MapeoEstadosController {
  constructor(private readonly mapeoEstadosService: MapeoEstadosService) {}

  @Post()
  create(@AuthUserParam() auth: AuthUser, @Body() dto: CreateMapeoEstadoDto) {
    return this.mapeoEstadosService.create(auth.companyId, dto);
  }

  @Get()
  findAll(@AuthUserParam() auth: AuthUser) {
    return this.mapeoEstadosService.findAll(auth.companyId);
  }

  @Get(':id')
  findOne(@AuthUserParam() auth: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.mapeoEstadosService.findOne(auth.companyId, id);
  }

  @Patch(':id')
  update(
    @AuthUserParam() auth: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMapeoEstadoDto,
  ) {
    return this.mapeoEstadosService.update(auth.companyId, id, dto);
  }

  @Delete(':id')
  remove(@AuthUserParam() auth: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.mapeoEstadosService.remove(auth.companyId, id);
  }
}
