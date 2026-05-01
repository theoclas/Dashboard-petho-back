import { Controller, Get, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ProductosDetalleService } from './productos-detalle.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUserParam } from '../auth/decorators/auth-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('productos-detalle')
@UseGuards(JwtAuthGuard)
export class ProductosDetalleController {
  constructor(
    private readonly productosDetalleService: ProductosDetalleService,
  ) {}

  @Get()
  findAll(@AuthUserParam() auth: AuthUser, @Query('pedido_id_dropi') pedidoIdDropi?: string) {
    return this.productosDetalleService.findAll(auth.companyId, pedidoIdDropi);
  }

  @Get('unique/names')
  findUniqueProducts(@AuthUserParam() auth: AuthUser) {
    return this.productosDetalleService.findUniqueProducts(auth.companyId);
  }

  @Get(':id')
  findOne(@AuthUserParam() auth: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.productosDetalleService.findOne(auth.companyId, id);
  }
}
