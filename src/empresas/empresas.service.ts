import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Empresa } from './entities/empresa.entity';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { UserEmpresa } from './entities/user-empresa.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(Empresa)
    private readonly empresasRepository: Repository<Empresa>,
    @InjectRepository(UserEmpresa)
    private readonly userEmpresasRepository: Repository<UserEmpresa>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateEmpresaDto): Promise<Empresa> {
    const slug = dto.slug.trim().toLowerCase();
    const existsSlug = await this.empresasRepository.findOne({ where: { slug } });
    if (existsSlug) {
      throw new ConflictException('Ya existe una empresa con ese slug.');
    }
    const existsName = await this.empresasRepository.findOne({ where: { nombre: dto.nombre.trim() } });
    if (existsName) {
      throw new ConflictException('Ya existe una empresa con ese nombre.');
    }
    const empresa = this.empresasRepository.create({
      nombre: dto.nombre.trim(),
      slug,
      is_active: dto.is_active ?? true,
    });
    return this.empresasRepository.save(empresa);
  }

  async findAll(): Promise<Empresa[]> {
    return this.empresasRepository.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<Empresa> {
    const empresa = await this.empresasRepository.findOne({ where: { id } });
    if (!empresa) {
      throw new NotFoundException(`Empresa con ID ${id} no encontrada.`);
    }
    return empresa;
  }

  async update(id: number, dto: UpdateEmpresaDto): Promise<Empresa> {
    const empresa = await this.findOne(id);
    if (dto.slug && dto.slug.trim().toLowerCase() !== empresa.slug) {
      const existsSlug = await this.empresasRepository.findOne({
        where: { slug: dto.slug.trim().toLowerCase() },
      });
      if (existsSlug) {
        throw new ConflictException('Ya existe una empresa con ese slug.');
      }
      empresa.slug = dto.slug.trim().toLowerCase();
    }
    if (dto.nombre && dto.nombre.trim() !== empresa.nombre) {
      const existsName = await this.empresasRepository.findOne({
        where: { nombre: dto.nombre.trim() },
      });
      if (existsName) {
        throw new ConflictException('Ya existe una empresa con ese nombre.');
      }
      empresa.nombre = dto.nombre.trim();
    }
    if (dto.is_active !== undefined) {
      empresa.is_active = dto.is_active;
    }
    return this.empresasRepository.save(empresa);
  }

  async remove(id: number): Promise<{ ok: true }> {
    const empresa = await this.findOne(id);
    const membersCount = await this.userEmpresasRepository.count({ where: { empresa_id: id } });
    if (membersCount > 0) {
      throw new BadRequestException('No puedes eliminar una empresa con usuarios asignados.');
    }
    await this.empresasRepository.remove(empresa);
    return { ok: true };
  }

  async assignAllExistingDataToCompany(companyId: number): Promise<{ ok: true }> {
    await this.findOne(companyId);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`UPDATE pedidos SET empresa_id = $1`, [companyId]);
      await manager.query(`UPDATE cpas SET empresa_id = $1`, [companyId]);
      await manager.query(`UPDATE productos_detalle SET empresa_id = $1`, [companyId]);
      await manager.query(`UPDATE cartera_movimientos SET empresa_id = $1`, [companyId]);
      await manager.query(`UPDATE notas_manuales SET empresa_id = $1`, [companyId]);
      await manager.query(`UPDATE mapeo_estados SET empresa_id = $1`, [companyId]);

      const users = await manager.getRepository(User).find({
        where: { is_deleted: false },
        select: ['id'],
      });
      for (const user of users) {
        const existing = await manager.getRepository(UserEmpresa).findOne({
          where: { user_id: user.id, empresa_id: companyId },
        });
        if (!existing) {
          await manager.getRepository(UserEmpresa).save(
            manager.getRepository(UserEmpresa).create({
              user_id: user.id,
              empresa_id: companyId,
              is_active: true,
            }),
          );
        }
      }
    });

    return { ok: true };
  }
}
