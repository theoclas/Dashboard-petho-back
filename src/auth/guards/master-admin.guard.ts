import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

type ReqUser = { email?: string };

@Injectable()
export class MasterAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: ReqUser }>();
    const user = req.user;
    const expected = process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase();
    if (!expected) {
      throw new ForbiddenException('MASTER_ADMIN_EMAIL no está configurado en el servidor');
    }
    const email = user?.email?.trim().toLowerCase();
    if (!email || email !== expected) {
      throw new ForbiddenException('Solo el administrador principal puede realizar esta acción');
    }
    return true;
  }
}
