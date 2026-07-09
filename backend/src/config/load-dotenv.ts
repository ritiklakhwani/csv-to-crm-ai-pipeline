import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `backend/.env` when present, using Node's built-in loader — no `dotenv` dependency.
 *
 * In Docker and on Render the environment is injected directly and no `.env` exists, which is why
 * a missing file is not an error.
 */
export function loadDotenv(cwd: string = process.cwd()): void {
  const envFile = resolve(cwd, '.env');
  if (!existsSync(envFile)) return;
  if (typeof process.loadEnvFile !== 'function') return; // Node < 20.12
  process.loadEnvFile(envFile);
}
