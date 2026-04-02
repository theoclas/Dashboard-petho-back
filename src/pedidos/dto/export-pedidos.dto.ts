import { IsIn, IsOptional, IsString } from 'class-validator';

/** Body de POST /pedidos/export (mismos criterios que el listado, sin page/limit). */
export class ExportPedidosDto {
  @IsOptional()
  @IsString()
  estado_unificado?: string;

  @IsOptional()
  @IsString()
  transportadora?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  id_dropi?: string;

  @IsOptional()
  @IsString()
  sortField?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
