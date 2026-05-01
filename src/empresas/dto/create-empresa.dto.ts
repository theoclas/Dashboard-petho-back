import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEmpresaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  slug: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
