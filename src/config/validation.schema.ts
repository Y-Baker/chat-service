import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  WS_PORT: Joi.number().port().default(3001),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  MONGODB_URI: Joi.string().required(),
  REDIS_URL: Joi.string().uri().required(),
  AUTH_JWT_SECRET: Joi.string().min(32).required(),
  AUTH_JWT_ISSUER: Joi.string().default('master-service'),
  INTERNAL_API_SECRET: Joi.string().min(32).required(),
  WEBHOOK_URL: Joi.string().uri().optional(),
  WEBHOOK_SECRET: Joi.string().min(32).optional(),
  ALLOWED_ORIGINS: Joi.string().optional(),
});
