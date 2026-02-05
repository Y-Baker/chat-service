## Phase 7: Webhooks

This phase enables the chat service to notify the host/master system of events for business logic, notifications, analytics, and integrations.

**Estimated Duration:** 2-3 days

**Dependencies:**
- Phase 4 (WebSocket Gateway) — Event sources
- Phase 5 (Reactions & Read Receipts) — Additional events
- Phase 6 (Presence) — Online/offline events

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Chat Service                                    │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │  Messages   │  │ Reactions   │  │  Presence   │  │Conversations│   │
│  │  Service    │  │  Service    │  │  Service    │  │  Service    │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
│         │                │                │                │           │
│         └────────────────┴────────────────┴────────────────┘           │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Webhooks Service                            │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │   │
│  │  │ Event Queue  │  │ Dispatcher   │  │ Retry Manager        │   │   │
│  │  │ (in-memory   │─▶│ (sends HTTP) │─▶│ (exponential backoff)│   │   │
│  │  │  or Redis)   │  │              │  │                      │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                                     │ HTTPS POST
                                     │ (signed payload)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Master/Host Service                             │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    POST /webhooks/chat                           │   │
│  │                                                                  │   │
│  │  1. Verify signature                                             │   │
│  │  2. Parse event                                                  │   │
│  │  3. Handle based on event type:                                  │   │
│  │     - message.created → Send push notification                   │   │
│  │     - user.online → Update user status                           │   │
│  │     - reaction.added → Update engagement metrics                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Webhook Event Types

| Event | Trigger | Use Case |
|-------|---------|----------|
| `message.created` | New message sent | Push notifications, analytics |
| `message.updated` | Message edited | Sync external systems |
| `message.deleted` | Message deleted | Audit log, sync |
| `conversation.created` | New conversation | Onboarding flows, analytics |
| `conversation.deleted` | Conversation removed | Cleanup, sync |
| `participant.added` | User joined conversation | Notifications, access control |
| `participant.removed` | User left/removed | Cleanup, access control |
| `reaction.added` | Reaction added | Engagement metrics |
| `reaction.removed` | Reaction removed | Engagement metrics |
| `user.online` | User connected | Status sync, analytics |
| `user.offline` | User disconnected | Status sync, last seen |

---

## Webhook Payload Structure

```
{
  "id": "evt_abc123",              // Unique event ID (for idempotency)
  "type": "message.created",       // Event type
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {                        // Event-specific payload
    "messageId": "msg_123",
    "conversationId": "conv_456",
    "senderId": "user_1",
    "content": "Hello!",
    ...
  }
}
```

---

## Security: Webhook Signatures

**Purpose:** Allow host to verify webhook came from chat service.

**Method:** HMAC-SHA256

**Process:**
1. Chat service creates signature: `HMAC-SHA256(payload, secret)`
2. Signature sent in header: `X-Webhook-Signature: sha256=abc123...`
3. Host recalculates signature with same secret
4. If match, request is authentic

---

## Module Structure

```
src/webhooks/
├── webhooks.module.ts
├── webhooks.service.ts
├── webhooks.controller.ts           # Optional: for webhook config management
├── interfaces/
│   ├── webhook-event.interface.ts
│   ├── webhook-config.interface.ts
│   └── webhook-delivery.interface.ts
├── enums/
│   └── webhook-event-type.enum.ts
├── dto/
│   └── webhook-config.dto.ts        # Optional: if configurable via API
└── utils/
    └── signature.util.ts
```

---

## Step 7.1: Define Webhook Enums

### webhook-event-type.enum.ts

**Event types:**
```
MESSAGE_CREATED = 'message.created'
MESSAGE_UPDATED = 'message.updated'
MESSAGE_DELETED = 'message.deleted'
CONVERSATION_CREATED = 'conversation.created'
CONVERSATION_DELETED = 'conversation.deleted'
PARTICIPANT_ADDED = 'participant.added'
PARTICIPANT_REMOVED = 'participant.removed'
REACTION_ADDED = 'reaction.added'
REACTION_REMOVED = 'reaction.removed'
USER_ONLINE = 'user.online'
USER_OFFLINE = 'user.offline'
```

---

## Step 7.2: Define Webhook Interfaces

### webhook-event.interface.ts

**WebhookEvent interface:**
- `id` (string) — Unique event ID (UUID)
- `type` (WebhookEventType) — Event type enum
- `timestamp` (Date) — When event occurred
- `data` (object) — Event-specific payload

