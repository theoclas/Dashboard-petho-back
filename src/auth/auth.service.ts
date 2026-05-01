import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { SelectCompanyLoginDto } from './dto/select-company-login.dto';
import { SwitchCompanyDto } from './dto/switch-company.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findByUsername(username);
    if (user && (await bcrypt.compare(pass, user.password))) {
      if (!user.is_active) {
        throw new UnauthorizedException('Cuenta inactiva. Contacte al administrador.');
      }
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const companies = await this.usersService.findCompaniesForUser(user.id);
    if (companies.length === 0) {
      throw new UnauthorizedException('Tu usuario no tiene empresas asignadas.');
    }

    return {
      user,
      companies,
    };
  }

  /**
   * Login dedicado al portal del administrador principal: valida MASTER_ADMIN_EMAIL y
   * devuelve JWT en un solo paso (asigna empresa por defecto si aún no tiene ninguna activa).
   */
  async masterLogin(loginDto: LoginDto) {
    const expected = process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
    if (!expected) {
      throw new BadRequestException('MASTER_ADMIN_EMAIL no está configurado en el servidor.');
    }

    const user = await this.validateUser(loginDto.username, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const email = String(user.email ?? '').trim().toLowerCase();
    if (!email || email !== expected) {
      throw new UnauthorizedException('Este acceso es solo para el administrador principal.');
    }

    const companyId = await this.usersService.ensureActiveCompanyForMasterSession(user.id);

    const payload = {
      username: user.username,
      email: user.email,
      sub: user.id,
      role: user.role,
      companyId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyId,
      },
    };
  }

  async selectCompany(dto: SelectCompanyLoginDto) {
    if (!dto.companyId) {
      throw new BadRequestException('Debes seleccionar una empresa.');
    }
    const user = await this.validateUser(dto.username, dto.password);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario inhabilitado o no existe');
    }
    const hasCompany = await this.usersService.userHasCompany(user.id, dto.companyId);
    if (!hasCompany) {
      throw new UnauthorizedException('No tienes acceso a la empresa seleccionada.');
    }

    const payload = {
      username: user.username,
      email: user.email,
      sub: user.id,
      role: user.role,
      companyId: dto.companyId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyId: dto.companyId,
      },
    };
  }

  async switchCompany(userId: number, dto: SwitchCompanyDto) {
    if (!dto.companyId) {
      throw new BadRequestException('Debes seleccionar una empresa.');
    }
    const user = await this.usersService.findForSession(userId);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario inhabilitado o no existe');
    }
    const hasCompany = await this.usersService.userHasCompany(user.id, dto.companyId);
    if (!hasCompany) {
      throw new UnauthorizedException('No tienes acceso a la empresa seleccionada.');
    }
    const payload = {
      username: user.username,
      email: user.email,
      sub: user.id,
      role: user.role,
      companyId: dto.companyId,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyId: dto.companyId,
      },
    };
  }

  async register(createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
}
