import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { Env } from '../config/env';
import { fail } from '../utils/api-response';

/**
 * The process endpoint is the only one that spends money, so it is the only one that is throttled.
 * The demo runs on a personal API key.
 */
export function processRateLimit(env: Env): RequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Without this the limiter would answer with its own plain-text body and break the envelope.
    handler: (_req, res) => {
      fail(
        res,
        429,
        'RATE_LIMITED',
        'Too many imports from this address. Wait a few minutes and try again.',
      );
    },
  });
}