### webhook-config.interface.ts

**WebhookConfig interface:**
- `url` (string) — Endpoint URL to send webhooks
- `secret` (string) — Shared secret for signing
- `enabled` (boolean) — Whether webhooks are active
- `events` (WebhookEventType[]) — Which events to send (optional, default all)
- `retryAttempts` (number) — Max retry attempts (default 3)
- `timeoutMs` (number) — Request timeout (default 5000)

### webhook-delivery.interface.ts

**WebhookDeliveryResult interface:**
- `eventId` (string) — Event ID
- `success` (boolean) — Whether delivery succeeded
- `statusCode` (number | null) — HTTP status code
- `attempt` (number) — Which attempt (1, 2, 3...)
- `error` (string | null) — Error message if failed
- `timestamp` (Date) — Delivery attempt time

---

## Step 7.3: Define Event Payloads

### Message Events

**message.created:**
```
{
  messageId: string
  conversationId: string
  conversationType: 'direct' | 'group'
  senderId: string
  senderName: string
  content: string
  contentPreview: string        // Truncated for notifications
  attachmentCount: number
  replyTo: string | null
  createdAt: string
}
```

**message.updated:**
```
{
  messageId: string
  conversationId: string
  senderId: string
  content: string
  contentPreview: string
  updatedAt: string
}
```

**message.deleted:**
```
{
  messageId: string
  conversationId: string
  senderId: string
  deletedAt: string
}
```

### Conversation Events

**conversation.created:**
```
{
  conversationId: string
  type: 'direct' | 'group'
  name: string | null
  createdBy: string
  participantIds: string[]
  participantCount: number
  createdAt: string
}
```

**conversation.deleted:**
```
{
  conversationId: string
  deletedBy: string
  deletedAt: string
}
```

### Participant Events

**participant.added:**
```
{
  conversationId: string
  userId: string
  addedBy: string
  role: 'admin' | 'member'
  timestamp: string
}
```

**participant.removed:**
```
{
  conversationId: string
  userId: string
  removedBy: string          // or self if left
  reason: 'removed' | 'left'
  timestamp: string
}
```

### Reaction Events

**reaction.added:**
```
{
  messageId: string
  conversationId: string
  userId: string
  emoji: string
  timestamp: string
}
```

**reaction.removed:**
```
{
  messageId: string
  conversationId: string
  userId: string
  emoji: string
  timestamp: string
}
```

### Presence Events

**user.online:**
```
{
  userId: string
  timestamp: string
}
```

**user.offline:**
```
{
  userId: string
  lastSeen: string
  timestamp: string
}
```

---

## Step 7.4: Implement Signature Utility

### signature.util.ts

**Functions to implement:**

#### generateSignature(payload, secret)

**Steps:**
1. Convert payload to JSON string (use consistent serialization)
2. Create HMAC using SHA256 and secret
3. Return hex-encoded signature

**Implementation notes:**
- Use Node.js `crypto` module
- Ensure consistent JSON serialization (sorted keys if needed)

#### verifySignature(payload, signature, secret)

**Steps:**
1. Generate expected signature
2. Use timing-safe comparison
3. Return boolean

**Important:** Use `crypto.timingSafeEqual()` to prevent timing attacks

#### formatSignatureHeader(signature)

**Steps:**
1. Return formatted string: `sha256={signature}`

#### parseSignatureHeader(header)

**Steps:**
1. Extract algorithm and signature from header
2. Return parsed signature or null if invalid

---

## Step 7.5: Implement Webhooks Service

### Properties

- HttpService (from @nestjs/axios) — For making HTTP requests
- ConfigService — For webhook configuration
- Logger — For logging delivery attempts
- Event queue (optional) — For async processing

### Configuration Loading

**From environment/config:**
```
WEBHOOK_URL=http://master-service:3000/webhooks/chat
WEBHOOK_SECRET=your-webhook-secret
WEBHOOK_ENABLED=true
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRY_ATTEMPTS=3
```

### Methods to Implement

#### emit(type, data)

**Purpose:** Queue/send a webhook event

**Steps:**
1. Check if webhooks enabled, return early if not
2. Check if event type is in allowed events (if filtering configured)
3. Create event object:
   - Generate unique ID (UUID)
   - Set type and timestamp
   - Attach data payload
4. Queue for delivery or send immediately

**Options for delivery:**

**Option A: Synchronous (Simple)**
- Call `deliver()` directly
- Blocks until complete
- Simple but can slow down main flow

