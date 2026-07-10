import type { CsvRow, ImportResult, MappingPlan } from '@groweasy/shared';
import type { Env } from '../../config/env';
import type { Logger } from '../../utils/logger';
import { addUsage, type LlmProvider } from '../llm';
import { extractBatches, type BatchCompleteEvent } from './batch-extractor';
import { inferSchema } from './schema-inference';

/**
 * The whole import, in one function: infer the file's shape once, then extract every row in batches.
 * Controllers call this; it knows nothing about HTTP.
 */

export interface RunImportOptions {
  provider: LlmProvider;
  env: Env;
  logger: Logger;
  importId: string;
  headers: readonly string[];
  rows: readonly CsvRow[];
  signal?: AbortSignal;
  onMappingPlan?: (plan: MappingPlan) => void;
  onBatchComplete?: (event: BatchCompleteEvent) => void;
}

export async function runImport(options: RunImportOptions): Promise<ImportResult> {
  const { provider, env, logger, importId, headers, rows } = options;
  const startedAt = Date.now();

  const inference = await inferSchema({
    provider,
    model: env.LLM_MODEL_INFERENCE,
    headers,
    rows,
    attempts: env.LLM_MAX_RETRIES,
    temperature: env.LLM_TEMPERATURE,
    logger,
    // Keeps a file's calls on one machine, so they share a warm prefix cache.
    cacheKey: importId,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  options.onMappingPlan?.(inference.plan);

  const extraction = await extractBatches({
    provider,
    model: env.LLM_MODEL_EXTRACTION,
    plan: inference.plan,
    rows,
    batchSize: env.BATCH_SIZE,
    concurrency: env.MAX_CONCURRENCY,
    attempts: env.LLM_MAX_RETRIES,
    temperature: env.LLM_TEMPERATURE,
    logger,
    cacheKey: importId,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.onBatchComplete === undefined ? {} : { onBatchComplete: options.onBatchComplete }),
  });

  const usage = addUsage(inference.usage, extraction.usage);
  const processingTimeMs = Date.now() - startedAt;

  logger.info('Import complete', {
    importId,
    totalRows: rows.length,
    imported: extraction.records.length,
    skipped: extraction.skipped.length,
    processingTimeMs,
    batches: extraction.batches,
    promptTokens: usage.promptTokens,
    cachedPromptTokens: usage.cachedPromptTokens,
    completionTokens: usage.completionTokens,
  });

  return {
    summary: {
      totalRows: rows.length,
      imported: extraction.records.length,
      skipped: extraction.skipped.length,
      processingTimeMs,
      batches: extraction.batches,
      tokens: {
        prompt: usage.promptTokens,
        cachedPrompt: usage.cachedPromptTokens,
        completion: usage.completionTokens,
      },
    },
    mappingPlan: inference.plan,
    records: extraction.records,
    skipped: extraction.skipped,
  };
}
