# Chat Service Communication Architecture

## Overview

This document describes the hybrid communication pattern between the **Frontend**, **Master Service** (host application), and **Chat Service** (microservice).

The hybrid approach balances performance and control:

- **WebSocket**: Direct connection from frontend to chat service (lowest latency for real-time)
- **REST API**: Routed through master service (enables business logic, validation, enrichment)
- **Internal API**: Server-to-server communication between master and chat service

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│    ┌──────────────┐              ┌──────────────┐                  │
│    │              │   WebSocket  │              │                  │
│    │   Frontend   │═════════════▶│ Chat Service │                  │
│    │              │   (direct)   │              │                  │
│    └──────┬───────┘              └──────▲───────┘                  │
│           │                             │                          │
│           │ REST API                    │ Internal API             │
│           │ (all chat operations)       │ (user sync, admin ops)   │
│           ▼                             │                          │
│    ┌──────────────┐                     │                          │
│    │    Master    │─────────────────────┘                          │
│    │   Service    │                                                │
│    └──────────────┘                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Communication Paths

### Path 1: WebSocket (Frontend → Chat Service)

**Purpose**: Real-time bidirectional communication

**Connection**: Direct from frontend to chat service

**Why Direct?**
- Lowest possible latency for real-time messages
- Avoids WebSocket proxy complexity
- Native reconnection handling without middleware interference
- Reduces load on master service

#### Events: Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `message:send` | `{ conversationId, content, attachments? }` | Send a message |
| `message:edit` | `{ messageId, content }` | Edit a message |
| `message:delete` | `{ messageId }` | Delete a message |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `presence:ping` | `{}` | Heartbeat to maintain online status |

#### Events: Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:new` | `{ message object }` | New message received |
| `message:updated` | `{ messageId, content, updatedAt }` | Message was edited |
| `message:deleted` | `{ messageId }` | Message was deleted |
| `reaction:added` | `{ messageId, emoji, userId }` | Reaction added |
| `reaction:removed` | `{ messageId, emoji, userId }` | Reaction removed |
| `message:read` | `{ messageId, userId, readAt }` | Message marked as read |
| `user:typing` | `{ conversationId, userId, isTyping }` | Typing indicator |
| `user:online` | `{ userId }` | User came online |
| `user:offline` | `{ userId }` | User went offline |
| `error` | `{ code, message }` | Error occurred |

#### Connection Example

```javascript
import { io } from 'socket.io-client';

const socket = io('wss://chat.example.com', {
  auth: {
    token: 'jwt_token_from_master_service'
  },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

socket.on('connect', () => {
  console.log('Connected to chat service');
});

socket.on('message:new', (message) => {
  // Handle new message
});

socket.on('connect_error', (error) => {
  if (error.message === 'unauthorized') {
    // Refresh token and reconnect
  }
});
```

---

### Path 2: REST API (Frontend → Master → Chat Service)

**Purpose**: CRUD operations for conversations and messages

**Flow**: Frontend calls master service, master proxies to chat service

**Why Through Master?**
- Master can enforce business rules (e.g., "can user A message user B?")
- Master can enrich responses with data from its own database
- Centralized rate limiting and logging
- Single API endpoint for frontend simplicity
- Master can transform requests/responses as needed

#### Endpoints

All endpoints are exposed by **Master Service** and proxied to Chat Service.

##### Conversations

| Method | Master Endpoint | Chat Endpoint | Description |
|--------|-----------------|---------------|-------------|
| `POST` | `/api/conversations` | `/api/conversations` | Create conversation |
| `GET` | `/api/conversations` | `/api/conversations` | List user's conversations |
| `GET` | `/api/conversations/:id` | `/api/conversations/:id` | Get conversation details |
| `DELETE` | `/api/conversations/:id` | `/api/conversations/:id` | Leave/delete conversation |
| `POST` | `/api/conversations/:id/participants` | `/api/conversations/:id/participants` | Add participant |
| `DELETE` | `/api/conversations/:id/participants/:userId` | `/api/conversations/:id/participants/:userId` | Remove participant |
| `GET` | `/api/conversations/:id/presence` | `/api/conversations/:id/presence` | Get online participants |

##### Messages

| Method | Master Endpoint | Chat Endpoint | Description |
|--------|-----------------|---------------|-------------|
| `GET` | `/api/conversations/:id/messages` | `/api/conversations/:id/messages` | Get message history |
| `POST` | `/api/conversations/:id/messages` | `/api/conversations/:id/messages` | Send message |
| `PATCH` | `/api/messages/:id` | `/api/messages/:id` | Edit message |
| `DELETE` | `/api/messages/:id` | `/api/messages/:id` | Delete message |

