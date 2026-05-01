import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth-user.interface';

export const AuthUserParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new BadRequestException('No se encontró usuario autenticado en la solicitud.');
    }
    if (!user.companyId) {
      throw new BadRequestException('No se encontró empresa activa en la sesión.');
    }
    return user;
  },
);
