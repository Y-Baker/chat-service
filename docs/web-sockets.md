# Phase 4: WebSocket Gateway Implementation Guide

## Overview

This phase transforms the chat service into a real-time messaging system. It's the most critical component — everything converges here.

**Dependencies:**
- Phase 1 (Auth) — JWT validation
- Phase 2 (Conversations) — Room membership
- Phase 3 (Messages) — Message CRUD

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  socket.connect() ──▶ auth ──▶ join rooms ──▶ listen/emit       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WSS (port 4001)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Chat Service Instance(s)                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ChatGateway                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │ handleConn  │  │ handleMsg   │  │ handleDisconnect        │  │   │
│  │  │ ─ auth      │  │ ─ validate  │  │ ─ cleanup               │  │   │
│  │  │ ─ register  │  │ ─ save      │  │ ─ notify                │  │   │
│  │  │ ─ join rooms│  │ ─ broadcast │  │                         │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Redis Adapter (Pub/Sub)                       │   │
│  │         Enables broadcasting across multiple instances           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Redis                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ Connection Map   │  │ Pub/Sub Channels │  │ User Sessions        │  │
│  │ userId → sockets │  │ cross-instance   │  │ socket → metadata    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Connection Flow

```
Client                          Server                           Redis
  │                                │                                │
  │ ─── connect(token) ──────────▶│                                │
  │                                │── verify JWT                   │
  │                                │── registerConnection ─────────▶│
  │                                │── get user conversations       │
  │                                │── join rooms                   │
  │ ◀── connected { userId, ... } │                                │
  │                                │── broadcast user:online ──────▶│ (to rooms)
  │                                │                                │
  │ ─── message:send ────────────▶│                                │
  │                                │── validate participation       │
  │                                │── save message (MongoDB)       │
  │                                │── emit to room ───────────────▶│ (via Redis adapter)
  │ ◀── ack { success, message }  │                                │
  │ ◀── message:new ──────────────│ (all participants)             │
  │                                │                                │
  │ ─── disconnect ──────────────▶│                                │
  │                                │── removeConnection ───────────▶│
  │                                │── broadcast user:offline ─────▶│ (to rooms)
```

---

## Room Strategy

Rooms are Socket.IO's mechanism for grouping connections. Our strategy:

| Room Pattern | Purpose | Example |
|--------------|---------|---------|
| `conversation:{id}` | All participants of a conversation | `conversation:6789abc` |
| `user:{id}` | All connections of a single user | `user:user_123` |

**Why two room types:**
- `conversation:` — For broadcasting messages, typing, reactions to all participants
- `user:` — For direct notifications to a specific user across all their devices

---

## Redis Data Structures

| Key Pattern | Type | Purpose | TTL |
|-------------|------|---------|-----|
| `ws:connections:{userId}` | Set | All socket IDs for a user | None |
| `ws:socket:{socketId}` | Hash | Socket metadata (userId, connectedAt) | 24h |
| `ws:online` | Set | All currently online user IDs | None |

---

## Module Structure

```
src/gateway/
├── gateway.module.ts
├── chat.gateway.ts
├── services/
│   ├── connection.service.ts
│   └── room.service.ts
├── guards/
│   └── ws-auth.guard.ts
├── decorators/
│   └── ws-current-user.decorator.ts
├── dto/
│   ├── ws-send-message.dto.ts
│   ├── ws-edit-message.dto.ts
│   └── ws-delete-message.dto.ts
├── interfaces/
│   ├── authenticated-socket.interface.ts
│   └── socket-user-data.interface.ts
└── filters/
    └── ws-exception.filter.ts
```

---

## Step 4.1: Install Dependencies

**Required packages:**
- `@nestjs/websockets` — NestJS WebSocket support
- `@nestjs/platform-socket.io` — Socket.IO platform adapter
- `socket.io` — Socket.IO server
- `@socket.io/redis-adapter` — Redis adapter for multi-instance
- `redis` — Redis client (if not already installed)

**Dev dependencies:**
- `@types/socket.io` — TypeScript types

---

## Step 4.2: Create Module Structure

Create the folder structure as shown above.

