import { IsOptional, IsString } from 'class-validator';

export class EfectividadQueryDto {
  @IsOptional()
  @IsString()
  desde?: string;

  @IsOptional()
  @IsString()
  hasta?: string;

  @IsOptional()
  @IsString()
  transportadora?: string;
}
