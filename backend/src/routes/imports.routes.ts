import { Router } from 'express';
import type { Env } from '../config/env';
import { createImportsController } from '../controllers/imports.controller';
import { processRateLimit } from '../middleware/rate-limit';
import { uploadMiddleware } from '../middleware/upload';
import type { ImportStore } from '../services/import-store';
import type { LlmProvider } from '../services/llm';
import type { Logger } from '../utils/logger';

export interface ImportsRouterDeps {
  env: Env;
  logger: Logger;
  store: ImportStore;
  provider: LlmProvider;
}

/** Routes only. Express 5 forwards a rejected async handler to the error middleware on its own. */
export function importsRouter(deps: ImportsRouterDeps): Router {
  const router = Router();
  const controller = createImportsController(deps);

  router.post('/imports', uploadMiddleware(deps.env), controller.upload);
  router.post('/imports/:importId/process', processRateLimit(deps.env), controller.process);

  return router;
}
