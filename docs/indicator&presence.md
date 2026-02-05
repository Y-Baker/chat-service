## Phase 6: Typing, Recording & Presence

---

## Presence States

| State | Meaning | How Determined |
|-------|---------|----------------|
| `online` | User is active | Recent activity (< 5 min) |
| `away` | Connected but inactive | No activity for 5+ minutes |
| `offline` | No active connections | All sockets disconnected |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Presence System                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         Redis                                    │   │
│  │                                                                  │   │
│  │  ┌────────────────────────┐    ┌────────────────────────────┐   │   │
│  │  │   Online/Away Status   │    │    Activity Indicators     │   │   │
│  │  │                        │    │                            │   │   │
│  │  │  presence:{userId}     │    │  typing:{convId}:{userId}  │   │   │
│  │  │  └─ status: online     │    │  └─ TTL: 5 seconds         │   │   │
│  │  │  └─ lastActivity: ts   │    │                            │   │   │
│  │  │  └─ TTL: none          │    │  recording:{convId}:{userId}│   │   │
│  │  │                        │    │  └─ TTL: 30 seconds        │   │   │
│  │  │  ws:online (Set)       │    │                            │   │   │
│  │  │  └─ connected users    │    │                            │   │   │
│  │  └────────────────────────┘    └────────────────────────────┘   │   │
│  │                                                                  │   │
│  │  ┌────────────────────────┐    ┌────────────────────────────┐   │   │
│  │  │   Last Seen            │    │   Connection Map           │   │   │
│  │  │                        │    │   (from Phase 4)           │   │   │
│  │  │  lastseen:{userId}     │    │                            │   │   │
│  │  │  └─ timestamp          │    │  ws:connections:{userId}   │   │   │
│  │  │  └─ TTL: 30 days       │    │  └─ socket_1, socket_2     │   │   │
│  │  └────────────────────────┘    └────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Activity Indicators Comparison

| Indicator | Purpose | TTL | Refresh Rate |
|-----------|---------|-----|--------------|
| `typing` | Text input | 5s | Every 3s while typing |
| `recording` | Audio/video recording | 30s | Every 10s while recording |

**Why different TTLs:**
- Typing is rapid, short bursts — 5s is enough
- Recording can be longer — 30s prevents premature expiration during long recordings

---

## Away Status Logic

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Activity-Based Status                              │
│                                                                         │
│   User connects                                                         │
│        │                                                                │
│        ▼                                                                │
│   ┌─────────┐                                                          │
│   │ ONLINE  │◄─────────────────────────────────────┐                   │
│   └────┬────┘                                      │                   │
│        │                                           │                   │
│        │ No activity for 5 minutes                 │ Any activity      │
│        ▼                                           │                   │
│   ┌─────────┐                                      │                   │
│   │  AWAY   │──────────────────────────────────────┘                   │
│   └────┬────┘                                                          │
│        │                                                                │
│        │ Disconnect (all sockets)                                      │
│        ▼                                                                │
│   ┌─────────┐                                                          │
│   │ OFFLINE │                                                          │
│   └─────────┘                                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Activities that mark user as "online":**
- Sending a message
- Sending typing/recording indicator
- Explicit activity ping from client
- Any WebSocket event emission

---

## Redis Data Structures

| Key Pattern | Type | TTL | Purpose |
|-------------|------|-----|---------|
| `ws:online` | Set | None | All connected user IDs |
| `presence:{userId}` | Hash | None | Status + last activity timestamp |
| `typing:{conversationId}:{userId}` | String | 5s | User is typing |
| `recording:{conversationId}:{userId}` | String | 30s | User is recording |
| `lastseen:{userId}` | String | 30d | Last activity (for offline users) |

### presence:{userId} Hash Structure

```
{
  status: "online" | "away",
  lastActivity: "2024-01-15T10:30:00.000Z",
  connectedAt: "2024-01-15T09:00:00.000Z"
}
```

---

## Module Structure

