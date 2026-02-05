import { WebhookEventType } from '../enums/webhook-event-type.enum';

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}
