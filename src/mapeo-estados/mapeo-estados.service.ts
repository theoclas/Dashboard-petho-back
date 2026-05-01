import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapeoEstado } from './entities/mapeo-estado.entity';
import { CreateMapeoEstadoDto } from './dto/create-mapeo-estado.dto';
import { UpdateMapeoEstadoDto } from './dto/update-mapeo-estado.dto';

@Injectable()
export class MapeoEstadosService {
  constructor(
    @InjectRepository(MapeoEstado)
    private readonly mapeoRepo: Repository<MapeoEstado>,
  ) {}

  async create(companyId: number, dto: CreateMapeoEstadoDto): Promise<MapeoEstado> {
    const mapeo = this.mapeoRepo.create({ ...dto, empresa_id: companyId });
    return this.mapeoRepo.save(mapeo);
  }

  async findAll(companyId: number): Promise<MapeoEstado[]> {
    return this.mapeoRepo.find({
      where: { empresa_id: companyId },
      order: { estado_unificado: 'ASC' },
    });
  }

  async findOne(companyId: number, id: number): Promise<MapeoEstado> {
    const mapeo = await this.mapeoRepo.findOneBy({ id, empresa_id: companyId });
    if (!mapeo)
      throw new NotFoundException(`MapeoEstado con ID ${id} no encontrado`);
    return mapeo;
  }

  async update(companyId: number, id: number, dto: UpdateMapeoEstadoDto): Promise<MapeoEstado> {
    const mapeo = await this.findOne(companyId, id);
    Object.assign(mapeo, dto);
    return this.mapeoRepo.save(mapeo);
  }

  async remove(companyId: number, id: number): Promise<void> {
    const mapeo = await this.findOne(companyId, id);
    await this.mapeoRepo.remove(mapeo);
  }

  /**
   * Busca el estado_unificado para una combinación dada.
   * Replica la lógica del Power Query "MapeoEstados":
   * dado (transportadora, estatus_original, ultimo_movimiento) → estado_unificado
   */
  async resolveEstado(
    companyId: number,
    transportadora: string | null | undefined,
    estatusOriginal: string,
    ultimoMovimiento: string | null | undefined,
  ): Promise<string | null> {
    const t = (transportadora || '').trim();
    const e = (estatusOriginal || '').trim();
    const m = (ultimoMovimiento || '').trim();

    // Traer todos a memoria y resolver (es una tabla muy pequeña)
    const todosMapeos = await this.findAll(companyId);

    const normStr = (s?: string | null) => {
      if (!s) return '';
      let text = s.toLowerCase().trim();
      text = text.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
                 .replace(/ó/g, 'o').replace(/ú/g, 'u').replace(/ü/g, 'u');
      return text;
    };

    const tNorm = normStr(t);
    const eNorm = normStr(e);
    const mNorm = normStr(m);

    const mapeosNormalizados = todosMapeos.map((mapeo) => ({
      ...mapeo,
      t: normStr(mapeo.transportadora),
      e: normStr(mapeo.estatus_original),
      m: normStr(mapeo.ultimo_movimiento),
    }));

    // 1. Coincidencia completa
    let match = mapeosNormalizados.find((x) => x.t === tNorm && x.e === eNorm && x.m === mNorm);
    if (match) return match.estado_unificado;

    // 2. Coincidencia sin ultimo movimiento
    match = mapeosNormalizados.find((x) => x.t === tNorm && x.e === eNorm && x.m === '');
    if (match) return match.estado_unificado;

    // 3. Coincidencia solo por estatus original
    match = mapeosNormalizados.find((x) => x.e === eNorm);
    if (match) return match.estado_unificado;

    return null;
  }

  async bulkUpsert(companyId: number, records: Partial<MapeoEstado>[]): Promise<number> {
    let count = 0;
    for (const record of records) {
      const existing = await this.mapeoRepo.findOne({
        where: {
          empresa_id: companyId,
          transportadora: record.transportadora || '',
          estatus_original: record.estatus_original || '',
          ultimo_movimiento: record.ultimo_movimiento || '',
        },
      });
      if (existing) {
        Object.assign(existing, record);
        await this.mapeoRepo.save(existing);
      } else {
        await this.mapeoRepo.save(this.mapeoRepo.create({ ...record, empresa_id: companyId }));
      }
      count++;
    }
    return count;
  }
}
