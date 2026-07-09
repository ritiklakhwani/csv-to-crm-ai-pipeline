import type { HealthResult } from '@groweasy/shared';
import { Router } from 'express';
import { APP_VERSION } from '../version';
import { ok } from '../utils/api-response';

/** Render polls this to decide whether the instance is live. Keep it free of side effects. */
export function healthRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const data: HealthResult = {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      version: APP_VERSION,
    };
    ok(res, data);
  });

  return router;
}
