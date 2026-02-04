import { JwtPayload as PassportJwtPayload } from 'passport-jwt';

export type JwtPayload = PassportJwtPayload;

export interface AuthenticatedUser {
  externalUserId: string;
  claims: JwtPayload;
}