```
src/presence/
├── presence.module.ts
├── presence.service.ts
├── presence.controller.ts
├── dto/
│   ├── get-presence.dto.ts
│   └── get-batch-presence.dto.ts
├── interfaces/
│   └── presence-status.interface.ts
└── constants/
    └── presence.constants.ts
```

---

## Step 6.1: Define Constants

### presence.constants.ts (read from main configuration.ts file)

**Constants to define:**
- `TYPING_TTL = 5` — Typing indicator TTL in seconds
- `RECORDING_TTL = 30` — Recording indicator TTL in seconds
- `AWAY_THRESHOLD = 5 * 60` — Seconds of inactivity before "away" (5 minutes)
- `LAST_SEEN_TTL = 30 * 24 * 60 * 60` — Last seen TTL (30 days)
- `ACTIVITY_CHECK_INTERVAL = 60` — How often to check for away status (60 seconds)

---

## Step 6.2: Define Presence Interfaces

### presence-status.interface.ts

**PresenceStatus enum:**
```
'online' | 'away' | 'offline'
```

**UserPresence interface:**
- `userId` (string)
- `status` (PresenceStatus)
- `lastActivity` (Date | null) — Last activity timestamp
- `lastSeen` (Date | null) — For offline users only

**ConversationPresence interface:**
- `conversationId` (string)
- `participants` (UserPresence[])
- `onlineCount` (number)
- `awayCount` (number)
- `typingUsers` (string[])
- `recordingUsers` (string[])

**ActivityIndicator interface:**
- `userId` (string)
- `conversationId` (string)
- `type` ('typing' | 'recording')
- `isActive` (boolean)
- `timestamp` (Date)

---

## Step 6.3: Implement Presence Service

### Properties

- Redis client injection
- Constants from presence.constants.ts
- Optional: Interval for periodic away-status checks

### Core Presence Methods

#### setOnline(userId)

**Steps:**
1. Add user to connected set: `SADD ws:online {userId}`
2. Set presence hash:
   ```
   HSET presence:{userId} 
     status "online"
     lastActivity {timestamp}
     connectedAt {timestamp}
   ```