**Option B: Fire-and-forget async (Recommended for MVP)**
- Call `deliver()` without awaiting
- Use `.catch()` to handle errors silently
- Doesn't block main flow

**Option C: Queue-based (Production)**
- Push to Redis queue or Bull queue
- Separate worker processes
- Best for high volume

**Recommended for MVP:** Option B

#### deliver(event)

**Purpose:** Actually send the webhook

**Steps:**
1. Serialize event to JSON
2. Generate signature
3. Make HTTP POST request:
   - URL from config
   - Headers:
     - `Content-Type: application/json`
     - `X-Webhook-Signature: sha256={signature}`
     - `X-Webhook-Event: {event.type}`
     - `X-Webhook-Id: {event.id}`
     - `X-Webhook-Timestamp: {event.timestamp}`
   - Body: JSON payload
   - Timeout from config
4. Handle response:
   - 2xx = success
   - 4xx = don't retry (client error)
   - 5xx = retry
5. Return delivery result

#### deliverWithRetry(event)

**Purpose:** Deliver with exponential backoff retry

**Steps:**
1. Attempt delivery
2. If success, return
3. If failure and retryable:
   - Wait with exponential backoff (1s, 2s, 4s)
   - Retry up to max attempts
4. Log final result

**Backoff formula:**
```
delay = baseDelay * (2 ^ attemptNumber)
```

**Example:** 1s, 2s, 4s for 3 attempts

#### isRetryable(statusCode, error)

**Purpose:** Determine if delivery should be retried

**Retryable:**
- 5xx status codes
- Network errors (ECONNREFUSED, ETIMEDOUT)
- No response received

**Not retryable:**
- 2xx (success)
- 4xx (client error — bad payload, unauthorized)

### Convenience Methods

Create typed methods for each event type for cleaner integration:

#### emitMessageCreated(message)

**Steps:**
1. Build payload from message object
2. Call `emit('message.created', payload)`

#### emitMessageUpdated(message)

**Steps:**
1. Build payload from message object
2. Call `emit('message.updated', payload)`

#### emitMessageDeleted(messageId, conversationId, senderId)

**Steps:**
1. Build payload
2. Call `emit('message.deleted', payload)`

#### emitConversationCreated(conversation)

**Steps:**
1. Build payload from conversation object
2. Call `emit('conversation.created', payload)`

#### emitConversationDeleted(conversationId, deletedBy)

**Steps:**
1. Build payload
2. Call `emit('conversation.deleted', payload)`

#### emitParticipantAdded(conversationId, userId, addedBy, role)

**Steps:**
1. Build payload
2. Call `emit('participant.added', payload)`

#### emitParticipantRemoved(conversationId, userId, removedBy, reason)

**Steps:**
1. Build payload
2. Call `emit('participant.removed', payload)`

#### emitReactionAdded(messageId, conversationId, userId, emoji)

**Steps:**
1. Build payload
2. Call `emit('reaction.added', payload)`

#### emitReactionRemoved(messageId, conversationId, userId, emoji)

**Steps:**
1. Build payload
2. Call `emit('reaction.removed', payload)`

#### emitUserOnline(userId)

**Steps:**
1. Build payload
2. Call `emit('user.online', payload)`

#### emitUserOffline(userId, lastSeen)

**Steps:**
1. Build payload
2. Call `emit('user.offline', payload)`

---

## Step 7.6: Integrate with Other Services

### MessagesService

**In send() method:**
After successfully creating message:
```
Call webhooksService.emitMessageCreated(message)
```

**In edit() method:**
After successfully editing:
```
Call webhooksService.emitMessageUpdated(message)
```

**In delete() method:**
After successfully deleting:
```
Call webhooksService.emitMessageDeleted(messageId, conversationId, senderId)
```

### ConversationsService

**In create() method:**
After successfully creating:
```
Call webhooksService.emitConversationCreated(conversation)
```

**In delete() method:**
After successfully deleting:
```
Call webhooksService.emitConversationDeleted(conversationId, deletedBy)
```

**In addParticipant() method:**
After successfully adding:
```
Call webhooksService.emitParticipantAdded(conversationId, userId, addedBy, role)
```

**In removeParticipant() / leave() methods:**
After successfully removing:
```
Call webhooksService.emitParticipantRemoved(conversationId, userId, removedBy, reason)
```

### ReactionsService

