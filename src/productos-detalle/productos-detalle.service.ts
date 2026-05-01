import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductoDetalle } from './entities/producto-detalle.entity';

@Injectable()
export class ProductosDetalleService {
  constructor(
    @InjectRepository(ProductoDetalle)
    private readonly productoRepo: Repository<ProductoDetalle>,
  ) {}

  async findAll(companyId: number, pedidoIdDropi?: string): Promise<ProductoDetalle[]> {
    if (pedidoIdDropi) {
      return this.productoRepo.findBy({ empresa_id: companyId, pedido_id_dropi: pedidoIdDropi });
    }
    return this.productoRepo.findBy({ empresa_id: companyId });
  }

  async findUniqueProducts(companyId: number): Promise<string[]> {
    const query = this.productoRepo.createQueryBuilder('p')
      .select('DISTINCT p.producto_nombre', 'producto_nombre')
      .where('p.empresa_id = :companyId', { companyId })
      .andWhere('p.producto_nombre IS NOT NULL')
      .orderBy('p.producto_nombre', 'ASC');
    const result = await query.getRawMany();
    return result.map((r) => r.producto_nombre);
  }

  async findOne(companyId: number, id: number): Promise<ProductoDetalle | null> {
    return this.productoRepo.findOneBy({ id, empresa_id: companyId });
  }

  async bulkInsert(companyId: number, records: Partial<ProductoDetalle>[]): Promise<number> {
    const entities = records.map((r) => this.productoRepo.create({ ...r, empresa_id: companyId }));
    await this.productoRepo.save(entities);
    return entities.length;
  }

  async deleteByPedidoDropiId(companyId: number, pedidoIdDropi: string): Promise<void> {
    await this.productoRepo.delete({ empresa_id: companyId, pedido_id_dropi: pedidoIdDropi });
  }
}
