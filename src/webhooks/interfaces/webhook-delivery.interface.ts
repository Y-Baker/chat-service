export interface WebhookDeliveryResult {
  eventId: string;
  success: boolean;
  statusCode: number | null;
  attempt: number;
  error: string | null;
  timestamp: string;
}
