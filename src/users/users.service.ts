import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Empresa } from '../empresas/entities/empresa.entity';
import { UserEmpresa } from '../empresas/entities/user-empresa.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Empresa)
    private readonly empresasRepository: Repository<Empresa>,
    @InjectRepository(UserEmpresa)
    private readonly userEmpresasRepository: Repository<UserEmpresa>,
  ) {}

  async onModuleInit() {
    await this.seedAdmin();
    await this.ensureMasterAdminHasDefaultCompanyIfNoMemberships();
    if (this.isDevAutoAssignDefaultCompanyEnabled()) {
      await this.linkActiveUsersWithoutCompanyToDefault();
    }
    if (this.shouldRunDevAssignCompanyByUsername()) {
      await this.assignDefaultCompanyToListedUsernames();
    }
  }

  /** Solo si DEV_AUTO_ASSIGN_DEFAULT_COMPANY=true (p. ej. local); nunca en producción multi-tenant. */
  private isDevAutoAssignDefaultCompanyEnabled(): boolean {
    const v = process.env.DEV_AUTO_ASSIGN_DEFAULT_COMPANY?.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  /**
   * Lista explícita de usernames (DEV_ASSIGN_COMPANY_USERNAMES) → empresa por defecto.
   * Solo fuera de NODE_ENV=production. Útil para desbloquear un usuario concreto sin SQL.
   */
  private shouldRunDevAssignCompanyByUsername(): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    const raw = process.env.DEV_ASSIGN_COMPANY_USERNAMES?.trim();
    return Boolean(raw);
  }

  private async assignDefaultCompanyToListedUsernames(): Promise<void> {
    const raw = process.env.DEV_ASSIGN_COMPANY_USERNAMES?.trim();
    if (!raw) return;
    const defaultCompany = await this.ensureDefaultCompany();
    const names = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const username of names) {
      const user = await this.usersRepository.findOne({
        where: { username, is_deleted: false },
      });
      if (!user) continue;
      await this.ensureMembership(user.id, defaultCompany.id);
    }
  }

  /** Enlaza a la empresa por defecto si el usuario no tiene ninguna empresa activa (útil en dev). */
  private async linkActiveUsersWithoutCompanyToDefault(): Promise<void> {
    const defaultCompany = await this.ensureDefaultCompany();
    const users = await this.usersRepository.find({
      where: { is_deleted: false, is_active: true },
      select: ['id'],
    });
    for (const user of users) {
      const companies = await this.findCompaniesForUser(user.id);
      if (companies.length === 0) {
        await this.ensureMembership(user.id, defaultCompany.id);
      }
    }
  }

  async seedAdmin() {
    const defaultCompany = await this.ensureDefaultCompany();

    const adminCount = await this.usersRepository.count({
      where: { role: UserRole.ADMIN, is_deleted: false },
    });
  
    if (adminCount === 0) {
      const email = process.env.ADMIN_EMAIL;
      const username = process.env.ADMIN_USERNAME;
      const password = process.env.ADMIN_PASSWORD;
  
      if (!email || !username || !password) {
        throw new Error('ADMIN_EMAIL, ADMIN_USERNAME y ADMIN_PASSWORD son requeridos en el .env');
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
  
      const admin = this.usersRepository.create({
        email,
        username,
        password: hashedPassword,
        role: UserRole.ADMIN,
        is_active: true,
      });
  
      const savedAdmin = await this.usersRepository.save(admin);
      await this.ensureMembership(savedAdmin.id, defaultCompany.id);
    }
  }

  private async ensureDefaultCompany(): Promise<Empresa> {
    const preferredSlug = 'jyd-tiendas-online';
    const preferredName = 'J&D Tiendas Online';
    const legacy = await this.empresasRepository.findOne({
      where: { slug: 'empresa-principal' },
    });
    if (legacy) {
      legacy.slug = preferredSlug;
      legacy.nombre = preferredName;
      legacy.is_active = true;
      return this.empresasRepository.save(legacy);
    }

    const existing = await this.empresasRepository.findOne({
      where: { slug: preferredSlug },
    });
    if (existing) return existing;

    const empresa = this.empresasRepository.create({
      nombre: preferredName,
      slug: preferredSlug,
      is_active: true,
    });
    return this.empresasRepository.save(empresa);
  }

  private async ensureMembership(userId: number, companyId: number): Promise<void> {
    const existing = await this.userEmpresasRepository.findOne({
      where: { user_id: userId, empresa_id: companyId },
    });
    if (existing) {
      if (!existing.is_active) {
        existing.is_active = true;
        await this.userEmpresasRepository.save(existing);
      }
      return;
    }
    await this.userEmpresasRepository.save(
      this.userEmpresasRepository.create({
        user_id: userId,
        empresa_id: companyId,
        is_active: true,
      }),
    );
  }

  /**
   * Si MASTER_ADMIN_EMAIL existe y el usuario no tiene ninguna fila en user_empresas,
   * enlaza la empresa por defecto para que pueda iniciar sesión y asignar empresas a otros.
   */
  private async ensureMasterAdminHasDefaultCompanyIfNoMemberships(): Promise<void> {
    const email = process.env.MASTER_ADMIN_EMAIL?.trim();
    if (!email) return;
    const user = await this.usersRepository.findOne({ where: { email, is_deleted: false } });
    if (!user) return;
    const count = await this.userEmpresasRepository.count({ where: { user_id: user.id } });
    if (count > 0) return;
    const defaultCompany = await this.ensureDefaultCompany();
    await this.userEmpresasRepository.save(
      this.userEmpresasRepository.create({
        user_id: user.id,
        empresa_id: defaultCompany.id,
        is_active: true,
      }),
    );
  }

  /**
   * Portal administrador principal: primera empresa activa del usuario o alta en la empresa por defecto.
   */
  async ensureActiveCompanyForMasterSession(userId: number): Promise<number> {
    const active = await this.findCompaniesForUser(userId);
    if (active.length > 0) return active[0].id;
    const defaultCompany = await this.ensureDefaultCompany();
    await this.ensureMembership(userId, defaultCompany.id);
    return defaultCompany.id;
  }

  async create(createUserDto: CreateUserDto): Promise<Partial<User>> {
    const existingEmail = await this.usersRepository.findOne({
      where: { email: createUserDto.email, is_deleted: false },
    });
    if (existingEmail) {
      throw new ConflictException('El correo ya está registrado');
    }

    const existingUsername = await this.usersRepository.findOne({
      where: { username: createUserDto.username, is_deleted: false },
    });
    if (existingUsername) {
      throw new ConflictException('El usuario ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
      // Todos nacen inactivos y como LECTOR por defecto por seguridad
      is_active: false,
      role: UserRole.LECTOR,
    });

    const saved = await this.usersRepository.save(user);
    const { password, ...result } = saved;
    return result;
  }

  async createByAdmin(dto: AdminCreateUserDto): Promise<Partial<User>> {
    const existingEmail = await this.usersRepository.findOne({
      where: { email: dto.email, is_deleted: false },
    });
    if (existingEmail) {
      throw new ConflictException('El correo ya está registrado');
    }

    const existingUsername = await this.usersRepository.findOne({
      where: { username: dto.username, is_deleted: false },
    });
    if (existingUsername) {
      throw new ConflictException('El usuario ya está registrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      email: dto.email,
      username: dto.username,
      password: hashedPassword,
      role: dto.role ?? UserRole.LECTOR,
      is_active: dto.is_active ?? false,
    });

    const saved = await this.usersRepository.save(user);
    const { password, ...result } = saved;
    return result;
  }

  async listUserEmpresaAssignments(
    userId: number,
  ): Promise<Array<{ empresa_id: number; nombre: string; is_active: boolean }>> {
    await this.findOne(userId);
    const rows = await this.userEmpresasRepository
      .createQueryBuilder('ue')
      .innerJoin('empresas', 'e', 'e.id = ue.empresa_id')
      .select('ue.empresa_id', 'empresa_id')
      .addSelect('e.nombre', 'nombre')
      .addSelect('ue.is_active', 'is_active')
      .where('ue.user_id = :userId', { userId })
      .orderBy('e.nombre', 'ASC')
      .getRawMany<{ empresa_id: string; nombre: string; is_active: boolean }>();

    return rows.map((row) => ({
      empresa_id: Number(row.empresa_id),
      nombre: row.nombre,
      is_active: row.is_active,
    }));
  }

  async assignEmpresaToUser(userId: number, empresaId: number): Promise<{ ok: true }> {
    await this.findOne(userId);
    const empresa = await this.empresasRepository.findOne({ where: { id: empresaId } });
    if (!empresa) {
      throw new NotFoundException(`Empresa con ID ${empresaId} no encontrada`);
    }
    if (!empresa.is_active) {
      throw new BadRequestException('No se puede asignar una empresa inactiva');
    }
    const existing = await this.userEmpresasRepository.findOne({
      where: { user_id: userId, empresa_id: empresaId },
    });
    if (existing) {
      if (!existing.is_active) {
        existing.is_active = true;
        await this.userEmpresasRepository.save(existing);
      }
      return { ok: true };
    }
    await this.userEmpresasRepository.save(
      this.userEmpresasRepository.create({
        user_id: userId,
        empresa_id: empresaId,
        is_active: true,
      }),
    );
    return { ok: true };
  }

  async removeEmpresaFromUser(userId: number, empresaId: number): Promise<{ ok: true }> {
    await this.findOne(userId);
    const row = await this.userEmpresasRepository.findOne({
      where: { user_id: userId, empresa_id: empresaId },
    });
    if (!row) {
      throw new NotFoundException('El usuario no tiene asignada esa empresa');
    }
    const activeCount = await this.userEmpresasRepository.count({
      where: { user_id: userId, is_active: true },
    });
    if (row.is_active && activeCount <= 1) {
      throw new BadRequestException('El usuario debe tener al menos una empresa activa asignada');
    }
    row.is_active = false;
    await this.userEmpresasRepository.save(row);
    return { ok: true };
  }

  async findAll(): Promise<Partial<User>[]> {
    const users = await this.usersRepository.find({
      where: { is_deleted: false },
      order: { id: 'ASC' },
    });
    return users.map(user => {
      const { password, ...result } = user;
      return result;
    });
  }

  /** Usuario activo en sesión (no eliminado). */
  async findForSession(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id, is_deleted: false } });
  }

  async findCompaniesForUser(userId: number): Promise<Array<{ id: number; nombre: string }>> {
    const rows = await this.userEmpresasRepository
      .createQueryBuilder('ue')
      .innerJoin('empresas', 'e', 'e.id = ue.empresa_id')
      .select('e.id', 'id')
      .addSelect('e.nombre', 'nombre')
      .where('ue.user_id = :userId', { userId })
      .andWhere('ue.is_active = true')
      .andWhere('e.is_active = true')
      .orderBy('e.nombre', 'ASC')
      .getRawMany<{ id: string; nombre: string }>();

    return rows.map((row) => ({
      id: Number(row.id),
      nombre: row.nombre,
    }));
  }

  async userHasCompany(userId: number, companyId: number): Promise<boolean> {
    const count = await this.userEmpresasRepository.count({
      where: {
        user_id: userId,
        empresa_id: companyId,
        is_active: true,
      },
    });
    return count > 0;
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id, is_deleted: false } });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email, is_deleted: false } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username, is_deleted: false } });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<Partial<User>> {
    const user = await this.findOne(id);
    Object.assign(user, updateUserDto);
    const updated = await this.usersRepository.save(user);
    const { password, ...result } = updated;
    return result;
  }

  async remove(id: number, actorUserId: number): Promise<{ ok: true }> {
    if (id === actorUserId) {
      throw new BadRequestException('No puedes eliminar tu propio usuario');
    }

    const user = await this.findOne(id);

    if (user.role === UserRole.ADMIN) {
      const adminCount = await this.usersRepository.count({
        where: { role: UserRole.ADMIN, is_deleted: false },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('No se puede eliminar el último administrador');
      }
    }

    user.is_deleted = true;
    user.is_active = false;
    await this.usersRepository.save(user);
    return { ok: true };
  }
}