##### Reactions & Read Receipts

| Method | Master Endpoint | Chat Endpoint | Description |
|--------|-----------------|---------------|-------------|
| `POST` | `/api/messages/:id/reactions` | `/api/messages/:id/reactions` | Add reaction |
| `DELETE` | `/api/messages/:id/reactions/:emoji` | `/api/messages/:id/reactions/:emoji` | Remove reaction |
| `PUT` | `/api/messages/:id/read` | `/api/messages/:id/read` | Mark message as read |
| `PUT` | `/api/conversations/:id/read` | `/api/conversations/:id/read` | Mark all as read |

#### Proxy Implementation Example (Master Service)

```javascript
// Master Service - Express example
const express = require('express');
const axios = require('axios');
const router = express.Router();

const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL; // http://chat-service:4000

// Proxy middleware for chat endpoints
const chatProxy = async (req, res, next) => {
  try {
    // Optional: Add business logic before proxying
    // e.g., check if user can access this conversation
    
    const response = await axios({
      method: req.method,
      url: `${CHAT_SERVICE_URL}${req.originalUrl.replace('/api', '/api')}`,
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json',
      },
      data: req.body,
      params: req.query,
    });

    // Optional: Enrich response with master's data
    // e.g., add full user profiles from master's database

    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      next(error);
    }
  }
};

// Apply proxy to chat routes
router.use('/conversations', chatProxy);
router.use('/messages', chatProxy);

module.exports = router;
```

#### Request Example (Frontend)

```javascript
// Frontend - using single master API endpoint
const api = axios.create({
  baseURL: 'https://api.example.com', // Master service
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Create conversation
const conversation = await api.post('/api/conversations', {
  type: 'direct',
  participantIds: ['user_123', 'user_456']
});

// Send message
const message = await api.post(`/api/conversations/${conversationId}/messages`, {
  content: 'Hello!',
  attachments: [{ externalFileId: 'file_789', label: 'document.pdf' }]
});

// Get message history with pagination
const messages = await api.get(`/api/conversations/${conversationId}/messages`, {
  params: { limit: 50, before: 'cursor_abc' }
});
```

---

### Path 3: Internal API (Master → Chat Service)

**Purpose**: Server-to-server operations not exposed to frontend

**Connection**: Internal network only (not publicly accessible)

#### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/users/sync` | Sync user profile from master |
| `GET` | `/api/users/:externalUserId` | Get cached user profile |
| `DELETE` | `/api/users/:externalUserId` | Remove user profile |
| `POST` | `/api/users/sync/batch` | Batch sync multiple users |
| `GET` | `/api/admin/conversations` | Admin: list all conversations |
| `DELETE` | `/api/admin/conversations/:id` | Admin: force delete conversation |
| `GET` | `/api/admin/stats` | Admin: usage statistics |

#### User Sync Flow

```
┌──────────────┐                              ┌──────────────┐
│    Master    │                              │ Chat Service │
│   Service    │                              │              │
└──────┬───────┘                              └──────▲───────┘
       │                                             │
       │  1. User registers or updates profile       │
       │─────────────────────────────────────────────▶
       │     POST /api/users/sync                    │
       │     {                                       │
       │       externalUserId: "user_123",           │
       │       displayName: "John Doe",              │
       │       avatarUrl: "https://..."              │
       │     }                                       │
       │                                             │
       │  2. Chat service caches profile             │
       │◀─────────────────────────────────────────────
       │     { success: true }                       │
       │                                             │
       │  3. User deletes account                    │
       │─────────────────────────────────────────────▶
       │     DELETE /api/users/user_123              │
       │                                             │
```

#### Sync Implementation Example (Master Service)

```javascript
// Master Service - sync user to chat service
const syncUserToChat = async (user) => {
  try {
    await axios.post(`${CHAT_SERVICE_URL}/api/users/sync`, {
      externalUserId: user.id,
      displayName: user.name,
      avatarUrl: user.avatar,
      metadata: {
        role: user.role,
        department: user.department
      }
    }, {
      headers: {
        'X-Internal-Secret': process.env.INTERNAL_API_SECRET
      }
    });
  } catch (error) {
    console.error('Failed to sync user to chat service', error);
    // Handle error - retry queue, alert, etc.
  }
};

// Call on user registration
app.post('/api/auth/register', async (req, res) => {
  const user = await createUser(req.body);
  await syncUserToChat(user);
  res.json(user);
});

// Call on profile update
app.patch('/api/users/:id', async (req, res) => {
  const user = await updateUser(req.params.id, req.body);
  await syncUserToChat(user);
  res.json(user);
});
```

