import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { WebhookEventType } from './enums/webhook-event-type.enum';
import { WebhookConfig } from './interfaces/webhook-config.interface';
import { WebhookDeliveryResult } from './interfaces/webhook-delivery.interface';
import { WebhookEvent } from './interfaces/webhook-event.interface';
import { signPayload } from './utils/signature.util';

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BACKOFF_MS = 500;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly config: WebhookConfig;
  private queue: WebhookEvent[] = [];
  private processing = false;

  constructor(private readonly configService: ConfigService) {
    const eventsEnv = this.configService.get<string>('webhook.events');
    const events = eventsEnv
      ? eventsEnv
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => value as WebhookEventType)
      : undefined;

    this.config = {
      enabled: this.configService.get<boolean>('webhook.enabled') ?? false,
      url: this.configService.get<string>('webhook.url'),
      secret: this.configService.get<string>('webhook.secret'),
      events,
      retryAttempts:
        this.configService.get<number>('webhook.retryAttempts') ?? DEFAULT_RETRY_ATTEMPTS,
      timeoutMs: this.configService.get<number>('webhook.timeoutMs') ?? DEFAULT_TIMEOUT_MS,
    };
  }

  async emitEvent(type: WebhookEventType, data: Record<string, unknown>): Promise<void> {
    if (!this.shouldSend(type)) {
      return;
    }

    const event: WebhookEvent = {
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    this.queue.push(event);
    await this.processQueue();
  }

  private shouldSend(type: WebhookEventType): boolean {
    if (!this.config.enabled || !this.config.url || !this.config.secret) {
      return false;
    }
    if (this.config.events && this.config.events.length > 0) {
      return this.config.events.includes(type);
    }
    return true;
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift();
        if (!event) continue;
        await this.deliverWithRetry(event);
      }
    } finally {
      this.processing = false;
    }
  }

  private async deliverWithRetry(event: WebhookEvent): Promise<void> {
    const attempts = Math.max(1, this.config.retryAttempts);
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = await this.deliver(event, attempt);
      if (result.success) {
        return;
      }
      if (attempt < attempts) {
        await this.delay(DEFAULT_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  private async deliver(event: WebhookEvent, attempt: number): Promise<WebhookDeliveryResult> {
    const timestamp = new Date().toISOString();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      const payload = JSON.stringify(event);
      const signature = signPayload(payload, this.config.secret ?? '');

      const response = await fetch(this.config.url ?? '', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event.type,
          'X-Webhook-Id': event.id,
        },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const error = `Webhook failed with status ${response.status}`;
        this.logger.warn(error);
        return {
          eventId: event.id,
          success: false,
          statusCode: response.status,
          attempt,
          error,
          timestamp,
        };
      }

      return {
        eventId: event.id,
        success: true,
        statusCode: response.status,
        attempt,
        error: null,
        timestamp,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook request failed';
      this.logger.warn(message);
      return {
        eventId: event.id,
        success: false,
        statusCode: null,
        attempt,
        error: message,
        timestamp,
      };
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
