Let's build this. Here's a structured plan broken into phases with clear deliverables.

---

## Project Overview

**Name:** `chat-service` (or you can name it)
**Stack:** NestJS + MongoDB + Redis + Socket.IO
**Timeline:** 4-5 weeks to production-ready MVP

---

## Phase 0: Project Setup & Infrastructure (Days 1-2)

**Goal:** Solid foundation — anyone can clone, run `docker-compose up`, and have a working environment.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 0.1 | Initialize NestJS project with TypeScript strict mode | Project scaffold |
| 0.2 | Set up Docker Compose (chat-service + MongoDB + Redis) | `docker-compose.yml` |
| 0.3 | Configure environment & typed config module | `config/` with validation |
| 0.4 | Set up MongoDB connection with Mongoose | Database connected |
| 0.5 | Set up Redis connection | Redis connected |
| 0.6 | Add health check endpoint | `GET /health` |
| 0.7 | Set up logging (structured JSON logs) | Logger configured |
| 0.8 | Add ESLint + Prettier + Husky pre-commit | Code quality enforced |

**Milestone:** `docker-compose up` → service starts → `GET /health` returns OK

---

## Phase 1: Authentication & User Sync (Days 3-5)

**Goal:** Establish the integration pattern with host systems. This is the foundation everything else depends on.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 1.1 | Create Auth module with JWT strategy | JWT validation working |
| 1.2 | Create Auth Guard (reusable for REST + WS) | `@UseGuards(AuthGuard)` |
| 1.3 | Create Users module | Module scaffold |
| 1.4 | Create UserProfile schema (cached external users) | MongoDB schema |
| 1.5 | `POST /users/sync` — upsert user profile | Endpoint working |
| 1.6 | `GET /users/:externalUserId` — get cached profile | Endpoint working |
| 1.7 | `DELETE /users/:externalUserId` — remove user | Endpoint working |
| 1.8 | Add request validation with class-validator | DTOs validated |

**Milestone:** Host system can sync users, chat service validates JWTs signed by host

**API at this point:**
```
POST   /api/users/sync          — sync user from host
GET    /api/users/:id           — get user profile
DELETE /api/users/:id           — remove user
GET    /health                  — health check
```

---

## Phase 2: Conversations (Days 6-9)

**Goal:** Users can create and manage direct and group conversations.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 2.1 | Create Conversations module | Module scaffold |
| 2.2 | Create Conversation schema | MongoDB schema |
| 2.3 | `POST /conversations` — create direct or group | Endpoint working |
| 2.4 | `GET /conversations` — list user's conversations | Endpoint with pagination |
| 2.5 | `GET /conversations/:id` — get single conversation | Endpoint working |
| 2.6 | `POST /conversations/:id/participants` — add participant | Endpoint working |
| 2.7 | `DELETE /conversations/:id/participants/:userId` — remove participant | Endpoint working |
| 2.8 | `DELETE /conversations/:id` — delete/leave conversation | Endpoint working |
| 2.9 | Add participant role management (admin/member) | Roles enforced |
| 2.10 | Get or create direct conversation (no duplicates) | Logic implemented |

**Milestone:** Full conversation CRUD, duplicate direct chats prevented

**API at this point:**
```
POST   /api/conversations                           — create conversation
GET    /api/conversations                           — list my conversations
GET    /api/conversations/:id                       — get conversation
DELETE /api/conversations/:id                       — leave/delete conversation
POST   /api/conversations/:id/participants          — add participant
DELETE /api/conversations/:id/participants/:userId  — remove participant
```

---

## Phase 3: Messages (Days 10-14)

**Goal:** Core messaging functionality — send, receive, edit, delete, with attachments.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 3.1 | Create Messages module | Module scaffold |
| 3.2 | Create Message schema (with embedded attachments) | MongoDB schema |
| 3.3 | `POST /conversations/:id/messages` — send message | Endpoint working |
| 3.4 | `GET /conversations/:id/messages` — get history | Cursor-based pagination |
| 3.5 | `PATCH /messages/:id` — edit message | Endpoint working |
| 3.6 | `DELETE /messages/:id` — soft delete | Endpoint working |
| 3.7 | Attachments as external references | `attachments: [{ externalFileId, label }]` |
| 3.8 | Update conversation's `lastMessage` on send | Denormalization working |
| 3.9 | Reply/thread support (optional parent reference) | `replyTo` field |
| 3.10 | Message permissions (only sender can edit/delete) | Guards implemented |