---

### Path 4: Webhooks (Chat Service → Master)

**Purpose**: Notify master service of chat events for business logic

**Direction**: Chat service pushes events to master

#### Webhook Events

| Event | Trigger | Use Case |
|-------|---------|----------|
| `message.created` | New message sent | Update notifications, analytics |
| `message.deleted` | Message deleted | Audit logging |
| `conversation.created` | New conversation | Analytics, onboarding flows |
| `reaction.added` | Reaction added | Engagement metrics |
| `user.online` | User connected | Update user status in master |
| `user.offline` | User disconnected | Update user status in master |

#### Webhook Payload Format

```json
{
  "event": "message.created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "signature": "sha256=abc123...",
  "data": {
    "messageId": "msg_abc123",
    "conversationId": "conv_xyz789",
    "senderId": "user_123",
    "content": "Hello!",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Webhook Handler Example (Master Service)

```javascript
const crypto = require('crypto');

// Verify webhook signature
const verifyWebhookSignature = (payload, signature, secret) => {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

app.post('/webhooks/chat', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  
  if (!verifyWebhookSignature(req.body, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, data } = req.body;

  switch (event) {
    case 'message.created':
      // Send push notification to offline participants
      notifyOfflineUsers(data);
      break;
    case 'user.online':
      // Update user's online status in master DB
      updateUserStatus(data.userId, 'online');
      break;
    case 'user.offline':
      updateUserStatus(data.userId, 'offline');
      break;
  }

  res.json({ received: true });
});
```

---

## Authentication

### Shared JWT Strategy

Both master service and chat service validate the same JWT token. This enables:

- Single login flow (user authenticates with master)
- Token works for both REST (via master) and WebSocket (direct to chat)
- No additional authentication step for chat service

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Frontend   │         │    Master    │         │ Chat Service │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │  1. Login              │                        │
       │───────────────────────▶│                        │
       │                        │                        │
       │  2. JWT (signed with   │                        │
       │     SHARED_SECRET)     │                        │
       │◀───────────────────────│                        │
       │                        │                        │
       │  3. REST API call      │                        │
       │───────────────────────▶│                        │
       │                        │  4. Proxy with JWT     │
       │                        │───────────────────────▶│
       │                        │                        │ Validates JWT
       │                        │                        │ with same secret
       │                        │◀───────────────────────│
       │◀───────────────────────│                        │
       │                        │                        │
       │  5. WebSocket connect with JWT                  │
       │────────────────────────────────────────────────▶│
       │                                                 │ Validates JWT
       │◀────────────────────────────────────────────────│
       │                                                 │
```

### JWT Payload Structure

```json
{
  "sub": "user_123",
  "externalUserId": "user_123",
  "email": "user@example.com",
  "permissions": ["chat:read", "chat:write"],
  "iat": 1705312200,
  "exp": 1705398600,
  "iss": "master-service"
}
```

### Configuration

**Master Service:**
```env
JWT_SECRET=your-shared-secret-key
JWT_ISSUER=master-service
JWT_EXPIRES_IN=24h
```

**Chat Service:**
```env
AUTH_JWT_SECRET=your-shared-secret-key    # Same secret
AUTH_JWT_ISSUER=master-service            # Same issuer
```

### Internal API Authentication

For server-to-server calls (user sync, admin operations), use a separate internal secret:

```env
# Master Service
INTERNAL_API_SECRET=internal-secret-key

# Chat Service
INTERNAL_API_SECRET=internal-secret-key   # Same secret
```

```javascript
// Master calling chat service internal API
axios.post(`${CHAT_SERVICE_URL}/api/users/sync`, data, {
  headers: {
    'X-Internal-Secret': process.env.INTERNAL_API_SECRET
  }
});
```

---

## Network Configuration

### Development (Docker Compose)

```yaml
services:
  master-service:
    ports:
      - "3000:3000"
    environment:
      - CHAT_SERVICE_URL=http://chat-service:4000
      - JWT_SECRET=${JWT_SECRET}
    networks:
      - app-network

  chat-service:
    ports:
      - "4000:4000"   # REST API (internal, proxied by master)
      - "4001:4001"   # WebSocket (public, direct access)
    environment:
      - AUTH_JWT_SECRET=${JWT_SECRET}
      - WEBHOOK_URL=http://master-service:3000/webhooks/chat
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

### Production

```
                    ┌─────────────────────────────────────┐
                    │           Load Balancer             │
                    │  api.example.com  chat.example.com  │
                    └─────────┬───────────────┬───────────┘
                              │               │
                    ┌─────────▼─────┐   ┌─────▼─────────┐
                    │    Master     │   │ Chat Service  │
                    │   Service     │   │  (WebSocket)  │
                    │  (internal)   │   │   (public)    │
                    └───────────────┘   └───────────────┘
                              │               │
                              └───────┬───────┘
                                      │
                              ┌───────▼───────┐
                              │   Internal    │
                              │   Network     │
                              └───────────────┘
```

**DNS / Endpoints:**
- `api.example.com` → Master Service (REST API)
- `chat.example.com` → Chat Service (WebSocket only)

**Firewall Rules:**
- Chat Service port 4000 (REST): Internal only, accessible by master
- Chat Service port 4001 (WebSocket): Public, accessible by frontend
- Master Service port 3000: Public

---

## CORS Configuration

### Chat Service

```typescript
// main.ts
const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: [
    'https://example.com',
    'https://app.example.com',
    process.env.ALLOWED_ORIGINS?.split(',')
  ].flat().filter(Boolean),
  credentials: true,
});

