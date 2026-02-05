# Troubleshooting

## WebSocket issues
- Token invalid: ensure JWT secret and issuer match master service.
- No events: confirm WS_PORT and ALLOWED_ORIGINS.

## Messages not delivered
- Check conversation membership rules.
- Verify Redis adapter is connected.

## Presence incorrect
- Ensure clients send `activity:ping` periodically.
- Check Redis connectivity.

## Webhooks not firing
- Verify `WEBHOOK_ENABLED=true`.
- Ensure `WEBHOOK_URL` and `WEBHOOK_SECRET` are set.

## Build or runtime failures
- Validate MongoDB and Redis URLs.
- Check for missing env vars.

