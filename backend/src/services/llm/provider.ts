import type { ZodType } from 'zod';

/**
 * The seam between the extraction pipeline and whichever LLM sits behind it. Nothing under
 * `services/extraction/` imports a vendor SDK — adding a provider is one new file and one enum value.
 *
 * `system` and `user` are separate because providers cache on an exact prefix match, so the static
 * part must be separable from the part that changes every batch.
 */
export interface LlmJsonRequest<T> {
  model: string;

  /** Static, cacheable prefix. Byte-identical across calls or the prefix cache never hits. */
  system: string;

  /** Variable suffix: the mapping plan and this batch's rows. Always last. */
  user: string;

  /** Constrains decoding: the model cannot emit a value outside this shape. */
  schema: { name: string; zod: ZodType<T> };

  maxOutputTokens: number;

  /** Omitted for models that reject sampling parameters. */
  temperature?: number;

  /** Groups a file's batches onto one machine so they share a warm prefix cache. */
  cacheKey?: string;

  /** Aborted when the client disconnects, so a closed tab stops burning tokens. */
  signal?: AbortSignal;
}

export interface LlmUsage {
  promptTokens: number;
  /** Prompt tokens served from the provider's automatic prefix cache. Higher is cheaper. */
  cachedPromptTokens: number;
  completionTokens: number;
}

export interface LlmJsonResult<T> {
  data: T;
  usage: LlmUsage;
  /** The model that actually served the request. */
  model: string;
  /** True when replayed from the local disk cache, in which case no tokens were spent. */
  cached: boolean;
}

export interface LlmProvider {
  readonly name: string;
  completeJson<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResult<T>>;
}

export const EMPTY_USAGE: LlmUsage = {
  promptTokens: 0,
  cachedPromptTokens: 0,
  completionTokens: 0,
};

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    cachedPromptTokens: a.cachedPromptTokens + b.cachedPromptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
  };
}
