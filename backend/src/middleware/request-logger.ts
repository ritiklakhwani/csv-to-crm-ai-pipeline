import type { RequestHandler } from 'express';
import type { Logger } from '../utils/logger';

/** One line per completed request. Logged on `finish` so the status code is known. */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      logger[level](`${req.method} ${req.originalUrl} ${res.statusCode}`, {
        durationMs: Math.round(durationMs),
      });
    });

    next();
  };
}
