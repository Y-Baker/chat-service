## Phase 5: Reactions & Read Receipts

This phase adds engagement features — emoji reactions and read status tracking

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Message Document                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  {                                                               │   │
│  │    _id: "msg_123",                                               │   │
│  │    conversationId: "conv_456",                                   │   │
│  │    senderId: "user_1",                                           │   │
│  │    content: "Hello!",                                            │   │
│  │    ...                                                           │   │
│  │    reactions: [                      ◄── Embedded array          │   │
│  │      { emoji: "👍", userIds: ["user_2", "user_3"] },             │   │
│  │      { emoji: "❤️", userIds: ["user_2"] }                        │   │
│  │    ],                                                            │   │
│  │    readBy: [                         ◄── Embedded array          │   │
│  │      { userId: "user_2", readAt: "2024-01-15T10:30:00Z" },       │   │
│  │      { userId: "user_3", readAt: "2024-01-15T10:35:00Z" }        │   │
│  │    ]                                                             │   │
│  │  }                                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Decision: Embedded vs Referenced

### Option A: Embedded in Message (Recommended)

```
Message {
  reactions: [{ emoji, userIds[] }]
  readBy: [{ userId, readAt }]
}
```

**Pros:**
- Single query to get message with all data
- Atomic updates
- No joins needed
- Natural fit for MongoDB

**Cons:**
- Document size grows with participants
- Limited to ~1000 reactions per message (practical limit)

---

## Reaction Model Design

### Structure: Grouped by Emoji

```
reactions: [
  { emoji: "👍", userIds: ["user_1", "user_2", "user_3"] },
  { emoji: "❤️", userIds: ["user_1"] },
  { emoji: "😂", userIds: ["user_2"] }
]
```

**Why grouped:**
- Easy to count reactions per emoji
- Easy to check if user already reacted with specific emoji
- Efficient for UI rendering (show emoji + count)

---

## Read Receipt Model Design

### Structure

```
readBy: [
  { userId: "user_2", readAt: ISODate("2024-01-15T10:30:00Z") },
  { userId: "user_3", readAt: ISODate("2024-01-15T10:35:00Z") }
]
```

**Notes:**
- Sender is not included in readBy (they obviously "read" their own message)
- Each user appears once per message
- `readAt` timestamp enables "seen at" display

---

## Module Structure

```
src/reactions/
├── reactions.module.ts
├── reactions.controller.ts
├── reactions.service.ts
└── dto/
    ├── add-reaction.dto.ts
    └── remove-reaction.dto.ts

src/read-receipts/
├── read-receipts.module.ts
├── read-receipts.controller.ts
├── read-receipts.service.ts
└── dto/
    └── mark-read.dto.ts
```

**Alternative:** Combine into single module if preferred.

---

## Step 5.1: Update Message Schema

### Add Reaction Sub-Schema

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `emoji` | string, required | Emoji character or shortcode |
| `userIds` | string[], required | Users who reacted with this emoji |

**Validation:**
- `emoji`: Max length 20 characters (handles compound emojis)
- `userIds`: Array of strings, no duplicates

### Add ReadBy Sub-Schema

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `userId` | string, required | User who read the message |
| `readAt` | Date, required | When they read it |

### Update Message Schema

**New fields on Message:**
- `reactions` — Array of Reaction sub-documents, default empty array
- `readBy` — Array of ReadBy sub-documents, default empty array

### Indexes to Add

- `conversationId` + `readBy.userId` — For unread count queries
- Consider compound index if querying reactions frequently

---

## Step 5.2: Create Reactions Module Structure

Create files:
- `reactions.module.ts`
- `reactions.controller.ts`
- `reactions.service.ts`
- `dto/add-reaction.dto.ts`
- `dto/remove-reaction.dto.ts`

---

## Step 5.3: Create Reaction DTOs

### AddReactionDto

**Fields:**
- `emoji` (string, required)
  - Validators: IsString, IsNotEmpty, MaxLength(20)

**Validation notes:**
- Allow emoji characters: 👍, ❤️, 😂, etc.
- Allow shortcodes if you want: :thumbsup:, :heart:
- Consider whitelist of allowed emojis (optional)

### RemoveReactionDto

Not needed as a body — emoji comes from URL parameter.

---

## Step 5.4: Implement Reactions Service

### Methods to Implement

#### addReaction(messageId, userId, emoji)

