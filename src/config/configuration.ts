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
  webhook: {
    url: process.env.WEBHOOK_URL,
    secret: process.env.WEBHOOK_SECRET,
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()) ?? [],
  },
});