**Milestone:** Full message CRUD with pagination and attachments

**API at this point:**
```
POST   /api/conversations/:id/messages   — send message
GET    /api/conversations/:id/messages   — get message history (paginated)
PATCH  /api/messages/:id                 — edit message
DELETE /api/messages/:id                 — delete message
```

---

## Phase 4: WebSocket Gateway (Days 15-19)

**Goal:** Real-time message delivery. This is where it becomes a true chat service.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 4.1 | Create Gateway module with Socket.IO | Gateway scaffold |
| 4.2 | WebSocket authentication (same JWT as REST) | Auth handshake working |
| 4.3 | Connection management — track connected users in Redis | Connection registry |
| 4.4 | Auto-join user to their conversation rooms on connect | Room management |
| 4.5 | Emit `message:new` when message created (via REST or WS) | Real-time delivery |
| 4.6 | `message:send` event — send message via WebSocket | WS message sending |
| 4.7 | `message:edit` event | WS message editing |
| 4.8 | `message:delete` event | WS message deletion |
| 4.9 | Handle disconnection & cleanup | Graceful disconnect |
| 4.10 | Multi-instance support via Redis Pub/Sub adapter | Horizontal scaling ready |

**Milestone:** Messages sent via REST or WebSocket are delivered in real-time to all participants

**WebSocket events:**
```
Client → Server:
  message:send      { conversationId, content, attachments? }
  message:edit      { messageId, content }
  message:delete    { messageId }

Server → Client:
  message:new       { full message object }
  message:updated   { messageId, content, updatedAt }
  message:deleted   { messageId }
```

---

## Phase 5: Reactions & Read Receipts (Days 20-23)

**Goal:** MVP features — reactions and read status.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 5.1 | Add reactions to Message schema (embedded array) | Schema updated |
| 5.2 | `POST /messages/:id/reactions` — add reaction | Endpoint working |
| 5.3 | `DELETE /messages/:id/reactions/:emoji` — remove reaction | Endpoint working |
| 5.4 | Emit `reaction:added` / `reaction:removed` via WebSocket | Real-time reactions |
| 5.5 | Add readBy to Message schema (embedded array) | Schema updated |
| 5.6 | `PUT /messages/:id/read` — mark message as read | Endpoint working |
| 5.7 | `PUT /conversations/:id/read` — mark all as read | Bulk read |
| 5.8 | Emit `message:read` via WebSocket | Real-time receipts |
| 5.9 | Unread count per conversation | Computed on list query |

**Milestone:** Users can react to messages and see who has read what

**API additions:**
```
POST   /api/messages/:id/reactions        — add reaction
DELETE /api/messages/:id/reactions/:emoji — remove reaction
PUT    /api/messages/:id/read             — mark as read
PUT    /api/conversations/:id/read        — mark all as read
```

---

## Phase 6: Typing Indicators & Presence (Days 24-26)

**Goal:** Show who's online and who's typing.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 6.1 | Create Presence module (Redis-backed) | Module scaffold |
| 6.2 | Track online status on connect/disconnect | Online users tracked |
| 6.3 | `user:online` / `user:offline` events | Real-time presence |
| 6.4 | `GET /conversations/:id/presence` — who's online in conversation | Endpoint working |
| 6.5 | `typing:start` / `typing:stop` events (client → server) | Typing tracked |
| 6.6 | Broadcast typing status to conversation participants | Real-time typing |
| 6.7 | Auto-expire typing after 5 seconds (Redis TTL) | Cleanup handled |

**Milestone:** Users see who's online and who's typing

**WebSocket events:**
```
Client → Server:
  typing:start      { conversationId }
  typing:stop       { conversationId }

Server → Client:
  user:online       { externalUserId }
  user:offline      { externalUserId }
  user:typing       { conversationId, externalUserId, isTyping }
```

---

## Phase 7: Webhooks & Events (Days 27-28)

**Goal:** Host system can receive events from the chat service.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 7.1 | Create Webhooks module | Module scaffold |
| 7.2 | Webhook configuration (URL + secret in config) | Config added |
| 7.3 | Event queue (in-memory or Redis) | Queue implemented |
| 7.4 | Webhook delivery with retry logic | Retry on failure |
| 7.5 | Sign webhook payloads (HMAC) | Security implemented |
| 7.6 | Events: `message.created`, `message.deleted`, `reaction.added`, etc. | Events emitted |

