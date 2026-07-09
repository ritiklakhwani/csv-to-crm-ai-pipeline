import { z } from 'zod';

/**
 * Environment validation. This runs once, at boot, and crashes the process with a readable list of
 * problems if anything is missing or malformed. A server that starts with a bad config and fails on
 * the first request is strictly worse than one that refuses to start.
 */

/** Env vars are always strings. Accept the four spellings people actually type. */
const boolFromEnv = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

    /** Comma-separated list of origins allowed to call this API. CORS is locked to these. */
    ALLOWED_ORIGIN: z.string().default('http://localhost:3000'),

    // --- LLM ---------------------------------------------------------------------------------
    /** Selects the adapter at boot. Adding 'anthropic' here plus one new file is the whole job. */
    LLM_PROVIDER: z.enum(['openai']).default('openai'),
    OPENAI_API_KEY: z.string().optional(),

    /** Phase 1, schema inference: one call per file, so favour accuracy over cost. */
    LLM_MODEL_INFERENCE: z.string().default('gpt-4.1-mini-2025-04-14'),
    /** Phase 2, batch row extraction: N calls per file, so cost and latency dominate. */
    LLM_MODEL_EXTRACTION: z.string().default('gpt-4.1-mini-2025-04-14'),

    /** Memoise LLM responses to disk, keyed by prompt hash. For local iteration only. */
    LLM_CACHE: boolFromEnv,
    /** Total attempts per batch, including the first. Backoff is exponential with full jitter. */
    LLM_MAX_RETRIES: z.coerce.number().int().min(1).max(5).default(3),
    /**
     * Reasoning models reject sampling parameters. The adapter drops `temperature` when the model
     * refuses it, so this stays safe across model families.
     */
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),

    // --- Pipeline tuning ---------------------------------------------------------------------
    BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(25),
    MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4),

    // --- Deployed-endpoint guards (the demo runs on a personal API key) ----------------------
    MAX_ROWS: z.coerce.number().int().min(1).default(2000),
    MAX_FILE_SIZE_MB: z.coerce.number().positive().default(5),
    /** Sliding window for the per-IP rate limit on the process endpoint. */
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when LLM_PROVIDER=openai',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Parse and validate the environment. Pass an explicit source in tests so they never depend on the
 * developer's real shell.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      return `${key}: ${issue.message}`;
    });
    throw new EnvValidationError(problems);
  }

  return result.data;
}

export function maxFileSizeBytes(env: Env): number {
  return Math.floor(env.MAX_FILE_SIZE_MB * 1024 * 1024);
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
