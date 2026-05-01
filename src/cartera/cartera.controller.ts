import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { CarteraService } from './cartera.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUserParam } from '../auth/decorators/auth-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('cartera')
@UseGuards(JwtAuthGuard)
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Get()
  findAll(
    @AuthUserParam() auth: AuthUser,
    @Query('tipo') tipo?: string,
    @Query('orden_id') ordenId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.carteraService.findAll({
      companyId: auth.companyId,
      tipo,
      orden_id: ordenId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('por-pedido/:ordenId')
  getCarteraPorPedido(@AuthUserParam() auth: AuthUser, @Param('ordenId') ordenId: string) {
    return this.carteraService.getCarteraPorPedido(auth.companyId, ordenId);
  }

  @Get(':id')
  findOne(@AuthUserParam() auth: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.carteraService.findOne(auth.companyId, id);
  }
}