**Files to create:**
1. `gateway.module.ts` — Module definition
2. `chat.gateway.ts` — Main gateway class
3. `services/connection.service.ts` — Redis connection tracking
4. `services/room.service.ts` — Socket.IO room management
5. `guards/ws-auth.guard.ts` — JWT validation for WebSocket
6. `decorators/ws-current-user.decorator.ts` — Extract user from socket
7. `filters/ws-exception.filter.ts` — Error handling
8. `interfaces/authenticated-socket.interface.ts` — Type definitions
9. `dto/ws-send-message.dto.ts` — Message sending validation
10. `dto/ws-edit-message.dto.ts` — Message editing validation
11. `dto/ws-delete-message.dto.ts` — Message deletion validation

---

## Step 4.3: Define Interfaces

### authenticated-socket.interface.ts

**SocketUserData interface:**
- `externalUserId` (string) — User's external ID
- `conversationIds` (string[]) — List of conversation IDs user belongs to
- `connectedAt` (Date) — Connection timestamp

**AuthenticatedSocket interface:**
- Extends Socket from `socket.io`
- Adds `user` property of type `SocketUserData`

---

## Step 4.4: Implement Connection Service

**Purpose:** Track active WebSocket connections in Redis for multi-instance support.

### Methods to implement:

#### registerConnection(socketId, userId)
- Add socket ID to user's connection set: `SADD ws:connections:{userId} {socketId}`
- Store socket metadata as hash: `HSET ws:socket:{socketId} userId {userId} connectedAt {timestamp}`
- Set TTL on socket hash (24h fallback cleanup)
- Add user to online set: `SADD ws:online {userId}`
- Use Redis pipeline for atomicity

#### removeConnection(socketId, userId)
- Remove socket from user's set: `SREM ws:connections:{userId} {socketId}`
- Delete socket metadata: `DEL ws:socket:{socketId}`
- Check remaining connections: `SCARD ws:connections:{userId}`
- If zero connections, remove from online set: `SREM ws:online {userId}`

#### getUserSockets(userId)
- Return all socket IDs for user: `SMEMBERS ws:connections:{userId}`

#### getUsersSockets(userIds[])
- Batch fetch sockets for multiple users
- Use Redis pipeline for efficiency
- Return Map<userId, socketId[]>

#### isUserOnline(userId)
- Check online set: `SISMEMBER ws:online {userId}`
- Return boolean

#### getOnlineUsers(userIds[])
- Check which users from list are online
- Use pipeline to check multiple users
- Return array of online user IDs

#### getConnectionCount(userId)
- Return count of active connections: `SCARD ws:connections:{userId}`

### Implementation notes:
- Implement `OnModuleDestroy` interface for cleanup
- Use try-catch around Redis operations
- Log errors but don't throw (connection tracking is not critical path)

---

## Step 4.5: Implement Room Service

**Purpose:** Manage Socket.IO room memberships.

### Properties:
- `server` (Server) — Socket.IO server instance, set via setter

### Methods to implement:

#### setServer(server)
- Store reference to Socket.IO server
- Called from gateway's `afterInit` hook

#### joinUserRooms(socket)
- Get user ID from socket
- Fetch all conversation IDs for user via ConversationsService
- Build room names: `conversation:{id}` for each
- Join socket to all rooms: `socket.join(roomIds)`
- Join user's personal room: `socket.join(user:{userId})`
- Store conversation IDs in socket.user.conversationIds
- Return list of joined room names

#### joinConversationRoom(socket, conversationId)
- Build room name: `conversation:{conversationId}`
- Join socket to room: `socket.join(roomName)`
- Add to socket's conversation list if not present

#### leaveConversationRoom(socket, conversationId)
- Build room name: `conversation:{conversationId}`
- Leave room: `socket.leave(roomName)`
- Remove from socket's conversation list

#### getConversationRoom(conversationId)
- Return room name string: `conversation:{conversationId}`

#### getUserRoom(userId)
- Return room name string: `user:{userId}`

### Dependency:
- Inject `ConversationsService` for fetching user's conversations

### Add helper to ConversationsService:
- `findAllIdsForUser(userId)` — Return array of conversation ID strings only (not full documents)

---

## Step 4.6: Implement WebSocket Auth Guard

**Purpose:** Validate JWT token during WebSocket handshake.

### Implementation points:

#### canActivate(context)
- Get socket from context: `context.switchToWs().getClient()`
- Extract token using helper method
- If no token, throw WsException with "Missing authentication token"
- Verify token using JwtService with secret from config
- If invalid, throw WsException with "Invalid authentication token"
- Attach user data to socket:
  - `externalUserId` from payload (try `payload.externalUserId` then `payload.sub`)
  - `conversationIds` as empty array (populated later)
  - `connectedAt` as current date
