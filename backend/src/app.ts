import compression from 'compression';
import cors from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import { allowedOrigins, maxFileSizeBytes, type Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { healthRouter } from './routes/health.routes';
import { importsRouter } from './routes/imports.routes';
import type { ImportStore } from './services/import-store';
import type { LlmProvider } from './services/llm';
import type { Logger } from './utils/logger';

export interface CreateAppOptions {
  env: Env;
  logger: Logger;
  store: ImportStore;
  provider: LlmProvider;
}

/**
 * `compression()` buffers the response body, which silently breaks Server-Sent Events: the client
 * receives nothing until the stream ends, which for a long import is the one thing streaming was
 * supposed to prevent. This is a genuinely maddening bug to diagnose, so the SSE route is skipped
 * explicitly by path rather than relying on the Content-Type filter alone.
 */
function isStreamingRequest(req: Request): boolean {
  return req.method === 'POST' && req.path.endsWith('/process') && req.query['mode'] !== 'sync';
}

/**
 * Assembles the Express app without starting it, so tests can drive it through supertest and the
 * bootstrap in `index.ts` stays a dozen lines of process wiring.
 */
export function createApp({ env, logger, store, provider }: CreateAppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  // Render terminates TLS at a proxy. Without this, every request appears to originate from the
  // proxy and the per-IP rate limit would throttle all users as one.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins(env),
      methods: ['GET', 'POST'],
      credentials: false,
    }),
  );

  const compress = compression({
    // Second line of defence, in case a future streaming route is added elsewhere.
    filter: (req, res) => {
      const contentType = res.getHeader('Content-Type');
      if (typeof contentType === 'string' && contentType.includes('text/event-stream'))
        return false;
      return compression.filter(req, res);
    },
  });
  app.use((req, res, next) => (isStreamingRequest(req) ? next() : compress(req, res, next)));

  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger(logger));

  app.use('/api/v1', healthRouter());
  app.use('/api/v1', importsRouter({ env, logger, store, provider }));

  app.use(notFoundHandler());
  app.use(
    errorHandler({
      logger,
      isProduction: env.NODE_ENV === 'production',
      maxFileBytes: maxFileSizeBytes(env),
    }),
  );

  return app;
}
