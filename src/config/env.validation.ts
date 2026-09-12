import * as Joi from 'joi';

/**
 * Fails the process fast at boot if required config is missing, rather than
 * discovering a blank TURN secret the first time a call needs a relay.
 */
export const envValidationSchema = Joi.object({
  PORT: Joi.number().port().default(3001),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  CORS_ORIGIN: Joi.string().default('*'),
  SEARCH_TIMEOUT_MS: Joi.number().positive().default(50000),
  HEARTBEAT_INTERVAL_MS: Joi.number().positive().default(15000),
  STUN_URLS: Joi.string().default('stun:stun.l.google.com:19302'),
  TURN_URLS: Joi.string().allow('').default(''),
  TURN_SHARED_SECRET: Joi.string().min(8).required(),
  TURN_CREDENTIAL_TTL_SECONDS: Joi.number().positive().default(3600),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'log', 'debug', 'verbose')
    .default('debug'),
});
