import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const headerValue = request.headers['x-internal-secret'];
    const providedSecret = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const expectedSecret = this.configService.getOrThrow<string>('internal.apiSecret');

    if (!providedSecret || providedSecret !== expectedSecret) {
      throw new ForbiddenException('Invalid internal secret');
    }

    return true;
  }
}