**In addReaction() method:**
After successfully adding:
```
Call webhooksService.emitReactionAdded(messageId, conversationId, userId, emoji)
```

**In removeReaction() method:**
After successfully removing:
```
Call webhooksService.emitReactionRemoved(messageId, conversationId, userId, emoji)
```

### PresenceService or ChatGateway

**In setOnline() or handleConnection():**
When user comes online:
```
Call webhooksService.emitUserOnline(userId)
```

**In setOffline() or handleDisconnect():**
When user goes offline (fully, no remaining connections):
```
Call webhooksService.emitUserOffline(userId, lastSeen)
```

---

## Step 7.7: Webhook Configuration Options

### Option A: Environment-Only (Recommended for MVP)

All config via environment variables:
```
WEBHOOK_URL=...
WEBHOOK_SECRET=...
WEBHOOK_ENABLED=true
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRY_ATTEMPTS=3
WEBHOOK_EVENTS=message.created,message.deleted,user.online,user.offline
```

**Pros:** Simple, no database needed
**Cons:** Requires restart to change

### Option B: Database-Stored (Future Enhancement)

Store webhook config in MongoDB:
```
{
  _id: ObjectId,
  url: string,
  secret: string,
  enabled: boolean,
  events: string[],
  createdAt: Date,
  updatedAt: Date
}
```

**Pros:** Dynamic configuration via API
**Cons:** More complex, needs admin endpoints

### Option C: Multi-Webhook Support (Future Enhancement)

Support multiple webhook endpoints:
```
{
  _id: ObjectId,
  name: string,
  url: string,
  secret: string,
  enabled: boolean,
  events: string[],
  filters: {
    conversationIds?: string[],
    userIds?: string[]
  }
}
```

**Pros:** Flexible integrations
**Cons:** Significantly more complex

**Recommendation:** Start with Option A, migrate to B/C if needed.

---

## Step 7.8: Optional — Webhook Controller

For dynamic configuration (Option B/C), add admin endpoints:

### Endpoints

| Method | Route | Guard | Description |
|--------|-------|-------|-------------|
| `GET` | `/api/admin/webhooks/config` | InternalApiGuard | Get current config |
| `PUT` | `/api/admin/webhooks/config` | InternalApiGuard | Update config |
| `POST` | `/api/admin/webhooks/test` | InternalApiGuard | Send test webhook |

### Implementation Points

#### GET /api/admin/webhooks/config

**Response:**
```
{
  url: "https://...",
  enabled: true,
  events: ["message.created", ...],
  timeoutMs: 5000,
  retryAttempts: 3
}
```

**Note:** Don't expose secret in response.

#### PUT /api/admin/webhooks/config

**Body:**
```
{
  url?: string,
  secret?: string,
  enabled?: boolean,
  events?: string[],
  timeoutMs?: number,
  retryAttempts?: number
}
```

#### POST /api/admin/webhooks/test

**Purpose:** Send a test event to verify configuration

**Body:**
```
{
  eventType?: string   // Default: "test"
}
```

**Response:**
```
{
  success: boolean,
  statusCode: number,
  responseTime: number,
  error?: string
}
```

---

## Step 7.9: Logging and Monitoring

### What to Log

**For each delivery attempt:**
- Event ID
- Event type
- Attempt number
- URL (without secret)
- Status code
- Response time
- Success/failure
- Error message (if failed)

**Log levels:**
- Success: `debug` or `info`
- Retryable failure: `warn`
- Final failure: `error`

### Log Format Example

```
[Webhook] Delivered message.created (evt_abc123) to https://... - 200 OK (150ms)
[Webhook] Failed message.created (evt_abc123) attempt 1/3 - 503 Service Unavailable
[Webhook] Retrying message.created (evt_abc123) in 2000ms
[Webhook] Delivered message.created (evt_abc123) on attempt 2 - 200 OK (200ms)
```

### Metrics to Track (Optional)

- Total webhooks sent
- Success rate
- Average response time
- Failures by event type
- Retry rate

---

## Step 7.10: Error Handling

### Network Errors

**Errors to handle:**
- `ECONNREFUSED` — Host unreachable
- `ETIMEDOUT` — Request timeout
- `ENOTFOUND` — DNS resolution failed
- `ECONNRESET` — Connection reset

**Handling:**
- Log error with details
- Mark as retryable
- Continue with retry logic

### HTTP Errors

**4xx errors:**
- Log as warning
- Do not retry (client error)
- Check if payload is malformed