**Steps:**
1. Find message by ID
2. If not found, throw NotFoundException
3. Verify user is participant in the conversation
4. If not participant, throw ForbiddenException
5. Check if emoji already exists in reactions array
6. If emoji exists:
   - Check if user already in userIds for this emoji
   - If already reacted, return current state (idempotent)
   - If not, add userId to the emoji's userIds array
7. If emoji doesn't exist:
   - Push new reaction object: `{ emoji, userIds: [userId] }`
8. Save message
9. Return updated reactions array

**MongoDB update operation:**
```
// If emoji exists, add user to its array
{ $addToSet: { "reactions.$[elem].userIds": userId } }
{ arrayFilters: [{ "elem.emoji": emoji }] }

// If emoji doesn't exist, push new reaction
{ $push: { reactions: { emoji, userIds: [userId] } } }
```

**Approach:**
- First try to add to existing emoji
- If no modification (emoji doesn't exist), push new reaction
- Use findOneAndUpdate with proper options

#### removeReaction(messageId, userId, emoji)

**Steps:**
1. Find message by ID
2. If not found, throw NotFoundException
3. Verify user is participant in the conversation
4. Find the reaction with matching emoji
5. If not found, return success (idempotent)
6. Remove userId from the emoji's userIds array
7. If userIds array becomes empty, remove the entire reaction object
8. Save message
9. Return updated reactions array

**MongoDB update operations:**
```
// Remove user from emoji's array
{ $pull: { "reactions.$[elem].userIds": userId } }
{ arrayFilters: [{ "elem.emoji": emoji }] }

// Then clean up empty reactions
{ $pull: { reactions: { userIds: { $size: 0 } } } }
```

#### getReactions(messageId, userId)

**Steps:**
1. Find message by ID
2. Verify participation
3. Return reactions array

**Optional enhancement:**
- Return with user profiles populated for display

#### getUserReaction(messageId, userId, emoji)

**Steps:**
1. Find message
2. Check if user has reacted with specific emoji
3. Return boolean

---

## Step 5.5: Implement Reactions Controller

### Endpoints

| Method | Route | Guard | Description |
|--------|-------|-------|-------------|
| `POST` | `/api/messages/:messageId/reactions` | JwtAuthGuard | Add reaction |
| `DELETE` | `/api/messages/:messageId/reactions/:emoji` | JwtAuthGuard | Remove reaction |
| `GET` | `/api/messages/:messageId/reactions` | JwtAuthGuard | Get all reactions |

### Implementation Points

#### POST /api/messages/:messageId/reactions

**Parameters:**
- `messageId` from URL
- `emoji` from body (AddReactionDto)
- `userId` from JWT

**Response:**
```
{
  success: true,
  reactions: [
    { emoji: "👍", userIds: ["user_1", "user_2"], count: 2 },
    { emoji: "❤️", userIds: ["user_1"], count: 1 }
  ]
}
```

**After success:**
- Emit WebSocket event via ChatGateway

#### DELETE /api/messages/:messageId/reactions/:emoji

**Parameters:**
- `messageId` from URL
- `emoji` from URL (URL encoded if needed)
- `userId` from JWT

**Note on emoji in URL:**
- Emojis need URL encoding: `👍` becomes `%F0%9F%91%8D`
- NestJS automatically decodes URL parameters
- Test with various emojis to ensure proper handling

**Response:**
```
{
  success: true,
  reactions: [...]
}
```

#### GET /api/messages/:messageId/reactions

**Parameters:**
- `messageId` from URL
- `userId` from JWT (for participation check)

**Response:**
```
{
  reactions: [
    { 
      emoji: "👍", 
      count: 2,
      userIds: ["user_1", "user_2"],
      users: [
        { externalUserId: "user_1", displayName: "John" },
        { externalUserId: "user_2", displayName: "Jane" }
      ],
      hasReacted: true  // Current user has reacted
    }
  ]
}
```

---

## Step 5.6: Add Reaction WebSocket Events

### Update ChatGateway

#### New event handlers:

**@SubscribeMessage('reaction:add')**

**Payload:** `{ messageId, emoji }`

**Steps:**
1. Get userId from socket
2. Call ReactionsService.addReaction()
3. Get conversation ID from message
4. Broadcast 'reaction:added' to conversation room
5. Return acknowledgment

**@SubscribeMessage('reaction:remove')**

**Payload:** `{ messageId, emoji }`

**Steps:**
1. Get userId from socket
2. Call ReactionsService.removeReaction()
3. Broadcast 'reaction:removed' to conversation room
4. Return acknowledgment

### WebSocket Event Payloads

#### reaction:added (Server → Client)

```
{
  messageId: "msg_123",
  conversationId: "conv_456",
  emoji: "👍",
  userId: "user_1",
  totalCount: 3,
  timestamp: "2024-01-15T10:30:00Z"
}
```

#### reaction:removed (Server → Client)

```
{
  messageId: "msg_123",
  conversationId: "conv_456",
  emoji: "👍",
  userId: "user_1",
  totalCount: 2,  // or 0 if last reaction removed
  timestamp: "2024-01-15T10:30:00Z"
}
```

### Integration with REST

When reaction added/removed via REST, also emit WebSocket event:
- Call `chatGateway.emitToConversation()` from ReactionsService
- Or call gateway method from controller after service call

---

## Step 5.7: Create Read Receipts Module Structure

Create files:
- `read-receipts.module.ts`
- `read-receipts.controller.ts`
- `read-receipts.service.ts`
- `dto/mark-read.dto.ts`

---

## Step 5.8: Create Read Receipt DTOs

### MarkReadDto (for single message)

Not needed — messageId comes from URL parameter.

### MarkConversationReadDto (for bulk)

**Fields:**
- `upToMessageId` (string, optional)
  - Validators: IsOptional, IsMongoId
  - If provided, mark all messages up to and including this one
  - If not provided, mark all messages in conversation

---

## Step 5.9: Implement Read Receipts Service

### Methods to Implement

#### markAsRead(messageId, userId)

**Steps:**
1. Find message by ID
2. If not found, throw NotFoundException
3. Verify user is participant
4. If sender is the user, return success (don't track self-reads)
5. Check if user already in readBy array
6. If already read, return current state (idempotent, update readAt if you want)
7. Add user to readBy array with current timestamp
8. Save message
9. Return success with readAt timestamp

**MongoDB update:**
```
{
  $addToSet: {
    readBy: { userId, readAt: new Date() }
  }
}
```

**Note:** $addToSet won't add duplicate if userId already exists. But since readBy contains objects, need to handle differently:

**Better approach:**
```
// First check if user exists
const exists = await Message.findOne({
  _id: messageId,
  'readBy.userId': userId
});

if (!exists) {
  // Add new read receipt
  await Message.updateOne(
    { _id: messageId },
    { $push: { readBy: { userId, readAt: new Date() } } }
  );
}
```

#### markConversationAsRead(conversationId, userId, upToMessageId?)

**Steps:**
1. Verify user is participant in conversation
2. Build query for messages to mark:
   - `conversationId` matches
   - `senderId` is not the current user (don't mark own messages)
   - `readBy.userId` does not include current user (not already read)
   - If `upToMessageId` provided, `_id` <= `upToMessageId`
3. Update all matching messages
4. Return count of messages marked

**MongoDB update:**
```
await Message.updateMany(
  {
    conversationId,
    senderId: { $ne: userId },
    'readBy.userId': { $ne: userId },
    // Optional: _id: { $lte: upToMessageId }
  },
  {
    $push: { readBy: { userId, readAt: new Date() } }
  }
);
```

#### getUnreadCount(conversationId, userId)

**Steps:**
1. Count messages where:
   - `conversationId` matches
   - `senderId` is not the current user
   - `readBy.userId` does not include current user
   - `isDeleted` is false
2. Return count

**MongoDB aggregation:**
```
Message.countDocuments({
  conversationId,
  senderId: { $ne: userId },
  'readBy.userId': { $ne: userId },
  isDeleted: false
});
```

#### getUnreadCounts(conversationIds[], userId)

**Steps:**
1. Aggregate unread counts for multiple conversations
2. Return map of conversationId → count

**MongoDB aggregation:**
```
Message.aggregate([
  {
    $match: {
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      'readBy.userId': { $ne: userId },
      isDeleted: false
    }
  },
  {
    $group: {
      _id: '$conversationId',
      count: { $sum: 1 }
    }
  }
]);
```

#### getReadReceipts(messageId, userId)

**Steps:**
1. Find message
2. Verify participation
3. Return readBy array with user profiles populated

**Response format:**
```
{
  readBy: [
    {
      userId: "user_2",
      readAt: "2024-01-15T10:30:00Z",
      user: {
        displayName: "Jane",
        avatarUrl: "https://..."
      }
    }
  ],
  totalParticipants: 3,
  readCount: 1
}
```

---

## Step 5.10: Implement Read Receipts Controller

### Endpoints

| Method | Route | Guard | Description |
|--------|-------|-------|-------------|
| `PUT` | `/api/messages/:messageId/read` | JwtAuthGuard | Mark single message as read |
| `PUT` | `/api/conversations/:conversationId/read` | JwtAuthGuard | Mark conversation as read |
| `GET` | `/api/messages/:messageId/read` | JwtAuthGuard | Get read receipts for message |
| `GET` | `/api/conversations/:conversationId/unread-count` | JwtAuthGuard | Get unread count |

### Implementation Points

#### PUT /api/messages/:messageId/read

**Parameters:**
- `messageId` from URL
- `userId` from JWT

**Response:**
```
{
  success: true,
  readAt: "2024-01-15T10:30:00Z"
}
```

**After success:**
- Emit WebSocket event

#### PUT /api/conversations/:conversationId/read

**Parameters:**
- `conversationId` from URL
- `upToMessageId` from body (optional)
- `userId` from JWT

**Response:**
```
{
  success: true,
  markedCount: 15
}
```

**After success:**
- Emit WebSocket event for each message (or batch event)

#### GET /api/messages/:messageId/read

**Response:**
```
{
  readBy: [...],
  totalParticipants: 3,
  readCount: 2,
  unreadCount: 1
}
```

#### GET /api/conversations/:conversationId/unread-count

**Response:**
```
{
  conversationId: "conv_123",
  unreadCount: 5
}
```

---

## Step 5.11: Add Read Receipt WebSocket Events

### Update ChatGateway

#### New event handler:

**@SubscribeMessage('message:read')**

**Payload:** `{ messageId }` or `{ conversationId, upToMessageId? }`

**Steps:**
1. Get userId from socket
2. Determine if single message or bulk
3. Call appropriate service method
4. Broadcast 'message:read' event
5. Return acknowledgment

### WebSocket Event Payloads

#### message:read (Server → Client)

**Single message:**
```
{
  messageId: "msg_123",
  conversationId: "conv_456",
  userId: "user_2",
  readAt: "2024-01-15T10:30:00Z"
}
```

**Bulk read (conversation):**
```
{
  conversationId: "conv_456",
  userId: "user_2",
  upToMessageId: "msg_150",
  readAt: "2024-01-15T10:30:00Z",
  count: 15
}
```

---

## Step 5.12: Update Conversation List with Unread Counts

### Modify ConversationsService.findAllForUser()

**Current response:**
```
{
  data: [
    { _id, type, participants, lastMessage, ... }
  ],
  pagination: { ... }
}
```

**Updated response:**
```
{
  data: [
    { 
      _id, 
      type, 
      participants, 
      lastMessage,
      unreadCount: 5    // <-- Add this
    }
  ],
  pagination: { ... }
}
```

### Implementation approach:

**Option A: Aggregate in single query**
- Use MongoDB aggregation with $lookup or $facet
- More efficient but complex

**Option B: Fetch conversations, then fetch counts**
- Get conversation list first
- Extract conversation IDs
- Call ReadReceiptsService.getUnreadCounts()
- Merge counts into response
- Simpler, slightly less efficient

**Recommended: Option B for clarity**

---

## Step 5.13: Update Message Response with Reactions and ReadBy

### Modify message population

When returning messages (from history or real-time), include:

```
{
  _id: "msg_123",
  content: "Hello!",
  senderId: "user_1",
  sender: { ... },
  // ... other fields
  reactions: [
    {
      emoji: "👍",
      count: 2,
      userIds: ["user_2", "user_3"],
      hasReacted: false  // Current user hasn't reacted with this
    }
  ],
  readBy: [
    { userId: "user_2", readAt: "..." }
  ],
  readCount: 1,
  isReadByMe: false  // Convenience field for current user
}
```

### Implementation points:

**In MessagesService.populateMessage():**
1. Transform reactions array:
   - Add `count` field (userIds.length)
   - Add `hasReacted` field (check if current user in userIds)
2. Add `readCount` field (readBy.length)
3. Add `isReadByMe` field (check if current user in readBy)

**Note:** Need to pass current userId to population method.

---

## Step 5.14: Optimize for Performance

### Reaction Optimizations

**Limit reactions per message:**
- Set maximum unique emojis (e.g., 20)
- Check before adding new emoji type

**Limit users per emoji:**
- Practical limit based on UI (e.g., 1000)
- For large groups, consider showing "and X others"

### Read Receipt Optimizations

**Don't store receipts for very old messages:**
- Optional: Only track reads for messages < 30 days old
- Or: Archive old receipts periodically

**Batch read operations:**
- When marking conversation as read, use bulk update
- Don't emit individual events for each message

**Unread count caching:**
- Consider caching unread counts in Redis
- Invalidate on new message or read event
- Reduces database queries for conversation list

### Index Recommendations

```
// For unread count queries
{ conversationId: 1, senderId: 1, 'readBy.userId': 1, isDeleted: 1 }

// For reaction queries (if needed)
{ 'reactions.emoji': 1 }
```

---

## Step 5.15: Register Modules

### reactions.module.ts

**Imports:**
- MongooseModule.forFeature (for Message if updating directly)
- MessagesModule (or inject model directly)
- ConversationsModule (for participation checks)
- GatewayModule (for WebSocket events)

**Providers:**
- ReactionsService

**Controllers:**
- ReactionsController

**Exports:**
- ReactionsService

### read-receipts.module.ts

**Imports:**
- MongooseModule.forFeature
- MessagesModule
- ConversationsModule
- GatewayModule

**Providers:**
- ReadReceiptsService

**Controllers:**
- ReadReceiptsController

**Exports:**
- ReadReceiptsService

### app.module.ts

- Add ReactionsModule
- Add ReadReceiptsModule

### Handle circular dependencies if needed

- GatewayModule ↔ ReactionsModule
- GatewayModule ↔ ReadReceiptsModule
- Use forwardRef() as needed

---

## Step 5.16: Testing

### Reaction Tests

#### Test 1: Add reaction
**Setup:** Existing message, participant user
**Action:** POST /api/messages/:id/reactions with emoji "👍"
**Expected:**
- Success response
- Reactions array includes emoji with user
- WebSocket 'reaction:added' broadcasted

#### Test 2: Add same reaction twice (idempotent)
**Setup:** User already reacted with "👍"
**Action:** Add "👍" again
**Expected:**
- Success response
- User appears once in userIds (no duplicate)

#### Test 3: Add different reaction
**Setup:** User already reacted with "👍"
**Action:** Add "❤️"
**Expected:**
- Success response
- Both emojis present in reactions

#### Test 4: Remove reaction
**Setup:** User has "👍" reaction
**Action:** DELETE /api/messages/:id/reactions/👍
**Expected:**
- Success response
- User removed from emoji's userIds
- WebSocket 'reaction:removed' broadcasted

#### Test 5: Remove last reaction for emoji
**Setup:** Only one user reacted with "😂"
**Action:** That user removes "😂"
**Expected:**
- Entire emoji entry removed from reactions array

#### Test 6: Remove non-existent reaction (idempotent)
**Action:** Remove reaction user doesn't have
**Expected:**
- Success response (no error)

#### Test 7: Non-participant tries to react
**Action:** User not in conversation tries to add reaction
**Expected:**
- 403 Forbidden

#### Test 8: React via WebSocket
**Action:** Emit 'reaction:add' event
**Expected:**
- Acknowledgment received
- 'reaction:added' broadcasted to room

#### Test 9: Multiple users react with same emoji
**Setup:** User A and User B in conversation
**Action:** Both add "👍"
**Expected:**
- Single emoji entry with both users in userIds
- Count shows 2

#### Test 10: Get reactions with user profiles
**Action:** GET /api/messages/:id/reactions
**Expected:**
- Reactions with user details populated
- hasReacted field correct for current user

### Read Receipt Tests

#### Test 11: Mark single message as read
**Setup:** Message from another user, not yet read
**Action:** PUT /api/messages/:id/read
**Expected:**
- Success with readAt timestamp
- readBy array includes user
- WebSocket 'message:read' broadcasted

#### Test 12: Mark own message as read
**Setup:** Message sent by current user
**Action:** PUT /api/messages/:id/read
**Expected:**
- Success (no-op)
- User not added to readBy (sender doesn't read own message)

#### Test 13: Mark already-read message (idempotent)
**Setup:** Message already read by user
**Action:** Mark as read again
**Expected:**
- Success (no error)
- No duplicate in readBy

#### Test 14: Mark conversation as read
**Setup:** Conversation with 10 unread messages
**Action:** PUT /api/conversations/:id/read
**Expected:**
- Success with markedCount: 10
- All messages have user in readBy

#### Test 15: Mark conversation as read up to specific message
**Setup:** 20 messages, want to mark first 10 as read
**Action:** PUT /api/conversations/:id/read with upToMessageId
**Expected:**
- Only messages up to and including that ID marked
- Later messages unchanged

#### Test 16: Get unread count
**Setup:** Conversation with mix of read/unread messages
**Action:** GET /api/conversations/:id/unread-count
**Expected:**
- Correct count of unread messages

#### Test 17: Unread count in conversation list
**Action:** GET /api/conversations
**Expected:**
- Each conversation includes unreadCount field

#### Test 18: Read receipt via WebSocket
**Action:** Emit 'message:read' event
**Expected:**
- Acknowledgment received
- 'message:read' broadcasted to room

#### Test 19: Get read receipts for message
**Action:** GET /api/messages/:id/read
**Expected:**
- List of users who read with timestamps
- User profiles included

#### Test 20: New message resets unread count
**Setup:** Conversation marked as read (0 unread)
**Action:** Another user sends message
**Expected:**
- Unread count becomes 1

---

## WebSocket Events Summary (Phase 5 Additions)

### Client → Server

| Event | Payload | Acknowledgment | Description |
|-------|---------|----------------|-------------|
| `reaction:add` | `{ messageId, emoji }` | `{ success, reactions }` | Add reaction |
| `reaction:remove` | `{ messageId, emoji }` | `{ success, reactions }` | Remove reaction |
| `message:read` | `{ messageId }` | `{ success, readAt }` | Mark message read |
| `conversation:read` | `{ conversationId, upToMessageId? }` | `{ success, count }` | Mark conversation read |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `reaction:added` | `{ messageId, conversationId, emoji, userId, totalCount, timestamp }` | Reaction added |
| `reaction:removed` | `{ messageId, conversationId, emoji, userId, totalCount, timestamp }` | Reaction removed |
| `message:read` | `{ messageId, conversationId, userId, readAt }` | Message marked read |
| `conversation:read` | `{ conversationId, userId, upToMessageId?, count, readAt }` | Bulk read |

---

## API Endpoints Summary (Phase 5)

```
# Reactions
POST   /api/messages/:messageId/reactions           [JwtAuthGuard] — Add reaction
DELETE /api/messages/:messageId/reactions/:emoji    [JwtAuthGuard] — Remove reaction
GET    /api/messages/:messageId/reactions           [JwtAuthGuard] — Get reactions

# Read Receipts
PUT    /api/messages/:messageId/read                [JwtAuthGuard] — Mark message read
PUT    /api/conversations/:conversationId/read      [JwtAuthGuard] — Mark conversation read
GET    /api/messages/:messageId/read                [JwtAuthGuard] — Get read receipts
GET    /api/conversations/:conversationId/unread-count [JwtAuthGuard] — Get unread count
```

---

## Phase 5 Checklist

| # | Task | Status |
|---|------|--------|
| 5.1 | Update Message schema (reactions, readBy) | ☐ |
| 5.2 | Create Reactions module structure | ☐ |
| 5.3 | Create Reaction DTOs | ☐ |
| 5.4 | Implement ReactionsService | ☐ |
| 5.5 | Implement ReactionsController | ☐ |
| 5.6 | Add Reaction WebSocket events | ☐ |
| 5.7 | Create Read Receipts module structure | ☐ |
| 5.8 | Create Read Receipt DTOs | ☐ |
| 5.9 | Implement ReadReceiptsService | ☐ |
| 5.10 | Implement ReadReceiptsController | ☐ |
| 5.11 | Add Read Receipt WebSocket events | ☐ |
| 5.12 | Update conversation list with unread counts | ☐ |
| 5.13 | Update message response with reactions/readBy | ☐ |
| 5.14 | Add performance optimizations | ☐ |
| 5.15 | Register modules | ☐ |
| 5.16 | Test all functionality | ☐ |

---

## Common Issues & Solutions

### Issue: Duplicate reactions after concurrent requests
**Solution:** Use atomic MongoDB operations ($addToSet where possible), add unique constraint on userId within emoji

### Issue: Read receipt not showing for user
**Solution:** Verify user is not the sender (senders don't have read receipts for own messages)

### Issue: Unread count not updating
**Solution:** Check index exists for query, verify read receipt was actually saved

### Issue: Emoji encoding issues in URL
**Solution:** Ensure proper URL encoding/decoding, test with various emoji types

### Issue: Performance degradation with many reactions
**Solution:** Implement limits on reactions per message, consider pagination for reaction details

### Issue: WebSocket events not received after REST action
**Solution:** Verify gateway method is called from service/controller, check room membership

---

Ready to proceed? Let me know when Phase 5 is complete and we'll move to Phase 6 (Typing Indicators & Presence).