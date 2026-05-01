import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

describe('AuthService multi-company', () => {
  const mockUsersService = {
    findByUsername: jest.fn(),
    findCompaniesForUser: jest.fn(),
    userHasCompany: jest.fn(),
    findForSession: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'signed-token'),
  };

  const service = new AuthService(
    mockUsersService as unknown as any,
    mockJwtService as unknown as JwtService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns companies after first login step', async () => {
    mockUsersService.findByUsername.mockResolvedValue({
      id: 1,
      username: 'demo',
      email: 'demo@test.com',
      role: UserRole.ADMIN,
      is_active: true,
      password: await bcrypt.hash('1234', 1),
    });
    mockUsersService.findCompaniesForUser.mockResolvedValue([
      { id: 1, nombre: 'Empresa A' },
      { id: 2, nombre: 'Empresa B' },
    ]);

    const result = await service.login({ username: 'demo', password: '1234' });

    expect(result.companies).toHaveLength(2);
    expect(result.user.username).toBe('demo');
  });

  it('fails select-company without membership', async () => {
    mockUsersService.findByUsername.mockResolvedValue({
      id: 1,
      username: 'demo',
      email: 'demo@test.com',
      role: UserRole.ADMIN,
      is_active: true,
      password: await bcrypt.hash('1234', 1),
    });
    mockUsersService.userHasCompany.mockResolvedValue(false);

    await expect(
      service.selectCompany({ username: 'demo', password: '1234', companyId: 2 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('switches company for authenticated user', async () => {
    mockUsersService.findForSession.mockResolvedValue({
      id: 5,
      username: 'ops',
      email: 'ops@test.com',
      role: UserRole.OPERADOR,
      is_active: true,
    });
    mockUsersService.userHasCompany.mockResolvedValue(true);

    const result = await service.switchCompany(5, { companyId: 9 });

    expect(mockJwtService.sign).toHaveBeenCalled();
    expect(result.user.companyId).toBe(9);
    expect(result.access_token).toBe('signed-token');
  });

  it('rejects switch-company without company id', async () => {
    await expect(service.switchCompany(1, { companyId: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
