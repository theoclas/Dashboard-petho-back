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
  id?: string;

  @IsOptional()
  @IsString()
  id_dropi?: string;

  @IsOptional()
  @IsString()
  cliente?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  guia?: string;

  @IsOptional()
  @IsString()
  departamento?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsString()
  notas_manuales?: string;

  @IsOptional()
  @IsString()
  producto?: string;

  @IsOptional()
  @IsString()
  estado_operativo?: string;

  @IsOptional()
  @IsString()
  estado_cartera?: string;

  @IsOptional()
  @IsString()
  estatus_original?: string;

  @IsOptional()
  @IsString()
  ultimo_mov?: string;

  @IsOptional()
  @IsString()
  venta?: string;

  @IsOptional()
  @IsString()
  ganancia_calc?: string;

  @IsOptional()
  @IsString()
  flete?: string;

  @IsOptional()
  @IsString()
  cartera?: string;

  @IsOptional()
  @IsString()
  costo_proveedor?: string;

  @IsOptional()
  @IsString()
  costo_devolucion_estimado?: string;

  @IsOptional()
  @IsString()
  dias_desde_ult_mov?: string;

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
