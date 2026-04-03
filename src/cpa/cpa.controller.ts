import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CpaService } from './cpa.service';
import { CreateCpaDto } from './dto/create-cpa.dto';
import { UpdateCpaDto } from './dto/update-cpa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('cpa')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CpaController {
  constructor(private readonly cpaService: CpaService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  create(@Body() createCpaDto: CreateCpaDto) {
    return this.cpaService.create(createCpaDto);
  }

  @Get('stats')
  getDashboardStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.cpaService.getDashboardStats(startDate, endDate);
  }

  @Get('distinct-productos')
  getDistinctProductos() {
    return this.cpaService.getDistinctProductos();
  }

  /** Resumen jerárquico (mes → semana → día → cuenta → producto) para el rango de fechas. */
  @Get('resumen-diario')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  getResumenDiario(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('producto') producto?: string,
  ) {
    return this.cpaService.getResumenDiario({ startDate, endDate, producto });
  }

  @Get()
  findAll(
    @Query('producto') producto?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.cpaService.findAll({ producto, sortField, sortOrder });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cpaService.findOne(+id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  update(@Param('id') id: string, @Body() updateCpaDto: UpdateCpaDto) {
    return this.cpaService.update(+id, updateCpaDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERADOR)
  remove(@Param('id') id: string) {
    return this.cpaService.remove(+id);
  }
}