// WebSocket Gateway
@WebSocketGateway(4001, {
  cors: {
    origin: [
      'https://example.com',
      'https://app.example.com',
    ],
    credentials: true,
  },
})
export class ChatGateway {}
```

### Master Service

```typescript
app.enableCors({
  origin: [
    'https://example.com',
    'https://app.example.com',
  ],
  credentials: true,
});
```

---

## Error Handling

### REST API Errors (via Master)

Master service should handle chat service errors gracefully:

```javascript
const chatProxy = async (req, res, next) => {
  try {
    const response = await axios({ ... });
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      // Chat service returned an error
      res.status(error.response.status).json({
        error: error.response.data.message || 'Chat service error',
        code: error.response.data.code,
      });
    } else if (error.code === 'ECONNREFUSED') {
      // Chat service is down
      res.status(503).json({
        error: 'Chat service unavailable',
        code: 'CHAT_SERVICE_UNAVAILABLE',
      });
    } else {
      next(error);
    }
  }
};
```

### WebSocket Errors

```javascript
// Client-side error handling
socket.on('error', (error) => {
  switch (error.code) {
    case 'UNAUTHORIZED':
      // Refresh token and reconnect
      break;
    case 'FORBIDDEN':
      // User doesn't have access to this conversation
      break;
    case 'RATE_LIMITED':
      // Too many messages, back off
      break;
    default:
      console.error('WebSocket error:', error);
  }
});

socket.on('connect_error', (error) => {
  if (error.message === 'unauthorized') {
    // Token expired or invalid
    refreshTokenAndReconnect();
  }
});
```

---

## Summary

| Path | Source | Destination | Transport | Auth | Purpose |
|------|--------|-------------|-----------|------|---------|
| WebSocket | Frontend | Chat Service | WSS (direct) | JWT | Real-time events |
| REST API | Frontend | Master → Chat | HTTPS (proxied) | JWT | CRUD operations |
| Internal API | Master | Chat Service | HTTP (internal) | Internal Secret | User sync, admin |
| Webhooks | Chat Service | Master | HTTP (internal) | HMAC Signature | Event notifications |

---

## Checklist for Integration

### Master Service Setup

- [ ] Configure `CHAT_SERVICE_URL` environment variable
- [ ] Configure `JWT_SECRET` (shared with chat service)
- [ ] Configure `INTERNAL_API_SECRET` (shared with chat service)
- [ ] Implement chat proxy routes (`/api/conversations/*`, `/api/messages/*`)
- [ ] Implement webhook handler (`/webhooks/chat`)
- [ ] Implement user sync on registration and profile update
- [ ] Add error handling for chat service unavailability

### Chat Service Setup

- [ ] Configure `AUTH_JWT_SECRET` (same as master's `JWT_SECRET`)
- [ ] Configure `INTERNAL_API_SECRET` (same as master's)
- [ ] Configure `WEBHOOK_URL` pointing to master service
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Expose WebSocket port (4001) publicly
- [ ] Keep REST port (4000) internal only

### Frontend Setup

- [ ] Configure REST API base URL (master service)
- [ ] Configure WebSocket URL (chat service direct)
- [ ] Implement token refresh logic for WebSocket reconnection
- [ ] Handle WebSocket disconnection gracefully