import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotaManual } from './entities/nota-manual.entity';

@Injectable()
export class NotasService {
  constructor(
    @InjectRepository(NotaManual)
    private readonly notaRepo: Repository<NotaManual>,
  ) {}

  async findAll(companyId: number, idDropi?: string): Promise<NotaManual[]> {
    if (idDropi) {
      return this.notaRepo.findBy({ empresa_id: companyId, id_dropi: idDropi });
    }
    return this.notaRepo.findBy({ empresa_id: companyId });
  }

  async findOne(companyId: number, id: number): Promise<NotaManual> {
    const nota = await this.notaRepo.findOneBy({ id, empresa_id: companyId });
    if (!nota)
      throw new NotFoundException(`Nota con ID ${id} no encontrada`);
    return nota;
  }

  async create(companyId: number, data: Partial<NotaManual>): Promise<NotaManual> {
    const nota = this.notaRepo.create({ ...data, empresa_id: companyId });
    return this.notaRepo.save(nota);
  }

  async update(companyId: number, id: number, data: Partial<NotaManual>): Promise<NotaManual> {
    const nota = await this.findOne(companyId, id);
    Object.assign(nota, data);
    return this.notaRepo.save(nota);
  }

  async remove(companyId: number, id: number): Promise<void> {
    const nota = await this.findOne(companyId, id);
    await this.notaRepo.remove(nota);
  }

  async bulkUpsert(companyId: number, records: Partial<NotaManual>[]): Promise<number> {
    let count = 0;
    for (const record of records) {
      await this.notaRepo.save(this.notaRepo.create({ ...record, empresa_id: companyId }));
      count++;
    }
    return count;
  }
}
