import { mappingPlanSchema, type CsvRow, type MappingPlan } from '@groweasy/shared';
import { LlmProviderError } from '../../errors';
import type { Logger } from '../../utils/logger';
import { withRetry } from '../../utils/retry';
import { sampleRows } from '../csv/analyze';
import { EMPTY_USAGE, type LlmProvider, type LlmUsage } from '../llm';
import { buildInferenceUserPrompt, INFERENCE_SYSTEM_PROMPT } from './prompts';

/**
 * Phase 1. One cheap call per file.
 *
 * It exists because some questions are undecidable from a single row. `05/13/2026` could be May 13th
 * or the 5th of the 13th month, and a batch of 25 rows may contain no evidence either way. Looking at
 * the whole file once settles it, and every batch then inherits the answer.
 */

export interface InferSchemaOptions {
  provider: LlmProvider;
  model: string;
  headers: readonly string[];
  rows: readonly CsvRow[];
  attempts: number;
  temperature: number;
  logger: Logger;
  cacheKey?: string;
  signal?: AbortSignal;
  sampleSize?: number;
}

export interface InferSchemaResult {
  plan: MappingPlan;
  usage: LlmUsage;
}

const EMPTY_PLAN: MappingPlan = {
  mappings: [],
  compositeColumns: [],
  unmappedColumns: [],
  detectedDateFormat: '',
  detectedDefaultCountryCode: '',
  notes: '',
};

export async function inferSchema(options: InferSchemaOptions): Promise<InferSchemaResult> {
  const { provider, model, headers, rows, attempts, temperature, logger, sampleSize = 8 } = options;

  const sample = sampleRows(rows, sampleSize);
  const user = buildInferenceUserPrompt(headers, sample);

  try {
    const result = await withRetry(
      () =>
        provider.completeJson({
          model,
          system: INFERENCE_SYSTEM_PROMPT,
          user,
          schema: { name: 'mapping_plan', zod: mappingPlanSchema },
          maxOutputTokens: 4096,
          temperature,
          ...(options.cacheKey === undefined ? {} : { cacheKey: options.cacheKey }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        }),
      {
        attempts,
        logger,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );

    logger.info('Phase 1 complete', {
      mappedColumns: result.data.mappings.length,
      dateFormat: result.data.detectedDateFormat,
      defaultCountryCode: result.data.detectedDefaultCountryCode,
      cached: result.cached,
    });

    return { plan: result.data, usage: result.usage };
  } catch (error) {
    // An aborted request means the user closed the tab. Everything else means Phase 1 failed, and
    // Phase 2 can still run — it just loses the whole-file hints. Degrading beats failing.
    if (error instanceof LlmProviderError && error.kind === 'aborted') throw error;

    logger.warn('Phase 1 failed; continuing without a mapping plan', {
      error: error instanceof Error ? error.message : String(error),
    });

    return { plan: EMPTY_PLAN, usage: EMPTY_USAGE };
  }
}
