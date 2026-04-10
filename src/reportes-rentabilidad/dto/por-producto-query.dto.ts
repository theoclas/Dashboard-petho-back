import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
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
  @Max(800)
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

  /** Filtros opcionales por rango (columnas de la tabla de rentabilidad) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minEntr?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxEntr?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minTran?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxTran?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minDev?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxDev?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPctEfectividad?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPctEfectividad?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPctTransito?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPctTransito?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPctDevolucion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPctDevolucion?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minVentas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxVentas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPauta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPauta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minUtilidad?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxUtilidad?: number;
}
