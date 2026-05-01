import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignUserEmpresaDto } from './dto/assign-user-empresa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MasterAdminGuard } from '../auth/guards/master-admin.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: AdminCreateUserDto) {
    return this.usersService.createByAdmin(dto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id/empresas')
  @UseGuards(MasterAdminGuard)
  listUserEmpresas(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.listUserEmpresaAssignments(id);
  }

  @Post(':id/empresas')
  @UseGuards(MasterAdminGuard)
  assignEmpresa(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignUserEmpresaDto) {
    return this.usersService.assignEmpresaToUser(id, dto.empresa_id);
  }

  @Delete(':id/empresas/:empresaId')
  @UseGuards(MasterAdminGuard)
  removeEmpresa(
    @Param('id', ParseIntPipe) id: number,
    @Param('empresaId', ParseIntPipe) empresaId: number,
  ) {
    return this.usersService.removeEmpresaFromUser(id, empresaId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: { user: { userId: number } }) {
    return this.usersService.remove(+id, req.user.userId);
  }
}