- Return true if valid

#### extractToken(socket) — private helper
- Priority 1: Check `socket.handshake.auth.token`
- Priority 2: Check `socket.handshake.query.token`
- Priority 3: Check `socket.handshake.headers.authorization` (extract Bearer token)
- Return token string or null

### Dependencies:
- Inject `JwtService`
- Inject `ConfigService` for secret

---

## Step 4.7: Implement WsCurrentUser Decorator

**Purpose:** Extract authenticated user from WebSocket context (similar to REST @CurrentUser).

### Implementation points:
- Create parameter decorator using `createParamDecorator`
- Get socket from context: `ctx.switchToWs().getClient()`
- Extract user from socket
- If data parameter provided, return specific property
- Otherwise return full user object

### Usage:
```
@SubscribeMessage('message:send')
async handleMessage(@WsCurrentUser() user: SocketUserData) { ... }

@SubscribeMessage('message:send')
async handleMessage(@WsCurrentUser('externalUserId') userId: string) { ... }
```

---

## Step 4.8: Implement WebSocket Exception Filter

**Purpose:** Consistent error handling for WebSocket events.

### Implementation points:

#### catch(exception, host)
- Get socket from host: `host.switchToWs().getClient()`
- Get event data (for context): `host.switchToWs().getData()`
- Determine error code and message based on exception type:
  - WsException: Extract from `getError()`
  - HttpException: Use status code and message
  - Error: Use message with generic code
  - Unknown: Use default message
- Build error response object:
  - `code` — Error code string
  - `message` — Human-readable message
  - `timestamp` — ISO timestamp
  - `originalEvent` — Event that caused error (if available)
- Emit to client: `socket.emit('error', errorResponse)`

### Error codes to use:
- `UNAUTHORIZED` — Invalid/missing token
- `FORBIDDEN` — Not allowed to perform action
- `NOT_FOUND` — Resource not found
- `VALIDATION_ERROR` — Invalid payload
- `INTERNAL_ERROR` — Unexpected error

---

## Step 4.9: Create WebSocket DTOs

### WsSendMessageDto
- `conversationId` (string, required) — Target conversation
  - Validators: IsString, IsNotEmpty, IsMongoId
- `content` (string, required) — Message text
  - Validators: IsString, IsNotEmpty, MaxLength(5000)
- `attachments` (array, optional) — File references
  - Validators: IsOptional, IsArray, ValidateNested, ArrayMaxSize(10)
  - Item type: WsAttachmentDto
- `replyTo` (string, optional) — Parent message ID
  - Validators: IsOptional, IsMongoId

### WsAttachmentDto (nested)
- `externalFileId` (string, required)
  - Validators: IsString, IsNotEmpty
- `label` (string, optional)
  - Validators: IsOptional, IsString, MaxLength(255)

### WsEditMessageDto
- `messageId` (string, required)
  - Validators: IsString, IsNotEmpty, IsMongoId
- `content` (string, required)
  - Validators: IsString, IsNotEmpty, MaxLength(5000)

### WsDeleteMessageDto
- `messageId` (string, required)
  - Validators: IsString, IsNotEmpty, IsMongoId

---

## Step 4.10: Implement Chat Gateway

This is the main gateway class. Use `@WebSocketGateway` decorator.

### Gateway Configuration
- Port: 4001 (separate from REST API)
- CORS: Read from `ALLOWED_ORIGINS` env variable
- Transports: `['websocket', 'polling']`
- Ping timeout: 60000ms
- Ping interval: 25000ms

### Class-level decorators
- `@WebSocketGateway(4001, { ...options })`
- `@UseFilters(WsExceptionFilter)`
- `@UsePipes(ValidationPipe)` with transform and whitelist

### Properties
- `@WebSocketServer() server` — Socket.IO server instance
- `logger` — NestJS Logger instance

### Dependencies to inject
- JwtService
- ConfigService
- ConnectionService
- RoomService
- MessagesService
- ConversationsService

### Lifecycle Hooks

#### afterInit(server)
- Log "WebSocket Gateway initialized"
- Pass server to RoomService: `this.roomService.setServer(server)`

#### handleConnection(socket)
- Wrap in try-catch
- Authenticate socket using private helper method
- If auth fails:
  - Log warning with socket ID
  - Emit error event with UNAUTHORIZED code
  - Disconnect socket: `socket.disconnect(true)`
  - Return early
