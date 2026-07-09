import { createApp } from './app';
import { EnvValidationError, loadEnv } from './config/env';
import { loadDotenv } from './config/load-dotenv';
import { createLogger } from './utils/logger';
import { APP_VERSION } from './version';

/** Bootstrap only: read the environment, build the app, listen, shut down cleanly. */
function main(): void {
  loadDotenv();

  let env;
  try {
    env = loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(
        `\n${error.message}\n\nCopy backend/.env.example to backend/.env and fill it in.\n\n`,
      );
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger({
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV !== 'production',
  });

  const app = createApp({ env, logger });

  const server = app.listen(env.PORT, () => {
    logger.info('API listening', {
      port: env.PORT,
      version: APP_VERSION,
      nodeEnv: env.NODE_ENV,
      llmProvider: env.LLM_PROVIDER,
      modelInference: env.LLM_MODEL_INFERENCE,
      modelExtraction: env.LLM_MODEL_EXTRACTION,
      batchSize: env.BATCH_SIZE,
      maxConcurrency: env.MAX_CONCURRENCY,
      llmCache: env.LLM_CACHE,
    });
  });

  // Render sends SIGTERM on deploy. Finish in-flight requests, then exit; if a stuck SSE stream
  // refuses to close, force it after 10s rather than hanging the deploy.
  const shutdown = (signal: string): void => {
    logger.info('Shutting down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
