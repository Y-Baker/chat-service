export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  auth: {
    secret: process.env.AUTH_SECRET,
  },
});