- Attach user data to socket
- Register connection in Redis via ConnectionService
- Join user to all conversation rooms via RoomService
- Log successful connection with user ID, socket ID, room count
- Emit 'connected' event to socket with:
  - userId
  - socketId
  - rooms count
  - timestamp
- Broadcast user:online to conversation rooms

#### handleDisconnect(socket)
- Wrap in try-catch
- If socket has no user data, return (never fully authenticated)
- Get user ID from socket
- Remove connection from Redis via ConnectionService
- Check if user still online (has other connections)
- If fully offline, broadcast user:offline to conversation rooms
- Log disconnection with user ID, socket ID, still-online status

### Message Event Handlers

#### @SubscribeMessage('message:send')
**Parameters:** socket (AuthenticatedSocket), dto (WsSendMessageDto)

**DTO fields:** `conversationId`, `content`, `attachments?`, `replyTo?`, `metadata?`

**Steps:**
1. Get user ID from socket
2. Verify user is participant in conversation via ConversationsService
3. If not participant, throw WsException with FORBIDDEN
4. Create message via MessagesService (includes metadata if provided)
5. Get conversation room name
6. Broadcast 'message:new' to room with full message object (includes metadata field)
7. Return acknowledgment: `{ success: true, message }` (message includes metadata)

#### @SubscribeMessage('message:edit')
**Parameters:** socket (AuthenticatedSocket), dto (WsEditMessageDto)

**Steps:**
1. Get user ID from socket
2. Call MessagesService.edit() — it validates ownership
3. Get conversation room from message
4. Broadcast 'message:updated' to room with:
   - messageId
   - content
   - isEdited: true
   - updatedAt
5. Return acknowledgment: `{ success: true, message }`

#### @SubscribeMessage('message:delete')
**Parameters:** socket (AuthenticatedSocket), dto (WsDeleteMessageDto)

**Steps:**
1. Get user ID from socket
2. Fetch message first to get conversation ID
3. If not found, throw WsException with NOT_FOUND
4. Call MessagesService.delete() — it validates ownership
5. Get conversation room
6. Broadcast 'message:deleted' to room with:
   - messageId
   - conversationId
   - deletedAt
7. Return acknowledgment: `{ success: true }`

### Room Management Event Handlers

#### @SubscribeMessage('room:join')
**Parameters:** socket, data: { conversationId }

**Steps:**
1. Get user ID from socket
2. Verify participation via ConversationsService
3. If not participant, throw WsException with FORBIDDEN
4. Call RoomService.joinConversationRoom()
5. Return acknowledgment: `{ success: true, room: conversationId }`

#### @SubscribeMessage('room:leave')
**Parameters:** socket, data: { conversationId }

**Steps:**
1. Call RoomService.leaveConversationRoom()
2. Return acknowledgment: `{ success: true }`

### Sync Event Handler

#### @SubscribeMessage('messages:sync')
**Parameters:** socket, data: { conversationId, lastMessageId }

**Steps:**
1. Get user ID from socket
2. Verify participation
3. Fetch messages after lastMessageId via MessagesService
4. Return: `{ success: true, messages }`

### Health Event Handler

#### @SubscribeMessage('ping')
**Parameters:** socket

**Steps:**
1. Return: `{ event: 'pong', timestamp: Date.now() }`

### Private Helper Methods

#### authenticateSocket(socket)
- Extract token using extractToken helper
- If no token, return null
- Verify token with JwtService
- Return user object or null on error

#### extractToken(socket)
- Same logic as in WsAuthGuard
- Check auth, query, then headers

#### broadcastUserOnline(socket)
- Get user ID from socket
- Loop through socket's conversation IDs
- For each, emit 'user:online' to room (exclude sender)
- Payload: userId, conversationId, timestamp

#### broadcastUserOffline(socket)
- Same as above but emit 'user:offline'

### Public Methods (called from other services)

#### emitToConversation(conversationId, event, data)
- Get room name from RoomService
- Emit to room: `this.server.to(room).emit(event, data)`

#### emitToUser(userId, event, data)
- Get user room name
- Emit to room

#### notifyNewConversation(conversationId, participantIds[])
- Fetch conversation details
- For each participant:
  - Get their socket IDs from ConnectionService
  - For each socket:
    - Get socket instance from server
    - Join socket to new conversation room
    - Emit 'conversation:new' to socket