**5xx errors:**
- Log as warning
- Retry with backoff

### Payload Errors

**Before sending:**
- Validate event data is serializable
- Catch JSON.stringify errors
- Log and skip if invalid

---

## Step 7.11: Register Module

### webhooks.module.ts

**Imports:**
- HttpModule (from @nestjs/axios)
- ConfigModule

**Providers:**
- WebhooksService

**Controllers:**
- WebhooksController (if implementing admin endpoints)

**Exports:**
- WebhooksService

### Update Other Modules

**MessagesModule:**
- Import WebhooksModule
- Inject WebhooksService into MessagesService

**ConversationsModule:**
- Import WebhooksModule
- Inject WebhooksService into ConversationsService

**ReactionsModule:**
- Import WebhooksModule
- Inject WebhooksService into ReactionsService

**GatewayModule or PresenceModule:**
- Import WebhooksModule
- Inject WebhooksService where needed

### app.module.ts

- Add WebhooksModule

---

## Step 7.12: Host/Master Side Implementation Guide

### Endpoint Setup

**Create endpoint:** `POST /webhooks/chat`

### Request Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | `sha256={signature}` |
| `X-Webhook-Event` | Event type |
| `X-Webhook-Id` | Unique event ID |
| `X-Webhook-Timestamp` | Event timestamp |

### Verification Steps

1. Extract signature from header
2. Get raw request body (before parsing)
3. Calculate expected signature using shared secret
4. Compare using timing-safe comparison
5. Reject if mismatch (return 401)

### Idempotency

**Problem:** Retries can cause duplicate processing

**Solution:**
1. Track processed event IDs (Redis set with TTL)
2. On receive, check if ID already processed
3. If processed, return 200 (acknowledge) but skip logic
4. If new, process and mark as processed

**Redis key:** `webhook:processed:{eventId}` with 24-hour TTL

### Response Codes

| Code | Meaning | Chat Service Behavior |
|------|---------|----------------------|
| 200 | Success | Mark delivered |
| 201 | Created | Mark delivered |
| 204 | No content | Mark delivered |
| 400 | Bad request | Don't retry |
| 401 | Unauthorized | Don't retry (check secret) |
| 404 | Not found | Don't retry |
| 500 | Server error | Retry |
| 502 | Bad gateway | Retry |
| 503 | Unavailable | Retry |
| 504 | Timeout | Retry |

### Handler Example (Pseudocode)

```
POST /webhooks/chat handler:

  // 1. Verify signature
  signature = headers['X-Webhook-Signature']
  if not verifySignature(body, signature, WEBHOOK_SECRET):
    return 401 Unauthorized

  // 2. Parse event
  event = JSON.parse(body)

  // 3. Check idempotency
  if redis.exists('webhook:processed:' + event.id):
    return 200 OK  // Already processed

  // 4. Handle by event type
  switch event.type:
    case 'message.created':
      // Send push notification to offline participants
      // Update analytics
      break

    case 'user.online':
      // Update user status in main database
      break

    case 'user.offline':
      // Update user status
      // Record last seen
      break

    case 'reaction.added':
      // Update engagement metrics
      break

    // ... other events

  // 5. Mark as processed
  redis.set('webhook:processed:' + event.id, '1', 'EX', 86400)

  return 200 OK
```

---

## Step 7.13: Testing

### Unit Tests

#### Test 1: Signature generation
**Action:** Generate signature for known payload and secret
**Expected:** Signature matches expected value

#### Test 2: Signature verification (valid)
**Action:** Verify valid signature
**Expected:** Returns true

#### Test 3: Signature verification (invalid)
**Action:** Verify tampered signature
**Expected:** Returns false

#### Test 4: Event payload creation
**Action:** Call emitMessageCreated with message object
**Expected:** Correct payload structure generated

### Integration Tests

#### Test 5: Successful delivery
**Setup:** Mock HTTP endpoint returning 200
**Action:** Emit event
**Expected:**
- HTTP request made with correct headers
- Signature present and valid
- Service logs success

#### Test 6: Retry on 5xx
**Setup:** Mock endpoint returning 503, then 200
**Action:** Emit event
**Expected:**
- First attempt fails
- Retry after backoff
- Second attempt succeeds
- Total 2 requests made

#### Test 7: No retry on 4xx
**Setup:** Mock endpoint returning 400
**Action:** Emit event
**Expected:**
- Single request made
- No retry
- Failure logged

