# Architecture

## Overview
Chat Service is a standalone microservice with REST + WebSocket interfaces.

Components:
- NestJS API (REST + WS)
- MongoDB (messages/conversations)
- Redis (presence, WS adapter, connection tracking)

## Data Model
- Users (cached via sync)
- Conversations (direct/group, participants)
- Messages (attachments, reactions, read receipts)

## Scaling
- Multiple instances supported via Socket.IO Redis adapter.
- Connection tracking stored in Redis.

## Security
- JWT validation for all public routes
- Internal API secret for user sync
- Webhook HMAC signatures

