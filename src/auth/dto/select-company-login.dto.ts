import { IsNotEmpty, IsString, IsInt } from 'class-validator';

export class SelectCompanyLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsInt()
  companyId: number;
}
