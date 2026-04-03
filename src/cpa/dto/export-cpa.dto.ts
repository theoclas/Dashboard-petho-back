import { IsIn, IsOptional, IsString } from 'class-validator';

/** Body de POST /cpa/export (mismos criterios que GET /cpa, sin paginación). */
export class ExportCpaDto {
  @IsOptional()
  @IsString()
  producto?: string;

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
