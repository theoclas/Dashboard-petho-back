import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ComparativaQueryDto {
  @IsOptional()
  @IsIn(['departamento', 'ciudad'])
  dimension?: 'departamento' | 'ciudad' = 'departamento';

  @IsOptional()
  @IsIn(['efectividad', 'devolucion'])
  metrica?: 'efectividad' | 'devolucion' = 'efectividad';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  top?: number = 15;

  @IsOptional()
  @IsString()
  desde?: string;

  @IsOptional()
  @IsString()
  hasta?: string;
}
