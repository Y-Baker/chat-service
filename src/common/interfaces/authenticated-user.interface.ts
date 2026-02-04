export interface JwtPayload {
  sub?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  externalUserId?: string;
  [key: string]: unknown;
}

export interface AuthenticatedUser {
  externalUserId: string;
  claims: JwtPayload;
}
