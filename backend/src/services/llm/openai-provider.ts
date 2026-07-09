import OpenAI from 'openai';
import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  ContentFilterFinishReasonError,
  LengthFinishReasonError,
  RateLimitError,
} from 'openai/error';
import { zodResponseFormat } from 'openai/helpers/zod';
import { ZodError } from 'zod';
import { LlmProviderError } from '../../errors';
import type { Logger } from '../../utils/logger';
import type { LlmJsonRequest, LlmJsonResult, LlmProvider } from './provider';

/** The one file in the codebase that is allowed to know OpenAI exists. */

export interface OpenAiProviderOptions {
  apiKey: string;
  logger: Logger;
  /** Per-request ceiling. A single batch that takes 90s is a batch that is never coming back. */
  timeoutMs?: number;
}

export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';

  private readonly client: OpenAI;
  private readonly logger: Logger;

  /**
   * Reasoning models reject `temperature` with a 400. Rather than maintaining a hardcoded list of
   * which models accept it, we try once, notice the rejection, and stop sending it. The flag is
   * per-process, so the cost is a single wasted request per deploy.
   */
  private temperatureRejected = false;

  constructor({ apiKey, logger, timeoutMs = 90_000 }: OpenAiProviderOptions) {
    this.logger = logger;
    this.client = new OpenAI({
      apiKey,
      timeout: timeoutMs,
      // The SDK retries 429/5xx on its own. Combined with our per-batch retry loop that is a 9x
      // worst case, and it would never retry a schema-validation failure anyway (those return
      // HTTP 200). We own the entire retry policy in utils/retry.ts.
      maxRetries: 0,
    });
  }

  async completeJson<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
    try {
      return await this.send(request, this.temperatureRejected);
    } catch (error) {
      if (!this.temperatureRejected && isTemperatureRejection(error)) {
        this.temperatureRejected = true;
        this.logger.warn('Model rejected the temperature parameter; retrying without it', {
          model: request.model,
        });
        try {
          return await this.send(request, true);
        } catch (retryError) {
          throw this.normalise(retryError, request);
        }
      }
      throw this.normalise(error, request);
    }
  }

  private async send<T>(
    request: LlmJsonRequest<T>,
    dropTemperature: boolean,
  ): Promise<LlmJsonResult<T>> {
    const completion = await this.client.chat.completions.parse(
      {
        model: request.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        // `strict: true` is set by the helper. Decoding is constrained to the schema, which is what
        // makes it structurally impossible for the model to emit a 5th crm_status value.
        response_format: zodResponseFormat(request.schema.zod, request.schema.name),
        max_completion_tokens: request.maxOutputTokens,
        ...(dropTemperature || request.temperature === undefined
          ? {}
          : { temperature: request.temperature }),
        ...(request.cacheKey === undefined ? {} : { prompt_cache_key: request.cacheKey }),
      },
      request.signal === undefined ? {} : { signal: request.signal },
    );

    const choice = completion.choices[0];
    if (!choice) {
      throw new LlmProviderError('invalid_output', 'Model returned no choices.');
    }

    if (choice.message.refusal) {
      throw new LlmProviderError('refusal', choice.message.refusal);
    }

    if (choice.finish_reason === 'length') {
      throw new LlmProviderError(
        'truncated',
        'Model hit the output token limit before completing the JSON.',
      );
    }

    const parsed = choice.message.parsed;
    if (parsed === null || parsed === undefined) {
      throw new LlmProviderError('invalid_output', 'Model returned no parseable content.', {
        details: { rawPreview: choice.message.content?.slice(0, 500) ?? null },
      });
    }

    const usage = completion.usage;

    return {
      data: parsed,
      model: completion.model,
      cached: false,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        cachedPromptTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * Collapse every failure mode OpenAI can produce into a `LlmFailureKind`. This is the whole point
   * of the adapter: the retry loop upstream branches on the kind, never on a vendor error class.
   */
  private normalise(error: unknown, request: LlmJsonRequest<unknown>): LlmProviderError {
    if (error instanceof LlmProviderError) return error;

    if (error instanceof APIUserAbortError) {
      return new LlmProviderError('aborted', 'Request aborted by the caller.', { cause: error });
    }

    // The SDK's parse helper throws these instead of returning a completion.
    if (error instanceof LengthFinishReasonError) {
      return new LlmProviderError('truncated', 'Model hit the output token limit.', {
        cause: error,
      });
    }

    if (error instanceof ContentFilterFinishReasonError) {
      return new LlmProviderError('refusal', 'Request was blocked by the content filter.', {
        cause: error,
      });
    }

    if (error instanceof RateLimitError) {
      const retryAfterMs = readRetryAfterMs(error);
      return new LlmProviderError('rate_limit', 'Rate limited by OpenAI.', {
        cause: error,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    }

    // Covers timeouts, DNS failures and socket resets.
    if (error instanceof APIConnectionError) {
      return new LlmProviderError('server', `Could not reach OpenAI: ${error.message}`, {
        cause: error,
      });
    }

    // The schema was satisfied structurally but Zod rejected it, or the JSON was malformed.
    if (error instanceof ZodError) {
      return new LlmProviderError('invalid_output', formatZodIssues(error), { cause: error });
    }
    if (error instanceof SyntaxError) {
      return new LlmProviderError(
        'invalid_output',
        `Model emitted invalid JSON: ${error.message}`,
        {
          cause: error,
        },
      );
    }

    if (error instanceof APIError) {
      const status = error.status ?? 0;

      // 408 and 409 are transient; everything else in the 4xx range is a bug in our request that
      // no amount of retrying will fix (bad key, unknown model, schema the API refuses).
      const kind = status >= 500 || status === 408 || status === 409 ? 'server' : 'client';

      return new LlmProviderError(kind, `OpenAI API error ${status}: ${error.message}`, {
        cause: error,
        details: { status, model: request.model },
      });
    }

    return new LlmProviderError('server', `Unexpected LLM failure: ${describe(error)}`, {
      cause: error,
    });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatZodIssues(error: ZodError): string {
  const issues = error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return `Model output failed schema validation: ${issues}`;
}

/**
 * OpenAI sends `retry-after-ms` (and sometimes `retry-after` in seconds). Honouring it beats a
 * blind exponential backoff, which either hammers the API early or waits far too long.
 */
function readRetryAfterMs(error: RateLimitError): number | undefined {
  const headers = error.headers;
  if (!headers) return undefined;

  const ms = headers.get('retry-after-ms');
  if (ms) {
    const parsed = Number(ms);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  const seconds = headers.get('retry-after');
  if (seconds) {
    const parsed = Number(seconds);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed * 1000;
  }

  return undefined;
}

/** A 400 naming `temperature` as the offending parameter. */
function isTemperatureRejection(error: unknown): boolean {
  if (!(error instanceof APIError) || error.status !== 400) return false;
  if (error.param === 'temperature') return true;
  return (
    /temperature/i.test(error.message) &&
    /unsupported|not supported|unrecognized/i.test(error.message)
  );
}
