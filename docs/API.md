# REST API Reference

Base URL (development): `http://localhost:3000/api`

## Authentication
All public endpoints require `Authorization: Bearer <jwt>`.
Internal endpoints require `X-Internal-Secret: <secret>`.

## Error Format
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

## Health

### GET /health
Returns service health status.

## Users (Internal)

### POST /users/sync
Sync a user profile from the master service.

Body:
```json
{ 
  "externalUserId": "user_1", 
  "displayName": "User One", 
  "avatarUrl": "https://...",
  "metadata": { "role": "admin", "department": "engineering" }
}
```

Response includes `metadata` field.

### POST /users/sync/batch
```json
{ 
  "users": [ 
    { 
      "externalUserId": "user_1", 
      "displayName": "User One",
      "metadata": { "role": "admin" }
    } 
  ] 
}
```

### GET /users/:externalUserId
### DELETE /users/:externalUserId

---

## Conversations

### POST /conversations
Create direct or group conversation.
```json
{ 
  "type": "direct", 
  "participantIds": ["user_1","user_2"],
  "metadata": { "source": "app", "priority": "high" }
}
```

Response includes `metadata` field.

### GET /conversations
Query params: `limit`, `cursor`, `type`.

### GET /conversations/:id
### DELETE /conversations/:id
Optional query: `mode=leave|delete`.

### POST /conversations/:id/participants
```json
{ "externalUserId": "user_3", "role": "member" }
```

### PATCH /conversations/:id/participants/:userId
```json
{ "role": "admin" }
```

### DELETE /conversations/:id/participants/:userId

---

## Messages

### POST /conversations/:conversationId/messages
```json
{ 
  "content": "Hello", 
  "attachments": [{"externalFileId":"file_1"}],
  "metadata": { "clientId": "abc123", "platform": "web" }
}
```

Response includes `metadata` field.

### GET /conversations/:conversationId/messages
Query params: `limit`, `before`, `after`, `includeDeleted`.

### GET /messages/:id
### PATCH /messages/:id
```json
{ "content": "Edited" }
```

### DELETE /messages/:id

---

## Reactions

### POST /messages/:messageId/reactions
```json
{ "emoji": "👍" }
```

### DELETE /messages/:messageId/reactions/:emoji
### GET /messages/:messageId/reactions

---

## Read Receipts

### PUT /messages/:messageId/read
### PUT /conversations/:conversationId/read
```json
{ "upToMessageId": "..." }
```

### GET /messages/:messageId/read
### GET /conversations/:conversationId/unread-count

---

## Presence

### GET /users/:userId/presence
### GET /conversations/:conversationId/presence
### POST /presence/batch
```json
{ "userIds": ["user_1","user_2"] }
```