#### Test 8: Max retries exhausted
**Setup:** Mock endpoint always returning 500
**Action:** Emit event
**Expected:**
- 3 attempts made (or configured max)
- Final failure logged
- No more retries

#### Test 9: Network timeout
**Setup:** Mock endpoint with 10s delay, timeout set to 5s
**Action:** Emit event
**Expected:**
- Request times out
- Retry initiated

#### Test 10: Webhooks disabled
**Setup:** WEBHOOK_ENABLED=false
**Action:** Emit event
**Expected:**
- No HTTP request made
- No errors

### End-to-End Tests

#### Test 11: Message creation triggers webhook
**Action:** Send message via REST API
**Expected:**
- Message created
- Webhook received by host with correct payload

#### Test 12: User online triggers webhook
**Action:** Connect WebSocket
**Expected:**
- Connection established
- Host receives user.online webhook

#### Test 13: Reaction triggers webhook
**Action:** Add reaction to message
**Expected:**
- Reaction added
- Host receives reaction.added webhook

#### Test 14: Idempotency on host side
**Setup:** Force retry (simulate network issue)
**Action:** Same event delivered twice
**Expected:**
- Host processes only once
- Second delivery acknowledged but skipped

---

## WebSocket Events vs Webhooks

**Clarification:** Both exist for different purposes.

| Aspect | WebSocket Events | Webhooks |
|--------|-----------------|----------|
| Recipient | Connected clients | Host server |
| Purpose | Real-time UI updates | Server-side processing |
| Delivery | Instant to online users | HTTP POST to endpoint |
| Offline handling | Missed (sync on reconnect) | Retried until delivered |
| Use cases | Show new message, typing | Push notifications, analytics |

**Both should be triggered** for the same action. Example:
1. User sends message
2. WebSocket: Broadcast to conversation room (real-time UI)
3. Webhook: Send to host (push notification to offline users)

---

## API Endpoints Summary (Phase 7)

```
# Admin (Optional)
GET  /api/admin/webhooks/config    [InternalApiGuard] — Get webhook config
PUT  /api/admin/webhooks/config    [InternalApiGuard] — Update webhook config
POST /api/admin/webhooks/test      [InternalApiGuard] — Test webhook delivery
```

---

## Environment Variables

```
# Webhook Configuration
WEBHOOK_URL=http://master-service:3000/webhooks/chat
WEBHOOK_SECRET=your-secure-webhook-secret
WEBHOOK_ENABLED=true
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_RETRY_ATTEMPTS=3

# Optional: Filter events (comma-separated)
WEBHOOK_EVENTS=message.created,message.deleted,user.online,user.offline
```

---

## Phase 7 Checklist

| # | Task | Status |
|---|------|--------|
| 7.1 | Define webhook enums | ☐ |
| 7.2 | Define webhook interfaces | ☐ |
| 7.3 | Define event payloads | ☐ |
| 7.4 | Implement signature utility | ☐ |
| 7.5 | Implement WebhooksService | ☐ |
| 7.6 | Integrate with MessagesService | ☐ |
| 7.7 | Integrate with ConversationsService | ☐ |
| 7.8 | Integrate with ReactionsService | ☐ |
| 7.9 | Integrate with Presence/Gateway | ☐ |
| 7.10 | Add logging | ☐ |
| 7.11 | Register module | ☐ |
| 7.12 | Document host-side implementation | ☐ |
| 7.13 | Test all functionality | ☐ |

---

## Common Issues & Solutions

### Issue: Webhooks slowing down API responses
**Solution:** Use fire-and-forget async delivery, don't await webhook completion

### Issue: Host not receiving webhooks
**Solution:** Check WEBHOOK_URL is correct, network allows connection, verify enabled

### Issue: Signature verification failing on host
**Solution:** Ensure same secret on both sides, use raw body for verification (not parsed JSON)

### Issue: Duplicate events processed
**Solution:** Implement idempotency on host side using event ID

### Issue: Too many retries overwhelming host
**Solution:** Implement circuit breaker pattern, increase backoff delays

### Issue: Sensitive data in webhook payloads
**Solution:** Only include necessary fields, truncate content for previews

---

## Security Considerations

- **Always use HTTPS** in production
- **Rotate secrets** periodically
- **Validate event types** on host side (ignore unknown)
- **Rate limit** webhook endpoint on host
- **Log all received webhooks** for audit trail
- **Don't expose full message content** in payloads if not needed

---

Ready for Phase 8 (Documentation & Packaging)?