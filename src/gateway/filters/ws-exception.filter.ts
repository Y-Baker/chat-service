import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

interface ErrorPayload {
  code: string;
  message: string;
  timestamp: string;
  originalEvent?: string;
}

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient();
    const data = host.switchToWs().getData();
    const originalEvent = this.extractEventName(data);

    const payload: ErrorPayload = {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error',
      timestamp: new Date().toISOString(),
      ...(originalEvent ? { originalEvent } : {}),
    };

    if (exception instanceof WsException) {
      const error = exception.getError();
      if (typeof error === 'string') {
        payload.code = 'INTERNAL_ERROR';
        payload.message = error;
      } else if (error && typeof error === 'object') {
        const err = error as { code?: string; message?: string };
        payload.code = err.code ?? 'INTERNAL_ERROR';
        payload.message = err.message ?? payload.message;
      }
    } else if (exception instanceof HttpException) {
      payload.code = this.mapHttpStatus(exception.getStatus());
      payload.message = exception.message;
    } else if (exception instanceof Error) {
      payload.message = exception.message;
    }

    this.logger.warn(payload.message);
    client.emit('error', payload);
  }

  private extractEventName(data: unknown): string | undefined {
    if (data && typeof data === 'object' && 'event' in (data as any)) {
      const event = (data as { event?: string }).event;
      return typeof event === 'string' ? event : undefined;
    }
    return undefined;
  }

  private mapHttpStatus(status: number): string {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 400) return 'VALIDATION_ERROR';
    return 'INTERNAL_ERROR';
  }
}
