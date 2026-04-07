import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromHeader('x-auth-token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: any) {
    // payload.sub = user.id
    const user = await this.usersService.findForSession(payload.sub);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario inhabilitado o no existe');
    }
    // Retorna datos a request.user
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
