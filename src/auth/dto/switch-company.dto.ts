import { IsInt } from 'class-validator';

export class SwitchCompanyDto {
  @IsInt()
  companyId: number;
}
