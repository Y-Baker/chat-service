import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { InternalApiGuard } from '../guards/internal-api.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

export function Authorize(options: { jwt?: boolean; internal?: boolean } = {}): MethodDecorator & ClassDecorator {
  const { jwt = true, internal = false } = options;
  const decorators: Array<MethodDecorator | ClassDecorator> = [];
  const guardClasses: Array<any> = [];

  if (jwt) {
    decorators.push(ApiBearerAuth());
    guardClasses.push(JwtAuthGuard);
  }

  if (internal) {
    decorators.push(
      ApiHeader({
        name: 'X-Service-Token',
        description: 'Service token for private API access',
        required: true,
      }),
    );
    guardClasses.push(InternalApiGuard);
  }

  if (guardClasses.length > 0) {
    decorators.push(UseGuards(...guardClasses));
  }

  return applyDecorators(...(decorators as any));
}
