# Webhooks

Webhooks notify the host system about chat events.

## Configuration
Env vars:
- `WEBHOOK_ENABLED=true`
- `WEBHOOK_URL=https://host.example.com/webhooks/chat`
- `WEBHOOK_SECRET=...`
- `WEBHOOK_TIMEOUT_MS=5000`
- `WEBHOOK_RETRY_ATTEMPTS=3`
- `WEBHOOK_EVENTS=message.created,message.deleted` (optional filter)

## Headers
- `Content-Type: application/json`
- `X-Webhook-Signature: sha256=...`
- `X-Webhook-Event: message.created`
- `X-Webhook-Id: evt_...`

## Payload
```json
{
  "id": "evt_abc123",
  "type": "message.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": { "...": "..." }
}
```

## Signature Verification
Compute HMAC-SHA256 of the raw request body using `WEBHOOK_SECRET`.

Example:
```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signature, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

## Event Types
- `message.created`
- `message.updated`
- `message.deleted`
- `conversation.created`
- `conversation.deleted`
- `participant.added`
- `participant.removed`
- `reaction.added`
- `reaction.removed`
- `user.online`
- `user.offline`

## Retry Policy
- Retries on non-2xx responses or request failure.
- Exponential backoff (500ms base).
- Attempts: `WEBHOOK_RETRY_ATTEMPTS`.