#### notifyUserAdded(conversationId, userId)
- Fetch conversation details
- Get user's socket IDs
- For each socket:
  - Join to conversation room
  - Emit 'conversation:joined'
- Emit 'participant:added' to conversation room

#### notifyUserRemoved(conversationId, userId)
- Get user's socket IDs
- For each socket:
  - Leave conversation room
  - Emit 'conversation:removed'
- Emit 'participant:removed' to conversation room

---

## Step 4.11: Configure Redis Adapter

**Purpose:** Enable message broadcasting across multiple server instances.

### In main.ts:

#### Setup steps:
1. Get Redis URL from config
2. Create pub client: `createClient({ url: redisUrl })`
3. Create sub client: `pubClient.duplicate()`
4. Connect both clients
5. Create adapter: `createAdapter(pubClient, subClient)`
6. Create custom IoAdapter class that extends IoAdapter
7. Override `createIOServer` to attach Redis adapter
8. Apply adapter to app: `app.useWebSocketAdapter(new RedisIoAdapter(...))`

### Custom RedisIoAdapter class:
- Extends `IoAdapter` from `@nestjs/platform-socket.io`
- Constructor accepts app and adapter constructor
- `createIOServer(port, options)`:
  - Call parent method to create server
  - Attach adapter: `server.adapter(this.adapterConstructor)`
  - Return server

---

## Step 4.12: Integrate Gateway with REST Endpoints

**Purpose:** REST operations should trigger WebSocket notifications.

### In ConversationsService:

#### create() method
- After creating conversation, call:
  - `chatGateway.notifyNewConversation(conversationId, participantIds)`

#### addParticipant() method
- After adding participant, call:
  - `chatGateway.notifyUserAdded(conversationId, newUserId)`

#### removeParticipant() method
- After removing participant, call:
  - `chatGateway.notifyUserRemoved(conversationId, removedUserId)`

#### leave() method
- After user leaves, call:
  - `chatGateway.notifyUserRemoved(conversationId, userId)`

### In MessagesService (alternative approach):

Instead of emitting from gateway handlers, emit from service:

#### send() method
- After creating message, call:
  - `chatGateway.emitToConversation(conversationId, 'message:new', message)`

This ensures REST-created messages also trigger WebSocket events.

### Dependency injection:
- Inject `ChatGateway` into services that need to emit events
- Handle circular dependency if needed (use `forwardRef`)

---

## Step 4.13: Handle Client Reconnection

**Purpose:** Ensure clients can recover missed messages after disconnection.

### Server-side:
- Implement `messages:sync` event (done in Step 4.10)
- Accept `lastMessageId` parameter
- Return messages after that ID

### Client-side pattern (for documentation):
1. Track last received message ID
2. On connect event, if have previous message ID:
   - Call `messages:sync` with lastMessageId
   - Or use REST endpoint to fetch missed messages
3. Render missed messages

### Alternative — Missed message delivery:
- On reconnect, server could automatically send missed messages
- Requires tracking "last delivered message" per user per conversation
- More complex, consider for future enhancement

---

## Step 4.14: Heartbeat & Connection Health

**Purpose:** Detect stale connections and enable latency monitoring.

### Socket.IO built-in:
- Automatic ping/pong every 25 seconds (configured)
- Timeout after 60 seconds of no response (configured)
- No additional implementation needed

### Custom ping endpoint:
- Implement `@SubscribeMessage('ping')` (done in Step 4.10)
- Allows client to measure round-trip latency
- Client can implement health monitoring

### Connection monitoring (optional):
- Track connection duration in socket metadata
- Implement admin endpoint to view active connections
- Consider for future monitoring/debugging

---

## Step 4.15: Register Gateway Module

### gateway.module.ts

**Imports:**
- JwtModule.registerAsync() — Configure with secret from ConfigService
- MessagesModule
- ConversationsModule
- UsersModule (if needed for user lookups)

**Providers:**
- ChatGateway
- ConnectionService
- RoomService

**Exports:**
- ChatGateway — Other modules need to call notification methods

### app.module.ts

- Add `GatewayModule` to imports

### Handle circular dependencies:
- If ConversationsService imports ChatGateway and GatewayModule imports ConversationsModule
- Use `forwardRef(() => GatewayModule)` in ConversationsModule
- Use `forwardRef(() => ConversationsModule)` in GatewayModule
- Use `@Inject(forwardRef(() => ChatGateway))` in services

