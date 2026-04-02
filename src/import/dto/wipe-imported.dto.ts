import { IsString, MinLength } from 'class-validator';

export class WipeImportedDto {
  @IsString()
  @MinLength(1, { message: 'La contraseña es obligatoria' })
  password: string;
}
