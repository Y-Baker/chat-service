import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey } from 'node:crypto';
import { JwtVerificationService } from './jwt-verification.service';

jest.mock('node:crypto', () => ({
  createPublicKey: jest.fn(),
}));

describe('JwtVerificationService', () => {
  const makeConfigService = (values: Record<string, unknown>) =>
    ({
      get: jest.fn().mockImplementation((key: string) => values[key]),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        const value = values[key];
        if (value === undefined || value === null) {
          throw new Error(`Missing config: ${key}`);
        }

        return value;
      }),
    }) as unknown as ConfigService;

  const makeJwtService = () =>
    ({
      decode: jest.fn(),
      verifyAsync: jest.fn(),
    }) as unknown as JwtService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('verifies symmetric tokens using the configured secret', async () => {
    const jwtService = makeJwtService();
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'user-1' });

    const service = new JwtVerificationService(
      makeConfigService({
        'auth.jwtValidationMode': 'symmetric',
        'auth.jwtSecret': 'test-secret-test-secret-test-secret-1234',
        'auth.jwtIssuer': 'issuer',
        'auth.jwtAudience': 'audience',
      }),
      jwtService,
    );

    await expect(service.verifyToken<{ sub: string }>('token')).resolves.toEqual({ sub: 'user-1' });
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        secret: 'test-secret-test-secret-test-secret-1234',
        issuer: 'issuer',
        audience: 'audience',
      }),
    );
  });

  it('verifies asymmetric tokens using a JWKS public key', async () => {
    const jwtService = makeJwtService();
    (jwtService.decode as jest.Mock).mockReturnValue({
      header: { kid: 'key-1' },
    });
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({ sub: 'user-1' });

    const createPublicKeyMock = createPublicKey as jest.MockedFunction<typeof createPublicKey>;
    createPublicKeyMock.mockReturnValue({
      export: jest.fn().mockReturnValue('pem-public-key'),
    } as never);

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        keys: [{ kid: 'key-1', kty: 'RSA', n: 'n', e: 'AQAB' }],
      }),
    } as Response);

    const service = new JwtVerificationService(
      makeConfigService({
        'auth.jwtValidationMode': 'asymmetric',
        'auth.jwtJwksUrl': 'https://portal-gateway/.well-known/jwks.json',
        'auth.jwtJwksCacheTtlMs': 60_000,
        'auth.jwtIssuer': 'portal-gateway',
      }),
      jwtService,
    );

    await expect(service.verifyToken<{ sub: string }>('token')).resolves.toEqual({ sub: 'user-1' });
    expect(createPublicKeyMock).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://portal-gateway/.well-known/jwks.json',
      expect.objectContaining({
        headers: { accept: 'application/json' },
      }),
    );
    expect(jwtService.verifyAsync).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        secret: 'pem-public-key',
        algorithms: ['RS256'],
      }),
    );
  });

  it('rejects asymmetric tokens without a key id', async () => {
    const jwtService = makeJwtService();
    (jwtService.decode as jest.Mock).mockReturnValue({ header: {} });

    const service = new JwtVerificationService(
      makeConfigService({
        'auth.jwtValidationMode': 'asymmetric',
        'auth.jwtJwksUrl': 'https://portal-gateway/.well-known/jwks.json',
      }),
      jwtService,
    );

    await expect(service.resolveVerificationSecret('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
