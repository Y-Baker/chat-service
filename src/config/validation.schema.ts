import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  MONGODB_URI: Joi.string().required(),
  REDIS_URL: Joi.string().uri().required(),
  AUTH_SECRET: Joi.string().min(32).required(),
});
