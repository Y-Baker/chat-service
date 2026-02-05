import { WebhookEventType } from '../enums/webhook-event-type.enum';

export interface WebhookConfig {
  enabled: boolean;
  url?: string;
  secret?: string;
  events?: WebhookEventType[];
  retryAttempts: number;
  timeoutMs: number;
}
