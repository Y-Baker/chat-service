import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../../common/interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const issuer = configService.get<string>('auth.jwtIssuer');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('auth.jwtSecret'),
      ...(issuer ? { issuer } : {}),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    const externalUserId =
      (payload as { externalUserId?: string }).externalUserId ??
      payload.sub;

    if (!externalUserId) {
      throw new UnauthorizedException('Missing external user id');
    }

    return {
      externalUserId,
      claims: payload,
    };
  }
}