---

## Step 4.16: Testing

### Test 1: Connection with valid token
**Setup:** Generate valid JWT token
**Action:** Connect to WebSocket with token in auth object
**Expected:**
- Receive 'connected' event with userId, socketId, rooms count
- No 'error' event
- Socket remains connected

### Test 2: Connection with invalid token
**Setup:** Use expired or malformed token
**Action:** Connect to WebSocket
**Expected:**
- Receive 'error' event with UNAUTHORIZED code
- Socket disconnected

### Test 3: Connection without token
**Action:** Connect without providing token
**Expected:**
- Receive 'error' event with UNAUTHORIZED code
- Socket disconnected

### Test 4: Send message via WebSocket
**Setup:** Connected socket, valid conversation ID
**Action:** Emit 'message:send' with conversationId and content
**Expected:**
- Receive acknowledgment with success: true and message object
- Receive 'message:new' event with same message
- Other participants in conversation receive 'message:new'

### Test 5: Send message to unauthorized conversation
**Setup:** Connected socket, conversation ID user is not part of
**Action:** Emit 'message:send'
**Expected:**
- Receive error with FORBIDDEN code
- No 'message:new' broadcasted

### Test 6: Send message via REST, receive via WebSocket
**Setup:** Connected WebSocket, same user
**Action:** Send message via REST API
**Expected:**
- WebSocket receives 'message:new' event

### Test 7: Multi-device connection
**Setup:** Same user connects from two browser tabs/devices
**Action:** Send message from one connection
**Expected:**
- Both connections receive 'message:new'
- Redis shows two socket IDs for user

### Test 8: Edit message
**Setup:** Connected socket, existing message sent by user
**Action:** Emit 'message:edit' with messageId and new content
**Expected:**
- Receive acknowledgment with updated message
- All participants receive 'message:updated'

### Test 9: Edit another user's message
**Setup:** Message sent by different user
**Action:** Emit 'message:edit'
**Expected:**
- Receive error with FORBIDDEN code

### Test 10: Delete message
**Setup:** Connected socket, existing message sent by user
**Action:** Emit 'message:delete' with messageId
**Expected:**
- Receive acknowledgment with success: true
- All participants receive 'message:deleted'

### Test 11: User online notification
**Setup:** User A and User B in same conversation, User A connected
**Action:** User B connects
**Expected:**
- User A receives 'user:online' with User B's ID

### Test 12: User offline notification
**Setup:** User A and User B connected, same conversation
**Action:** User B disconnects
**Expected:**
- User A receives 'user:offline' with User B's ID

### Test 13: New conversation notification
**Setup:** User A connected
**Action:** User B creates conversation with User A via REST
**Expected:**
- User A receives 'conversation:new' event
- User A's socket auto-joined to new conversation room

### Test 14: Participant added notification
**Setup:** User A and User B connected, group conversation
**Action:** Admin adds User C via REST
**Expected:**
- User A and B receive 'participant:added'
- User C receives 'conversation:joined' (if connected)
- User C's socket joined to room

### Test 15: Participant removed notification
**Setup:** User A, B, C in conversation, all connected
**Action:** Admin removes User C via REST
**Expected:**
- User A and B receive 'participant:removed'
- User C receives 'conversation:removed'
- User C's socket leaves room

### Test 16: Message sync after reconnect
**Setup:** Disconnect socket, send messages via another client
**Action:** Reconnect, emit 'messages:sync' with last known message ID
**Expected:**
- Receive response with all missed messages

### Test 17: Ping/pong latency check
**Action:** Emit 'ping', measure time until response
**Expected:**
- Receive 'pong' event with timestamp
- Can calculate round-trip latency

### Test 18: Multi-instance broadcasting
**Setup:** Run two instances of chat service behind load balancer
**Action:** Connect to instance 1, send message to conversation where another user is connected to instance 2
**Expected:**
- User on instance 2 receives message (via Redis adapter)

### Test 19: Validation error
**Action:** Emit 'message:send' with empty content
**Expected:**
- Receive error with VALIDATION_ERROR code
- Message not created

### Test 20: Rate limiting (if implemented)
**Action:** Send many messages rapidly
**Expected:**
- After limit, receive error with RATE_LIMITED code
- Messages rejected until cooldown

---

## WebSocket Events Reference

### Client → Server Events

