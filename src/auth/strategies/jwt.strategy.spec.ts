import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const makeConfigService = (issuer?: string) =>
    ({
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'auth.jwtIssuer') {
          return issuer;
        }
        return undefined;
      }),
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    }) as unknown as ConfigService;

  it('returns externalUserId from payload.externalUserId', () => {
    const strategy = new JwtStrategy(makeConfigService('issuer'));

    const result = strategy.validate({ externalUserId: 'user-1' });

    expect(result.externalUserId).toBe('user-1');
    expect(result.claims).toEqual({ externalUserId: 'user-1' });
  });

  it('falls back to payload.sub when externalUserId is missing', () => {
    const strategy = new JwtStrategy(makeConfigService());

    const result = strategy.validate({ sub: 'user-2' });

    expect(result.externalUserId).toBe('user-2');
  });

  it('throws when no externalUserId or sub is present', () => {
    const strategy = new JwtStrategy(makeConfigService());

    expect(() => strategy.validate({})).toThrow(UnauthorizedException);
  });
});
