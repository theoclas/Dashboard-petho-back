import { UserRole } from '../users/entities/user.entity';

export interface AuthUser {
  userId: number;
  email: string;
  role: UserRole;
  companyId: number;
}
