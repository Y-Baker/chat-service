# Messages API smoke tests

Test 1: Send message
```bash
curl -X POST http://localhost:4000/api/conversations/<conv_id>/messages \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, world!"
  }'
```

Test 2: Send with attachment
```bash
curl -X POST http://localhost:4000/api/conversations/<conv_id>/messages \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Check this file",
    "attachments": [
      { "externalFileId": "file_123", "label": "report.pdf" }
    ]
  }'
```

Test 3: Send reply
```bash
curl -X POST http://localhost:4000/api/conversations/<conv_id>/messages \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "I agree!",
    "replyTo": "<message_id>"
  }'
```

Test 4: Get message history
```bash
curl "http://localhost:4000/api/conversations/<conv_id>/messages?limit=20" \
  -H "Authorization: Bearer <jwt_token>"
```

Test 5: Paginate older
```bash
curl "http://localhost:4000/api/conversations/<conv_id>/messages?limit=20&before=<oldest_id>" \
  -H "Authorization: Bearer <jwt_token>"
```

Test 6: Paginate newer
```bash
curl "http://localhost:4000/api/conversations/<conv_id>/messages?limit=20&after=<newest_id>" \
  -H "Authorization: Bearer <jwt_token>"
```

Test 7: Edit message
```bash
curl -X PATCH http://localhost:4000/api/messages/<msg_id> \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, world! (edited)"
  }'
```

Test 8: Delete message
```bash
curl -X DELETE http://localhost:4000/api/messages/<msg_id> \
  -H "Authorization: Bearer <jwt_token>"
```

Test 9: Non-sender tries to edit
```bash
# Should return 403 Forbidden
```

Test 10: Non-participant tries to read
```bash
# Should return 403 Forbidden
```

Test 11: Verify lastMessage updates
```bash
curl http://localhost:4000/api/conversations/<conv_id> \
  -H "Authorization: Bearer <jwt_token>"
```
