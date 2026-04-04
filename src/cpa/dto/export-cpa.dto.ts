import { IsIn, IsOptional, IsString } from 'class-validator';

/** Body de POST /cpa/export (mismos criterios que GET /cpa, sin paginación). */
export class ExportCpaDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  semana?: string;

  @IsOptional()
  @IsString()
  producto?: string;

  @IsOptional()
  @IsString()
  cuenta_publicitaria?: string;

  @IsOptional()
  @IsString()
  gasto_publicidad?: string;

  @IsOptional()
  @IsString()
  conversaciones?: string;

  @IsOptional()
  @IsString()
  total_facturado?: string;

  @IsOptional()
  @IsString()
  ganancia_promedio?: string;

  @IsOptional()
  @IsString()
  ventas?: string;

  @IsOptional()
  @IsString()
  ticket_promedio_producto?: string;

  @IsOptional()
  @IsString()
  cpa?: string;

  @IsOptional()
  @IsString()
  conversion_rate?: string;

  @IsOptional()
  @IsString()
  costo_publicitario?: string;

  @IsOptional()
  @IsString()
  rentabilidad?: string;

  @IsOptional()
  @IsString()
  utilidad_aproximada?: string;

  @IsOptional()
  @IsString()
  fecha_contains?: string;

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
