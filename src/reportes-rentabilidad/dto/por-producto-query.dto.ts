import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const SORT_FIELDS = [
  'producto',
  'entr',
  'tran',
  'dev',
  'pctEfectividad',
  'pctTransito',
  'pctDevolucion',
  'ventas',
  'pauta',
  'utilidad',
] as const;

export type RentabilidadSortBy = (typeof SORT_FIELDS)[number];

export class PorProductoQueryDto {
  @IsOptional()
  @IsString()
  desde?: string;

  @IsOptional()
  @IsString()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;

  @IsOptional()
  @IsIn([...SORT_FIELDS])
  sortBy?: RentabilidadSortBy = 'utilidad';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  search?: string;
}
