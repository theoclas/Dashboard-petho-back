import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CarteraMovimiento } from './entities/cartera-movimiento.entity';

@Injectable()
export class CarteraService {
  constructor(
    @InjectRepository(CarteraMovimiento)
    private readonly carteraRepo: Repository<CarteraMovimiento>,
  ) {}

  async findAll(query?: {
    tipo?: string;
    orden_id?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query?.page || 1;
    const limit = query?.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.carteraRepo.createQueryBuilder('c');

    if (query?.tipo) {
      qb.andWhere('c.tipo = :tipo', { tipo: query.tipo });
    }
    if (query?.orden_id) {
      qb.andWhere('c.orden_id = :orden_id', { orden_id: query.orden_id });
    }

    qb.orderBy('c.fecha', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<CarteraMovimiento> {
    const mov = await this.carteraRepo.findOneBy({ id });
    if (!mov)
      throw new NotFoundException(
        `Movimiento de cartera con ID ${id} no encontrado`,
      );
    return mov;
  }

  async getCarteraPorPedido(ordenId: string) {
    const result = await this.carteraRepo
      .createQueryBuilder('c')
      .select('c.orden_id', 'orden_id')
      .addSelect(
        "SUM(CASE WHEN c.tipo = 'ENTRADA' THEN c.monto ELSE -c.monto END)",
        'cartera_neto',
      )
      .where('c.orden_id = :ordenId', { ordenId })
      .groupBy('c.orden_id')
      .getRawOne();

    return result || { orden_id: ordenId, cartera_neto: 0 };
  }

  /**
   * OPTIMIZADO: Obtiene el neto de cartera para MÚLTIPLES pedidos en UNA sola consulta.
   * Devuelve un Map<ordenId, carteraNeto> para lookups O(1) en memoria.
   */
  async getCarteraMapByOrdenIds(
    ordenIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!ordenIds.length) return map;

    const results = await this.carteraRepo
      .createQueryBuilder('c')
      .select('c.orden_id', 'orden_id')
      .addSelect(
        "SUM(CASE WHEN c.tipo = 'ENTRADA' THEN c.monto ELSE -c.monto END)",
        'cartera_neto',
      )
      .where('c.orden_id IN (:...ordenIds)', { ordenIds })
      .groupBy('c.orden_id')
      .getRawMany();

    for (const row of results) {
      map.set(row.orden_id, Number(row.cartera_neto) || 0);
    }
    return map;
  }

  async upsert(data: Partial<CarteraMovimiento>): Promise<CarteraMovimiento> {
    const existing = await this.carteraRepo.findOneBy({
      id: data.id as number,
    });
    if (existing) {
      Object.assign(existing, data);
      return this.carteraRepo.save(existing);
    }
    const mov = this.carteraRepo.create(data);
    return this.carteraRepo.save(mov);
  }

  /**
   * OPTIMIZADO: Inserta/actualiza todos los registros en lotes de 500 usando
   * INSERT ... ON CONFLICT DO UPDATE — una sola operación SQL por lote.
   */
  async bulkUpsert(records: Partial<CarteraMovimiento>[]): Promise<number> {
    if (!records.length) return 0;

    const BATCH_SIZE = 500;
    let total = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await this.carteraRepo
        .createQueryBuilder()
        .insert()
        .into(CarteraMovimiento)
        .values(batch as CarteraMovimiento[])
        .orUpdate(
          [
            'fecha',
            'tipo',
            'monto',
            'monto_previo',
            'orden_id',
            'numero_guia',
            'descripcion',
            'concepto_retiro',
          ],
          ['id'],
        )
        .execute();
      total += batch.length;
    }

    return total;
  }
}