| Event | Payload | Acknowledgment | Description |
|-------|---------|----------------|-------------|
| `message:send` | `{ conversationId, content, attachments?, replyTo?, metadata? }` | `{ success, message }` | Send new message |
| `message:edit` | `{ messageId, content }` | `{ success, message }` | Edit existing message |
| `message:delete` | `{ messageId }` | `{ success }` | Delete message |
| `messages:sync` | `{ conversationId, lastMessageId }` | `{ success, messages }` | Sync missed messages |
| `room:join` | `{ conversationId }` | `{ success, room }` | Join conversation room |
| `room:leave` | `{ conversationId }` | `{ success }` | Leave conversation room |
| `ping` | `{}` | `{ event: 'pong', timestamp }` | Health check |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ userId, socketId, rooms, timestamp }` | Connection established |
| `error` | `{ code, message, timestamp, originalEvent? }` | Error occurred |
| `message:new` | `{ ...messageObject }` | New message in conversation (includes `metadata` field) |
| `message:updated` | `{ messageId, content, isEdited, updatedAt }` | Message was edited |
| `message:deleted` | `{ messageId, conversationId, deletedAt }` | Message was deleted |
| `user:online` | `{ userId, conversationId, timestamp }` | User came online |
| `user:offline` | `{ userId, conversationId, timestamp }` | User went offline |
| `conversation:new` | `{ ...conversationObject }` | New conversation created (includes `metadata` field) |
| `conversation:joined` | `{ ...conversationObject }` | Added to existing conversation (includes `metadata` field) |
| `conversation:removed` | `{ conversationId }` | Removed from conversation |
| `participant:added` | `{ conversationId, userId, timestamp }` | New participant in conversation |
| `participant:removed` | `{ conversationId, userId, timestamp }` | Participant left/removed |

---

## Error Codes Reference

| Code | HTTP Equivalent | Description |
|------|-----------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Not allowed to perform action |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid payload |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `CONNECTION_ERROR` | 500 | Failed to establish connection |

---

## Phase 4 Checklist

| # | Task | Status |
|---|------|--------|
| 4.1 | Install dependencies | ☐ |
| 4.2 | Create module structure | ☐ |
| 4.3 | Define interfaces | ☐ |
| 4.4 | Implement ConnectionService | ☐ |
| 4.5 | Implement RoomService | ☐ |
| 4.6 | Implement WsAuthGuard | ☐ |
| 4.7 | Implement WsCurrentUser decorator | ☐ |
| 4.8 | Implement WsExceptionFilter | ☐ |
| 4.9 | Create WebSocket DTOs | ☐ |
| 4.10 | Implement ChatGateway | ☐ |
| 4.11 | Configure Redis adapter | ☐ |
| 4.12 | Integrate with REST endpoints | ☐ |
| 4.13 | Handle reconnection sync | ☐ |
| 4.14 | Add heartbeat handling | ☐ |
| 4.15 | Register module | ☐ |
| 4.16 | Test all scenarios | ☐ |

---

## Common Issues & Solutions

### Issue: Circular dependency between Gateway and Services
**Solution:** Use `forwardRef()` in both module imports and constructor injection

### Issue: WebSocket not receiving events from other instances
**Solution:** Verify Redis adapter is configured, both pub/sub clients connected

### Issue: Socket disconnects immediately after connect
**Solution:** Check JWT secret matches between services, verify token format

### Issue: User shows online after all tabs closed
**Solution:** Check `removeConnection` is cleaning up properly, verify Redis operations

### Issue: Messages not reaching all participants
**Solution:** Verify room names match, check user joined rooms on connect

### Issue: High memory usage with many connections
**Solution:** Implement connection limits, monitor Redis memory, consider socket cleanup

---

## Performance Considerations

- **Connection limits:** Consider limiting connections per user (e.g., max 5 devices)
- **Room size:** Very large group chats may need pagination for member lists
- **Message rate:** Consider rate limiting messages per user per minute
- **Reconnection storms:** Implement exponential backoff on client side
- **Redis memory:** Monitor connection tracking keys, implement cleanup jobs

---

## Security Considerations

- **Token validation:** Always validate JWT on connect, don't trust socket data
- **Room authorization:** Always verify participation before joining rooms
- **Input validation:** Validate all incoming payloads with DTOs
- **Rate limiting:** Prevent spam/abuse with per-user limits
- **Message size:** Limit message content length (5000 chars recommended)
- **Attachment count:** Limit attachments per message (10 recommended)