3. Delete last seen (they're online now): `DEL lastseen:{userId}`

#### setAway(userId)

**Steps:**
1. Update presence hash status only:
   ```
   HSET presence:{userId} status "away"
   ```
2. User remains in `ws:online` set (still connected)

#### setOffline(userId)

**Steps:**
1. Remove from connected set: `SREM ws:online {userId}`
2. Delete presence hash: `DEL presence:{userId}`
3. Set last seen: `SET lastseen:{userId} {timestamp} EX {LAST_SEEN_TTL}`

#### updateActivity(userId)

**Purpose:** Called on any user activity to reset away timer

**Steps:**
1. Update last activity in presence hash:
   ```
   HSET presence:{userId} 
     status "online"
     lastActivity {timestamp}
   ```

**When to call:**
- On message send
- On typing/recording start
- On explicit activity ping
- On any client-initiated WebSocket event

#### getPresenceStatus(userId)

**Steps:**
1. Check if user in connected set: `SISMEMBER ws:online {userId}`
2. If connected:
   - Get presence hash: `HGETALL presence:{userId}`
   - Check if away (lastActivity > AWAY_THRESHOLD ago)
   - Return status with lastActivity
3. If not connected:
   - Get last seen: `GET lastseen:{userId}`
   - Return offline status with lastSeen

#### getPresenceStatuses(userIds[])

**Steps:**
1. Pipeline: Check connected status for all users
2. Pipeline: Get presence hashes for connected users
3. Pipeline: Get last seen for disconnected users
4. Combine results, calculate away status based on lastActivity
5. Return array of UserPresence objects

#### checkAndUpdateAwayStatus(userId)

**Purpose:** Check if user should be marked away

**Steps:**
1. Get presence hash
2. If status is "online" and lastActivity > AWAY_THRESHOLD ago:
   - Set status to "away"
   - Return true (status changed)
3. Return false (no change)

### Activity Indicator Methods

#### setTyping(conversationId, userId)

**Steps:**
1. Set typing key: `SET typing:{conversationId}:{userId} 1 EX {TYPING_TTL}`
2. Update user activity: call `updateActivity(userId)`
3. Return true

#### stopTyping(conversationId, userId)

**Steps:**
1. Delete typing key: `DEL typing:{conversationId}:{userId}`

#### isTyping(conversationId, userId)

**Steps:**
1. Check exists: `EXISTS typing:{conversationId}:{userId}`
2. Return boolean

#### setRecording(conversationId, userId)

**Steps:**
1. Set recording key: `SET recording:{conversationId}:{userId} 1 EX {RECORDING_TTL}`
2. Update user activity: call `updateActivity(userId)`
3. Return true

#### stopRecording(conversationId, userId)

**Steps:**
1. Delete recording key: `DEL recording:{conversationId}:{userId}`

#### isRecording(conversationId, userId)

**Steps:**
1. Check exists: `EXISTS recording:{conversationId}:{userId}`
2. Return boolean

#### getTypingUsers(conversationId)

**Steps:**
1. Scan for keys: `SCAN 0 MATCH typing:{conversationId}:* COUNT 100`
2. Extract user IDs from key names
3. Return array of user IDs

#### getRecordingUsers(conversationId)

**Steps:**
1. Scan for keys: `SCAN 0 MATCH recording:{conversationId}:* COUNT 100`
2. Extract user IDs from key names
3. Return array of user IDs

#### getActivityIndicators(conversationId)

**Purpose:** Get all activity (typing + recording) for a conversation

**Steps:**
1. Get typing users
2. Get recording users
3. Return combined result:
   ```
   {
     typingUsers: ["user_1", "user_2"],
     recordingUsers: ["user_3"]
   }
   ```

### Conversation Presence Method

#### getConversationPresence(conversationId, participantIds[])

**Steps:**
1. Get presence statuses for all participants
2. Get typing users for conversation
3. Get recording users for conversation
4. Calculate counts (online, away)
5. Return ConversationPresence object

### Cleanup Methods

#### clearUserActivityIndicators(userId, conversationIds[])

**Purpose:** Clear all typing/recording for a user (on disconnect)

**Steps:**
1. For each conversation:
   - `DEL typing:{conversationId}:{userId}`
   - `DEL recording:{conversationId}:{userId}`

---

## Step 6.4: Create Presence DTOs

### GetConversationPresenceDto

**Query parameters:**
- None (conversationId from URL)

### GetBatchPresenceDto

**Body:**
- `userIds` (string[], required)
  - Validators: IsArray, IsString({ each: true }), ArrayMinSize(1), ArrayMaxSize(100)

---

## Step 6.5: Implement Presence Controller

### Endpoints

| Method | Route | Guard | Description |
|--------|-------|-------|-------------|
| `GET` | `/api/users/:userId/presence` | JwtAuthGuard | Get user's presence |
| `GET` | `/api/conversations/:conversationId/presence` | JwtAuthGuard | Get conversation presence |
| `POST` | `/api/presence/batch` | JwtAuthGuard | Batch get presence |

### Implementation Points

#### GET /api/users/:userId/presence

**Response:**
```
{
  userId: "user_123",
  status: "online" | "away" | "offline",
  lastActivity: "2024-01-15T10:30:00Z",  // if online/away
  lastSeen: "2024-01-15T10:30:00Z"        // if offline
}
```

#### GET /api/conversations/:conversationId/presence

**Steps:**
1. Verify user is participant
2. Get participant IDs from conversation
3. Call getConversationPresence()

**Response:**
```
{
  conversationId: "conv_123",
  participants: [
    { userId: "user_1", status: "online", lastActivity: "..." },
    { userId: "user_2", status: "away", lastActivity: "..." },
    { userId: "user_3", status: "offline", lastSeen: "..." }
  ],
  onlineCount: 1,
  awayCount: 1,
  typingUsers: ["user_1"],
  recordingUsers: []
}
```

#### POST /api/presence/batch

**Response:**
```
{
  presences: [
    { userId: "user_1", status: "online", lastActivity: "..." },
    { userId: "user_2", status: "offline", lastSeen: "..." }
  ]
}
```

---

## Step 6.6: Add WebSocket Events to ChatGateway

### New Event Handlers

#### @SubscribeMessage('typing:start')

**Payload:** `{ conversationId }`

**Steps:**
1. Get userId from socket
2. Verify user is participant
3. Call PresenceService.setTyping() — this also updates activity
4. Broadcast 'user:typing' to room (exclude sender):
   ```
   {
     conversationId,
     userId,
     type: "typing",
     isActive: true,
     timestamp
   }
   ```
5. Return acknowledgment

#### @SubscribeMessage('typing:stop')

**Payload:** `{ conversationId }`

**Steps:**
1. Get userId from socket
2. Call PresenceService.stopTyping()
3. Broadcast 'user:typing' with `isActive: false`
4. Return acknowledgment

#### @SubscribeMessage('recording:start')

**Payload:** `{ conversationId }`

**Steps:**
1. Get userId from socket
2. Verify user is participant
3. Call PresenceService.setRecording() — this also updates activity
4. Broadcast 'user:recording' to room (exclude sender):
   ```
   {
     conversationId,
     userId,
     type: "recording",
     isActive: true,
     timestamp
   }
   ```
5. Return acknowledgment

#### @SubscribeMessage('recording:stop')

**Payload:** `{ conversationId }`

**Steps:**
1. Get userId from socket
2. Call PresenceService.stopRecording()
3. Broadcast 'user:recording' with `isActive: false`
4. Return acknowledgment

#### @SubscribeMessage('activity:ping')

**Purpose:** Client sends this periodically to stay "online" (not "away")

**Payload:** `{}` (empty)

**Steps:**
1. Get userId from socket
2. Call PresenceService.updateActivity()
3. Return acknowledgment (no broadcast needed)

### Update Existing Handlers

#### handleConnection(socket)

After existing logic, add:
1. Call PresenceService.setOnline(userId)
2. Broadcast 'user:online' (already done)

#### handleDisconnect(socket)

After existing logic, add:
1. Clear all activity indicators:
   - Call PresenceService.clearUserActivityIndicators(userId, conversationIds)
2. For each conversation, broadcast:
   - 'user:typing' with `isActive: false` (if was typing)
   - 'user:recording' with `isActive: false` (if was recording)
3. If user fully offline:
   - Call PresenceService.setOffline(userId)
   - 'user:offline' already broadcasted

#### handleSendMessage (from Phase 4)

Add activity update:
1. Call PresenceService.updateActivity(userId) before or after saving message

---

## Step 6.7: Away Status Detection

### Option A: Client-Driven (Recommended for MVP)

**How it works:**
- Client sends `activity:ping` every 2-3 minutes when user is active
- If no ping for 5 minutes, server considers user "away"
- Status calculated on-demand when presence is queried

**Implementation:**
- In `getPresenceStatus()`, check `lastActivity` timestamp
- If > AWAY_THRESHOLD ago, return "away" instead of "online"
- No background job needed

**Client pattern:**
```
Pseudocode:

// On any user interaction (click, keypress, scroll)
onUserActivity():
  if lastPing > 2 minutes ago:
    socket.emit('activity:ping')
    lastPing = now
```

### Option B: Server-Driven (More accurate, more complex)

**How it works:**
- Background job checks all online users every minute
- Updates status to "away" if inactive
- Broadcasts status change

**Implementation:**
- Use NestJS scheduler (@nestjs/schedule)
- Cron job every 60 seconds
- Scan `ws:online` set, check each user's lastActivity
- If inactive, update status and broadcast

**Skip for MVP** — Option A is simpler and sufficient.

---

## Step 6.8: WebSocket Event Payloads

### user:typing (Server → Client)

```
{
  conversationId: "conv_123",
  userId: "user_1",
  type: "typing",
  isActive: true | false,
  timestamp: "2024-01-15T10:30:00Z"
}
```

### user:recording (Server → Client)

```
{
  conversationId: "conv_123",
  userId: "user_1",
  type: "recording",
  isActive: true | false,
  timestamp: "2024-01-15T10:30:00Z"
}
```

### user:online (Server → Client)

```
{
  userId: "user_1",
  conversationId: "conv_123",
  status: "online",
  timestamp: "2024-01-15T10:30:00Z"
}
```

### user:away (Server → Client) — Optional

```
{
  userId: "user_1",
  conversationId: "conv_123",
  status: "away",
  timestamp: "2024-01-15T10:30:00Z"
}
```

**Note:** With client-driven approach, you may not broadcast away status. Client queries presence when needed and gets current status.

### user:offline (Server → Client)

```
{
  userId: "user_1",
  conversationId: "conv_123",
  status: "offline",
  lastSeen: "2024-01-15T10:30:00Z",
  timestamp: "2024-01-15T10:30:00Z"
}
```

---

## Step 6.9: Client-Side Implementation Patterns

### Typing Indicator (Client Sending)

```
Pseudocode:

typingTimeout = null
isTyping = false

onInputChange():
  if not isTyping:
    isTyping = true
    socket.emit('typing:start', { conversationId })
  
  clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => {
    isTyping = false
    socket.emit('typing:stop', { conversationId })  // optional
  }, 3000)

onInputBlur():
  if isTyping:
    isTyping = false
    clearTimeout(typingTimeout)
    socket.emit('typing:stop', { conversationId })
```

### Recording Indicator (Client Sending)

```
Pseudocode:

recordingInterval = null

onRecordingStart():
  socket.emit('recording:start', { conversationId })
  
  // Keep refreshing since recording can be long
  recordingInterval = setInterval(() => {
    socket.emit('recording:start', { conversationId })
  }, 10000)  // Every 10 seconds

onRecordingStop():
  clearInterval(recordingInterval)
  socket.emit('recording:stop', { conversationId })
```

### Receiving Indicators (Client)

```
Pseudocode:

typingUsers = Map<conversationId, Map<userId, timeout>>
recordingUsers = Map<conversationId, Set<userId>>

socket.on('user:typing', (data) => {
  if data.isActive:
    // Set/reset timeout to hide after 5 seconds
    clearTimeout(typingUsers[data.conversationId]?.[data.userId])
    typingUsers[data.conversationId][data.userId] = setTimeout(() => {
      delete typingUsers[data.conversationId][data.userId]
      updateUI()
    }, 5000)
  else:
    // Immediate hide
    clearTimeout(typingUsers[data.conversationId]?.[data.userId])
    delete typingUsers[data.conversationId][data.userId]
  
  updateUI()
})

socket.on('user:recording', (data) => {
  if data.isActive:
    recordingUsers[data.conversationId].add(data.userId)
    
    // Auto-remove after 30 seconds if no update
    setTimeout(() => {
      recordingUsers[data.conversationId].delete(data.userId)
      updateUI()
    }, 30000)
  else:
    recordingUsers[data.conversationId].delete(data.userId)
  
  updateUI()
})
```

### Activity Ping (Client)

```
Pseudocode:

lastActivityPing = 0
PING_INTERVAL = 2 * 60 * 1000  // 2 minutes

onUserInteraction():  // click, keypress, scroll, etc.
  now = Date.now()
  if now - lastActivityPing > PING_INTERVAL:
    socket.emit('activity:ping')
    lastActivityPing = now
```

---

## Step 6.10: Register Module

### presence.module.ts

**Imports:**
- ConversationsModule (for participation checks)

**Providers:**
- PresenceService

**Controllers:**
- PresenceController

**Exports:**
- PresenceService

### Update GatewayModule

- Import PresenceModule
- Inject PresenceService into ChatGateway

### app.module.ts

- Add PresenceModule

---

## Step 6.11: Testing

### Presence Tests

#### Test 1: User online on connect
**Action:** Connect WebSocket
**Expected:**
- User added to `ws:online` set
- Presence hash created with status "online"
- `user:online` event broadcasted

#### Test 2: User away after inactivity
**Setup:** User connected, no activity for 5+ minutes
**Action:** Query presence
**Expected:**
- Status returned as "away"
- lastActivity shows time of last activity

#### Test 3: User back to online after activity
**Setup:** User is "away"
**Action:** Send message or activity:ping
**Expected:**
- Status becomes "online"
- lastActivity updated

#### Test 4: User offline on disconnect
**Action:** Disconnect last socket
**Expected:**
- Removed from `ws:online`
- Presence hash deleted
- Last seen timestamp stored
- `user:offline` broadcasted

#### Test 5: Activity ping prevents away
**Setup:** User connected
**Action:** Send activity:ping every 2 minutes
**Expected:**
- User stays "online" indefinitely
- lastActivity keeps updating

#### Test 6: Get conversation presence with all states
**Setup:** 3 users — one online, one away, one offline
**Action:** GET /api/conversations/:id/presence
**Expected:**
- All three statuses correctly shown
- Counts accurate

### Typing Tests

#### Test 7: Start typing
**Action:** Emit 'typing:start'
**Expected:**
- Redis key created with 5s TTL
- Other participants receive 'user:typing' with isActive: true
- User's lastActivity updated

#### Test 8: Stop typing explicitly
**Action:** Emit 'typing:stop'
**Expected:**
- Redis key deleted
- 'user:typing' with isActive: false broadcasted

#### Test 9: Typing auto-expires
**Setup:** Start typing, wait 5+ seconds
**Expected:**
- Redis key expires
- Client hides indicator via timeout (no server event needed)

#### Test 10: Typing cleared on disconnect
**Setup:** User is typing
**Action:** Disconnect
**Expected:**
- Typing key deleted
- 'user:typing' with isActive: false broadcasted

### Recording Tests

#### Test 11: Start recording
**Action:** Emit 'recording:start'
**Expected:**
- Redis key created with 30s TTL
- Other participants receive 'user:recording' with isActive: true
- User's lastActivity updated

#### Test 12: Recording refresh
**Setup:** Start recording
**Action:** Emit 'recording:start' again after 10 seconds
**Expected:**
- TTL reset to 30s
- No duplicate broadcast needed (or broadcast is idempotent)

#### Test 13: Stop recording explicitly
**Action:** Emit 'recording:stop'
**Expected:**
- Redis key deleted
- 'user:recording' with isActive: false broadcasted

#### Test 14: Recording auto-expires
**Setup:** Start recording, don't refresh for 30+ seconds
**Expected:**
- Redis key expires
- Client hides indicator via timeout

#### Test 15: Recording cleared on disconnect
**Setup:** User is recording
**Action:** Disconnect
**Expected:**
- Recording key deleted
- 'user:recording' with isActive: false broadcasted

#### Test 16: Get conversation presence includes indicators
**Setup:** User A typing, User B recording
**Action:** GET /api/conversations/:id/presence
**Expected:**
- typingUsers: ["user_a"]
- recordingUsers: ["user_b"]

### Edge Cases

#### Test 17: Typing and recording simultaneously
**Setup:** Same user
**Action:** Start both typing and recording
**Expected:**
- Both indicators active
- Both shown in conversation presence

#### Test 18: Multiple users typing
**Setup:** 3 users typing
**Expected:**
- All 3 in typingUsers array
- UI can show "User1, User2, and User3 are typing"

#### Test 19: Indicator not sent to self
**Action:** Emit 'typing:start'
**Expected:**
- Sender does not receive 'user:typing' event
- Only other participants receive it

#### Test 20: Rapid indicator events
**Action:** Send 10 typing:start in 1 second
**Expected:**
- Server handles without error
- Only necessary broadcasts sent (or all handled gracefully)

---

## WebSocket Events Summary (Phase 6)

### Client → Server

| Event | Payload | Acknowledgment | Description |
|-------|---------|----------------|-------------|
| `typing:start` | `{ conversationId }` | `{ success: true }` | User started typing |
| `typing:stop` | `{ conversationId }` | `{ success: true }` | User stopped typing |
| `recording:start` | `{ conversationId }` | `{ success: true }` | User started recording |
| `recording:stop` | `{ conversationId }` | `{ success: true }` | User stopped recording |
| `activity:ping` | `{}` | `{ success: true }` | Keep user "online" |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `user:typing` | `{ conversationId, userId, type, isActive, timestamp }` | Typing status |
| `user:recording` | `{ conversationId, userId, type, isActive, timestamp }` | Recording status |
| `user:online` | `{ userId, conversationId, status, timestamp }` | User came online |
| `user:offline` | `{ userId, conversationId, status, lastSeen, timestamp }` | User went offline |

---

## API Endpoints Summary (Phase 6)

```
GET  /api/users/:userId/presence                    [JwtAuthGuard] — Get user presence
GET  /api/conversations/:conversationId/presence    [JwtAuthGuard] — Get conversation presence
POST /api/presence/batch                            [JwtAuthGuard] — Batch get presence
```

---

## Redis Commands Reference

| Operation | Command | Purpose |
|-----------|---------|---------|
| Set online | `SADD ws:online {userId}` | Add to connected set |
| Set presence | `HSET presence:{userId} status online lastActivity {ts}` | Store presence data |
| Update activity | `HSET presence:{userId} status online lastActivity {ts}` | Reset away timer |
| Get presence | `HGETALL presence:{userId}` | Get status + activity |
| Set offline | `SREM ws:online {userId}` + `DEL presence:{userId}` | Mark offline |
| Set typing | `SET typing:{convId}:{userId} 1 EX 5` | Typing with TTL |
| Stop typing | `DEL typing:{convId}:{userId}` | Remove typing |
| Get typing | `SCAN 0 MATCH typing:{convId}:*` | Find typing users |
| Set recording | `SET recording:{convId}:{userId} 1 EX 30` | Recording with TTL |
| Stop recording | `DEL recording:{convId}:{userId}` | Remove recording |
| Get recording | `SCAN 0 MATCH recording:{convId}:*` | Find recording users |
| Set last seen | `SET lastseen:{userId} {ts} EX 2592000` | Store offline timestamp |
| Get last seen | `GET lastseen:{userId}` | Get offline timestamp |

---

## Phase 6 Checklist

| # | Task | Status |
|---|------|--------|
| 6.1 | Define constants | ☐ |
| 6.2 | Define presence interfaces | ☐ |
| 6.3 | Implement PresenceService | ☐ |
| 6.4 | Create presence DTOs | ☐ |
| 6.5 | Implement PresenceController | ☐ |
| 6.6 | Add WebSocket events (typing, recording, activity) | ☐ |
| 6.7 | Implement away status detection | ☐ |
| 6.8 | Define WebSocket event payloads | ☐ |
| 6.9 | Document client-side patterns | ☐ |
| 6.10 | Register module | ☐ |
| 6.11 | Test all functionality | ☐ |

---

## Common Issues & Solutions

### Issue: User stuck in "away" after becoming active
**Solution:** Ensure updateActivity() is called on message send and activity:ping

### Issue: Typing/recording indicator doesn't clear on disconnect
**Solution:** Call clearUserActivityIndicators() in handleDisconnect(), broadcast stop events

### Issue: Away status not accurate
**Solution:** Verify client sends activity:ping regularly, check AWAY_THRESHOLD value

### Issue: Recording expires during long recording
**Solution:** Client must refresh recording:start every 10 seconds, TTL is 30 seconds

### Issue: Too many SCAN operations
**Solution:** Consider Set-based approach for typing/recording users per conversation

### Issue: Presence query slow for large conversations
**Solution:** Batch Redis operations with pipeline, limit participant list if needed

---

Ready for Phase 7 (Webhooks)?