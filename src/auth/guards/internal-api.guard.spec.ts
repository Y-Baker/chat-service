import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common/interfaces/features/execution-context.interface';
import { InternalApiGuard } from './internal-api.guard';

describe('InternalApiGuard', () => {
  const makeContext = (serviceToken?: string | string[], internalSecret?: string | string[]) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-service-token': serviceToken,
            'x-internal-secret': internalSecret,
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows request with matching secret', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('expected-secret'),
    } as unknown as ConfigService;

    const guard = new InternalApiGuard(configService);

    expect(guard.canActivate(makeContext('expected-secret'))).toBe(true);
  });

  it('allows request with matching legacy internal secret header', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('expected-secret'),
    } as unknown as ConfigService;

    const guard = new InternalApiGuard(configService);

    expect(guard.canActivate(makeContext(undefined, 'expected-secret'))).toBe(true);
  });

  it('denies request when secret is missing', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('expected-secret'),
    } as unknown as ConfigService;

    const guard = new InternalApiGuard(configService);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('denies request when secret mismatches', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('expected-secret'),
    } as unknown as ConfigService;

    const guard = new InternalApiGuard(configService);

    expect(() => guard.canActivate(makeContext('wrong-secret'))).toThrow(ForbiddenException);
  });
});
