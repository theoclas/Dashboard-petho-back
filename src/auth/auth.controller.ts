import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { SelectCompanyLoginDto } from './dto/select-company-login.dto';
import { SwitchCompanyDto } from './dto/switch-company.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthUserParam } from './decorators/auth-user.decorator';
import type { AuthUser } from './auth-user.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /** Portal independiente del administrador principal (mismas credenciales que el dashboard, otro cliente). */
  @Post('master-login')
  masterLogin(@Body() loginDto: LoginDto) {
    return this.authService.masterLogin(loginDto);
  }

  @Post('select-company')
  selectCompany(@Body() dto: SelectCompanyLoginDto) {
    return this.authService.selectCompany(dto);
  }

  @Post('switch-company')
  @UseGuards(JwtAuthGuard)
  switchCompany(@AuthUserParam() auth: AuthUser, @Body() dto: SwitchCompanyDto) {
    return this.authService.switchCompany(auth.userId, dto);
  }

  @Post('register')
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }
}