**Milestone:** Host system receives webhooks for chat events

**Webhook payload example:**
```json
{
  "event": "message.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "messageId": "...",
    "conversationId": "...",
    "senderId": "usr_42",
    "content": "Hello!"
  }
}
```

---

## Phase 8: Documentation & Packaging (Days 29-31)

**Goal:** Make it easy for teams to integrate.

**Tasks:**

| # | Task | Deliverable |
|---|---|---|
| 8.1 | OpenAPI/Swagger documentation | Auto-generated API docs |
| 8.2 | WebSocket events documentation | Events reference |
| 8.3 | Integration guide (README) | Step-by-step guide |
| 8.4 | Docker image optimization (multi-stage build) | Smaller image |
| 8.5 | Environment variables reference | Config documentation |
| 8.6 | Example docker-compose for host projects | Example file |
| 8.7 | Postman/Insomnia collection | API collection |

**Milestone:** Any team can integrate in under an hour

---

## Final Architecture

```
chat-service/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── README.md                      # Integration guide
├── docs/
│   ├── api.md                     # REST API reference
│   ├── websocket.md               # WebSocket events
│   └── webhooks.md                # Webhook events
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── config.module.ts
│   │   ├── configuration.ts
│   │   └── validation.schema.ts
│   ├── common/
│   │   ├── decorators/
│   │   │   └── current-user.decorator.ts
│   │   ├── guards/
│   │   │   └── auth.guard.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── interceptors/
│   │   └── interfaces/
│   │       └── authenticated-user.interface.ts
│   ├── health/
│   │   └── health.controller.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   └── strategies/
│   │       └── jwt.strategy.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── dto/
│   │   │   └── sync-user.dto.ts
│   │   └── schemas/
│   │       └── user-profile.schema.ts
│   ├── conversations/
│   │   ├── conversations.module.ts
│   │   ├── conversations.controller.ts
│   │   ├── conversations.service.ts
│   │   ├── dto/
│   │   │   ├── create-conversation.dto.ts
│   │   │   └── add-participant.dto.ts
│   │   └── schemas/
│   │       └── conversation.schema.ts
│   ├── messages/
│   │   ├── messages.module.ts
│   │   ├── messages.controller.ts
│   │   ├── messages.service.ts
│   │   ├── dto/
│   │   │   ├── send-message.dto.ts
│   │   │   └── edit-message.dto.ts
│   │   └── schemas/
│   │       └── message.schema.ts
│   ├── reactions/
│   │   ├── reactions.module.ts
│   │   ├── reactions.controller.ts
│   │   └── reactions.service.ts
│   ├── gateway/
│   │   ├── gateway.module.ts
│   │   ├── chat.gateway.ts
│   │   ├── ws-auth.guard.ts
│   │   └── dto/
│   │       └── ws-message.dto.ts
│   ├── presence/
│   │   ├── presence.module.ts
│   │   └── presence.service.ts
│   └── webhooks/
│       ├── webhooks.module.ts
│       ├── webhooks.service.ts
│       └── events/
│           └── chat-events.enum.ts
└── test/
    ├── app.e2e-spec.ts
    └── jest-e2e.json
```

---

## Timeline Summary

| Phase | Duration | Deliverable |
|---|---|---|
| Phase 0: Setup | Days 1-2 | Project foundation, Docker, config |
| Phase 1: Auth & Users | Days 3-5 | JWT validation, user sync |
| Phase 2: Conversations | Days 6-9 | Conversation CRUD |
| Phase 3: Messages | Days 10-14 | Message CRUD, attachments |
| Phase 4: WebSocket | Days 15-19 | Real-time delivery |
| Phase 5: Reactions & Receipts | Days 20-23 | Reactions, read status |
| Phase 6: Presence & Typing | Days 24-26 | Online status, typing indicators |
| Phase 7: Webhooks | Days 27-28 | Event notifications to host |
| Phase 8: Documentation | Days 29-31 | Docs, packaging |

---

## Let's Start: Phase 0

Ready to begin? I'll create:

1. NestJS project scaffold with the full module structure
2. `docker-compose.yml` with MongoDB + Redis
3. Config module with validation
4. Health check endpoint
5. Base README

Should I generate the Phase 0 code now?