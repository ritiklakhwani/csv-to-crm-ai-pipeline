import type { ApiErrorCode } from '@groweasy/shared';
import { AppError } from './app-error';

/**
 * Why every provider failure is normalised into one of these kinds:
 *
 * OpenAI's rate-limit error and Anthropic's rate-limit error share no common type. If the retry
 * loop branched on `instanceof OpenAI.RateLimitError`, the retry policy would be welded to OpenAI
 * and swapping providers would mean rewriting it. Normalising failures at the adapter boundary is
 * what lets `utils/retry.ts` live *above* the provider and stay provider-agnostic.
 */
export type LlmFailureKind =
  /** 429. Back off, honouring the provider's retry-after hint rather than guessing. */
  | 'rate_limit'
  /** 5xx or a transport failure. Back off. */
  | 'server'
  /** 4xx that will never succeed on retry: bad key, bad model, malformed schema. Fail fast. */
  | 'client'
  /** HTTP 200, but the payload did not satisfy the schema. Retry with the parse error appended. */
  | 'invalid_output'
  /** The model declined on safety grounds. Retrying the same prompt is pointless. */
  | 'refusal'
  /** `finish_reason: "length"`. The batch was too big — halve it and retry, do not skip it. */
  | 'truncated'
  /** The caller aborted, e.g. the user closed the tab. Not an error worth retrying. */
  | 'aborted';

const RETRYABLE: ReadonlySet<LlmFailureKind> = new Set<LlmFailureKind>([
  'rate_limit',
  'server',
  'invalid_output',
  'truncated',
]);

export function isRetryableKind(kind: LlmFailureKind): boolean {
  return RETRYABLE.has(kind);
}

export interface LlmProviderErrorOptions {
  retryAfterMs?: number;
  cause?: unknown;
  details?: unknown;
}

export class LlmProviderError extends AppError {
  readonly code: ApiErrorCode = 'LLM_PROVIDER_ERROR';
  readonly status = 502;
  override readonly expose = false;

  readonly kind: LlmFailureKind;
  /** Only set for `rate_limit`, and only when the provider told us how long to wait. */
  readonly retryAfterMs?: number;

  constructor(kind: LlmFailureKind, message: string, options: LlmProviderErrorOptions = {}) {
    super(
      message,
      options.details,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.kind = kind;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }

  get retryable(): boolean {
    return isRetryableKind(this.kind);
  }
}

export function isLlmProviderError(error: unknown): error is LlmProviderError {
  return error instanceof LlmProviderError;
}
