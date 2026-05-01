import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { WipeImportedDto } from './dto/wipe-imported.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AuthUserParam } from '../auth/decorators/auth-user.decorator';
import type { AuthUser } from '../auth/auth-user.interface';

@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERADOR)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /** Rutas con y sin `/` final: proxies que redirigen con 307 rompen CORS en subidas multipart. */
  @Post(['pedidos', 'pedidos/'])
  @UseInterceptors(FileInterceptor('file'))
  async importPedidos(@AuthUserParam() auth: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importPedidos(auth.companyId, file.buffer);
  }

  @Post(['productos', 'productos/'])
  @UseInterceptors(FileInterceptor('file'))
  async importProductos(@AuthUserParam() auth: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importProductos(auth.companyId, file.buffer);
  }

  @Post(['cartera', 'cartera/'])
  @UseInterceptors(FileInterceptor('file'))
  async importCartera(@AuthUserParam() auth: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importCartera(auth.companyId, file.buffer);
  }

  @Post(['cpa', 'cpa/'])
  @UseInterceptors(FileInterceptor('file'))
  async importCpa(@AuthUserParam() auth: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importCpa(auth.companyId, file.buffer);
  }

  @Post(['mapeo-estados', 'mapeo-estados/'])
  @UseInterceptors(FileInterceptor('file'))
  async importMapeoEstados(@AuthUserParam() auth: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importMapeoEstados(auth.companyId, file.buffer);
  }

  @Post('remapear-estados')
  async remapearEstados(@AuthUserParam() auth: AuthUser) {
    return this.importService.remapearPedidos(auth.companyId);
  }

  /** Solo ADMIN: vacía pedidos, productos_detalle y cartera_movimientos (contraseña = IMPORT_WIPE_SECRET). */
  @Post('wipe-imported-tables')
  @Roles(UserRole.ADMIN)
  async wipeImportedTables(@AuthUserParam() auth: AuthUser, @Body() dto: WipeImportedDto) {
    return this.importService.wipeImportedTables(auth.companyId, dto.password);
  }

  /** Solo ADMIN: vacía la tabla cpas (misma contraseña IMPORT_WIPE_SECRET). */
  @Post('wipe-cpa')
  @Roles(UserRole.ADMIN)
  async wipeCpa(@AuthUserParam() auth: AuthUser, @Body() dto: WipeImportedDto) {
    return this.importService.wipeCpaTable(auth.companyId, dto.password);
  }
}
