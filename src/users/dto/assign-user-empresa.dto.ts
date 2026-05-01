import { IsInt, Min } from 'class-validator';

export class AssignUserEmpresaDto {
  @IsInt()
  @Min(1)
  empresa_id: number;
}
