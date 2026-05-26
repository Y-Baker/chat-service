import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey } from 'node:crypto';

export type JwtValidationMode = 'symmetric' | 'asymmetric';

interface DecodedJwt {
  header?: {
    kid?: string;
  };
}

interface JwksDocument {
  keys?: Array<Record<string, unknown>>;
}

interface CachedJwks {
  expiresAt: number;
  keysByKid: Map<string, string>;
}

@Injectable()
export class JwtVerificationService {
  private cachedJwks?: CachedJwks;
  private cachedJwksPromise?: Promise<CachedJwks>;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async verifyToken<T extends object>(token: string): Promise<T> {
    const secretOrKey = await this.resolveVerificationSecret(token);
    const issuer = this.configService.get<string>('auth.jwtIssuer');
    const audience = this.configService.get<string>('auth.jwtAudience');
    const mode = this.getValidationMode();

    return this.jwtService.verifyAsync<T>(token, {
      secret: secretOrKey,
      ...(issuer ? { issuer } : {}),
      ...(audience ? { audience } : {}),
      ...(mode === 'asymmetric' ? { algorithms: ['RS256'] } : {}),
    });
  }

  async resolveVerificationSecret(token: string): Promise<string> {
    if (this.getValidationMode() === 'symmetric') {
      return this.configService.getOrThrow<string>('auth.jwtSecret');
    }

    const kid = this.extractKeyId(token);
    const jwks = await this.getJwks();
    const publicKey = jwks.keysByKid.get(kid);

    if (!publicKey) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return publicKey;
  }

  private getValidationMode(): JwtValidationMode {
    return this.configService.get<JwtValidationMode>('auth.jwtValidationMode') ?? 'symmetric';
  }

  private extractKeyId(token: string): string {
    const decoded = this.jwtService.decode(token, { complete: true }) as DecodedJwt | null;
    const kid = decoded?.header?.kid?.trim();

    if (!kid) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return kid;
  }

  private async getJwks(): Promise<CachedJwks> {
    const cache = this.cachedJwks;
    if (cache && cache.expiresAt > Date.now()) {
      return cache;
    }

    if (!this.cachedJwksPromise) {
      this.cachedJwksPromise = this.fetchJwks().finally(() => {
        this.cachedJwksPromise = undefined;
      });
    }

    try {
      const jwks = await this.cachedJwksPromise;
      this.cachedJwks = jwks;
      return jwks;
    } catch (error) {
      if (cache) {
        return cache;
      }

      throw error;
    }
  }

  private async fetchJwks(): Promise<CachedJwks> {
    const jwksUrl = this.configService.getOrThrow<string>('auth.jwtJwksUrl');
    const cacheTtlMs = this.configService.get<number>('auth.jwtJwksCacheTtlMs') ?? 5 * 60 * 1000;
    const response = await fetch(jwksUrl, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    const jwks = (await response.json()) as JwksDocument;
    const keysByKid = new Map<string, string>();

    for (const jwk of jwks.keys ?? []) {
      const kid = typeof jwk.kid === 'string' ? jwk.kid.trim() : '';
      if (!kid) {
        continue;
      }

      try {
        const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' })
          .export({ format: 'pem', type: 'spki' })
          .toString();

        keysByKid.set(kid, publicKey);
      } catch {
        continue;
      }
    }

    if (keysByKid.size === 0) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return {
      expiresAt: Date.now() + cacheTtlMs,
      keysByKid,
    };
  }
}
