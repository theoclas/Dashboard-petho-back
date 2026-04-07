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

@Controller('import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERADOR)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /** Rutas con y sin `/` final: proxies que redirigen con 307 rompen CORS en subidas multipart. */
  @Post(['pedidos', 'pedidos/'])
  @UseInterceptors(FileInterceptor('file'))
  async importPedidos(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importPedidos(file.buffer);
  }

  @Post(['productos', 'productos/'])
  @UseInterceptors(FileInterceptor('file'))
  async importProductos(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importProductos(file.buffer);
  }

  @Post(['cartera', 'cartera/'])
  @UseInterceptors(FileInterceptor('file'))
  async importCartera(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importCartera(file.buffer);
  }

  @Post(['cpa', 'cpa/'])
  @UseInterceptors(FileInterceptor('file'))
  async importCpa(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importCpa(file.buffer);
  }

  @Post(['mapeo-estados', 'mapeo-estados/'])
  @UseInterceptors(FileInterceptor('file'))
  async importMapeoEstados(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Se requiere un archivo Excel (.xlsx)');
    }
    return this.importService.importMapeoEstados(file.buffer);
  }

  @Post('remapear-estados')
  async remapearEstados() {
    return this.importService.remapearPedidos();
  }

  /** Solo ADMIN: vacía pedidos, productos_detalle y cartera_movimientos (contraseña = IMPORT_WIPE_SECRET). */
  @Post('wipe-imported-tables')
  @Roles(UserRole.ADMIN)
  async wipeImportedTables(@Body() dto: WipeImportedDto) {
    return this.importService.wipeImportedTables(dto.password);
  }

  /** Solo ADMIN: vacía la tabla cpas (misma contraseña IMPORT_WIPE_SECRET). */
  @Post('wipe-cpa')
  @Roles(UserRole.ADMIN)
  async wipeCpa(@Body() dto: WipeImportedDto) {
    return this.importService.wipeCpaTable(dto.password);
  }
}
