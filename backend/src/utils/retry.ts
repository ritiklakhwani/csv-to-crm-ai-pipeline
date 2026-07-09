import { isRetryableKind, LlmProviderError } from '../errors';
import type { Logger } from './logger';

/**
 * The retry policy lives here rather than in the OpenAI adapter, and branches on `LlmFailureKind`
 * rather than on a vendor error class. That is the whole reason the adapter normalises its failures.
 */

export interface RetryContext {
  /** 1-based: the first call is attempt 1. */
  attempt: number;
  /**
   * Why the previous attempt failed, so the caller can adapt the next one — append the parse error
   * to the prompt after `invalid_output`, or halve the batch after `truncated`.
   */
  previousError?: LlmProviderError;
}

export interface RetryOptions {
  /** Total attempts including the first. */
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  logger?: Logger;
  onRetry?: (info: { attempt: number; delayMs: number; error: LlmProviderError }) => void;
  /** Seams for tests: no real clock, no real randomness. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 20_000;

export async function withRetry<T>(
  fn: (ctx: RetryContext) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    attempts,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    signal,
    logger,
    onRetry,
    sleep = defaultSleep,
    random = Math.random,
  } = options;

  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError('attempts must be a positive integer');
  }

  let previousError: LlmProviderError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(signal);

    const ctx: RetryContext =
      previousError === undefined ? { attempt } : { attempt, previousError };

    try {
      return await fn(ctx);
    } catch (error) {
      // Anything that is not a normalised provider failure is a bug in our own code. Retrying it
      // would just run the bug again.
      if (!(error instanceof LlmProviderError)) throw error;

      previousError = error;

      if (!isRetryableKind(error.kind)) throw error;
      if (attempt === attempts) throw error;

      const delayMs = nextDelayMs(error, attempt, baseDelayMs, maxDelayMs, random);

      logger?.warn('Retrying after LLM failure', {
        attempt,
        of: attempts,
        kind: error.kind,
        delayMs,
      });
      onRetry?.({ attempt, delayMs, error });

      await sleep(delayMs, signal);
    }
  }

  // The loop always returns or throws; TypeScript cannot see that.
  throw new LlmProviderError('server', 'Retry loop exited without a result.');
}

/**
 * Full jitter: a delay drawn uniformly from [0, ceiling), where the ceiling doubles each attempt.
 * Plain exponential backoff synchronises every client onto the same retry instants and re-creates
 * the thundering herd it was meant to prevent.
 *
 * A 429 is the exception: the provider told us exactly how long to wait, so guessing is worse.
 */
function nextDelayMs(
  error: LlmProviderError,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  if (error.kind === 'rate_limit' && error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, maxDelayMs);
  }

  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * ceiling);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): LlmProviderError {
  return new LlmProviderError('aborted', 'Aborted before the next attempt.');
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
