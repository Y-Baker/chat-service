export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    wsPort: parseInt(process.env.WS_PORT ?? '3001', 10),
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  auth: {
    jwtSecret: process.env.AUTH_JWT_SECRET,
    jwtIssuer: process.env.AUTH_JWT_ISSUER,
  },
  internal: {
    apiSecret: process.env.INTERNAL_API_SECRET,
  },
  presence: {
    typingTtl: parseInt(process.env.PRESENCE_TYPING_TTL ?? '5', 10),
    recordingTtl: parseInt(process.env.PRESENCE_RECORDING_TTL ?? '30', 10),
    awayThreshold: parseInt(process.env.PRESENCE_AWAY_THRESHOLD ?? `${5 * 60}`, 10),
    lastSeenTtl: parseInt(process.env.PRESENCE_LAST_SEEN_TTL ?? `${30 * 24 * 60 * 60}`, 10),
    activityCheckInterval: parseInt(process.env.PRESENCE_ACTIVITY_CHECK_INTERVAL ?? '60', 10),
  },
  webhook: {
    url: process.env.WEBHOOK_URL,
    secret: process.env.WEBHOOK_SECRET,
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()) ?? [],
  },
});
