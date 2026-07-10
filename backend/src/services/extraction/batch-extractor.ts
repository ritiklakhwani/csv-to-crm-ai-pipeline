import type { CrmRecord, CsvRow, MappingPlan, SkippedRecord } from '@groweasy/shared';
import { LlmProviderError } from '../../errors';
import { chunk } from '../../utils/chunk';
import type { Logger } from '../../utils/logger';
import { pLimit } from '../../utils/p-limit';
import { withRetry } from '../../utils/retry';
import { findEmptyColumns } from '../csv/analyze';
import { addUsage, EMPTY_USAGE, type LlmProvider, type LlmUsage } from '../llm';
import { parseDayFirstHint } from './normalizers';
import { validateRecord, type ValidationContext } from './post-validator';
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT } from './prompts';
import { extractionBatchSchema, type ExtractedRecord } from './schemas';

/**
 * Phase 2. Chunk the rows, run the batches with a concurrency limit, retry the ones that fail, and
 * make sure that no matter what the provider does, a row is either extracted or explicitly skipped.
 * An import must never hard-fail because one batch died.
 */

const BASE_MAX_OUTPUT_TOKENS = 8192;
const MAX_OUTPUT_TOKENS_CAP = 16_384;
/** Guards the halve-on-truncate recursion. 2^4 = a 25-row batch splits down to 2 rows. */
const MAX_SPLIT_DEPTH = 4;

interface IndexedRow {
  rowIndex: number;
  row: CsvRow;
}

export interface BatchCompleteEvent {
  batchIndex: number;
  totalBatches: number;
  processedBatches: number;
  processedRows: number;
  totalRows: number;
  records: CrmRecord[];
  skipped: SkippedRecord[];
}

export interface ExtractBatchesOptions {
  provider: LlmProvider;
  model: string;
  plan: MappingPlan;
  rows: readonly CsvRow[];
  batchSize: number;
  concurrency: number;
  attempts: number;
  temperature: number;
  logger: Logger;
  cacheKey?: string;
  signal?: AbortSignal;
  onBatchComplete?: (event: BatchCompleteEvent) => void;
}

export interface ExtractBatchesResult {
  records: CrmRecord[];
  skipped: SkippedRecord[];
  usage: LlmUsage;
  batches: { total: number; retried: number; failed: number };
}

export async function extractBatches(
  options: ExtractBatchesOptions,
): Promise<ExtractBatchesResult> {
  const { provider, model, plan, rows, batchSize, concurrency, attempts, logger } = options;

  const headers = Object.keys(rows[0] ?? {});
  const emptyColumns = new Set(findEmptyColumns(headers, rows));
  if (emptyColumns.size > 0) {
    // The only pruning that is safe: a column proven empty in every single row by a deterministic
    // scan. Never prune on the model's opinion of what looks like junk.
    logger.debug('Pruning columns that are empty in every row', {
      columns: [...emptyColumns],
    });
  }

  const validationContext = buildValidationContext(plan);
  const indexed: IndexedRow[] = rows.map((row, rowIndex) => ({ rowIndex, row }));
  const batches = chunk(indexed, batchSize);

  const recordByRow = new Map<number, CrmRecord>();
  const skippedByRow = new Map<number, SkippedRecord>();

  let usage = EMPTY_USAGE;
  let retried = 0;
  let failed = 0;
  let processedBatches = 0;
  let processedRows = 0;

  const visibleRow = (row: CsvRow): CsvRow =>
    Object.fromEntries(Object.entries(row).filter(([column]) => !emptyColumns.has(column)));

  /** One call to the model. `withRetry` decides whether a failure is worth another attempt. */
  const callModel = async (
    batch: IndexedRow[],
    onRetried: () => void,
  ): Promise<ExtractedRecord[]> => {
    const payload = batch.map((item) => ({ __row: item.rowIndex, ...visibleRow(item.row) }));

    const result = await withRetry(
      async (retryContext) => {
        const previous = retryContext.previousError;

        // A truncated response means the batch's JSON did not fit. Ask for more room before
        // resorting to splitting the batch.
        const maxOutputTokens =
          previous?.kind === 'truncated'
            ? Math.min(MAX_OUTPUT_TOKENS_CAP, BASE_MAX_OUTPUT_TOKENS * 2 ** retryContext.attempt)
            : BASE_MAX_OUTPUT_TOKENS;

        // Telling the model exactly what was wrong beats asking it to simply try again.
        const previousError = previous?.kind === 'invalid_output' ? previous.message : undefined;

        return provider.completeJson({
          model,
          system: EXTRACTION_SYSTEM_PROMPT,
          user: buildExtractionUserPrompt({
            plan,
            rows: payload,
            ...(previousError === undefined ? {} : { previousError }),
          }),
          schema: { name: 'crm_extraction', zod: extractionBatchSchema },
          maxOutputTokens,
          temperature: options.temperature,
          ...(options.cacheKey === undefined ? {} : { cacheKey: options.cacheKey }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
      },
      {
        attempts,
        logger,
        onRetry: onRetried,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );

    usage = addUsage(usage, result.usage);
    return result.data.records;
  };

  /** Retries, then halves the batch if the output still will not fit. */
  const extractRows = async (
    batch: IndexedRow[],
    onRetried: () => void,
    depth = 0,
  ): Promise<ExtractedRecord[]> => {
    try {
      return await callModel(batch, onRetried);
    } catch (error) {
      const truncated = error instanceof LlmProviderError && error.kind === 'truncated';
      if (!truncated || batch.length <= 1 || depth >= MAX_SPLIT_DEPTH) throw error;

      logger.warn('Output still truncated; halving the batch', { rows: batch.length, depth });
      onRetried();

      const middle = Math.ceil(batch.length / 2);
      const left = await extractRows(batch.slice(0, middle), onRetried, depth + 1);
      const right = await extractRows(batch.slice(middle), onRetried, depth + 1);
      return [...left, ...right];
    }
  };

  const runBatch = async (batch: IndexedRow[], batchIndex: number): Promise<void> => {
    const batchRecords: Array<{ rowIndex: number; record: CrmRecord }> = [];
    const batchSkipped: SkippedRecord[] = [];
    let wasRetried = false;
    const markRetried = (): void => {
      wasRetried = true;
    };

    try {
      const extracted = await extractRows(batch, markRetried);
      const byRow = indexByRow(extracted);

      // Row-count reconciliation. A model that quietly returns 23 records for 25 rows would
      // otherwise lose two leads without anybody noticing.
      let missing = batch.filter((item) => !byRow.has(item.rowIndex));
      if (missing.length > 0 && missing.length < batch.length) {
        logger.warn('Model returned fewer rows than were sent; re-extracting the missing ones', {
          batchIndex,
          sent: batch.length,
          returned: byRow.size,
          missing: missing.map((item) => item.rowIndex),
        });
        markRetried();

        try {
          for (const record of await extractRows(missing, markRetried)) {
            if (!byRow.has(record.__row)) byRow.set(record.__row, record);
          }
        } catch (error) {
          logger.warn('Re-extraction of missing rows failed', {
            batchIndex,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        missing = batch.filter((item) => !byRow.has(item.rowIndex));
      }

      if (missing.length === batch.length) {
        throw new LlmProviderError('invalid_output', 'Model returned none of the requested rows.');
      }

      for (const item of batch) {
        const record = byRow.get(item.rowIndex);
        if (!record) {
          batchSkipped.push({
            rowIndex: item.rowIndex,
            raw: item.row,
            skip_reason: 'the model did not return this row',
          });
          continue;
        }

        const outcome = validateRecord(record, item.row, item.rowIndex, validationContext);
        if (outcome.kind === 'record') {
          batchRecords.push({ rowIndex: item.rowIndex, record: outcome.record });
        } else {
          batchSkipped.push(outcome.skipped);
        }
      }
    } catch (error) {
      if (error instanceof LlmProviderError && error.kind === 'aborted') throw error;

      failed += 1;
      logger.error('Batch failed; its rows become skipped records', {
        batchIndex,
        rows: batch.length,
        error: error instanceof Error ? error.message : String(error),
      });

      // The whole point of this file: one poisoned batch cannot kill the import.
      for (const item of batch) {
        batchSkipped.push({
          rowIndex: item.rowIndex,
          raw: item.row,
          skip_reason: `AI extraction failed after ${attempts} attempts`,
        });
      }
    }

    if (wasRetried) retried += 1;

    // Batches finish out of order, so results are keyed by row index and re-sorted at the end.
    for (const entry of batchRecords) recordByRow.set(entry.rowIndex, entry.record);
    for (const entry of batchSkipped) skippedByRow.set(entry.rowIndex, entry);

    processedBatches += 1;
    processedRows += batch.length;

    options.onBatchComplete?.({
      batchIndex,
      totalBatches: batches.length,
      processedBatches,
      processedRows,
      totalRows: rows.length,
      records: batchRecords.map((entry) => entry.record),
      skipped: batchSkipped,
    });
  };

  // Dispatch the first batch alone. The provider caches on an exact prefix match, and concurrent
  // requests that all miss would each pay to write the same ~1.5k-token preamble.
  const [first, ...rest] = batches;
  if (first) await runBatch(first, 0);

  const limit = pLimit(concurrency);
  await Promise.all(rest.map((batch, offset) => limit(() => runBatch(batch, offset + 1))));

  const records: CrmRecord[] = [];
  const skipped: SkippedRecord[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const record = recordByRow.get(rowIndex);
    if (record) records.push(record);
    const skip = skippedByRow.get(rowIndex);
    if (skip) skipped.push(skip);
  }

  return {
    records,
    skipped,
    usage,
    batches: { total: batches.length, retried, failed },
  };
}

function indexByRow(records: readonly ExtractedRecord[]): Map<number, ExtractedRecord> {
  const byRow = new Map<number, ExtractedRecord>();
  for (const record of records) {
    if (!byRow.has(record.__row)) byRow.set(record.__row, record);
  }
  return byRow;
}

function buildValidationContext(plan: MappingPlan): ValidationContext {
  const dayFirst = parseDayFirstHint(plan.detectedDateFormat);
  const defaultCountryCode = plan.detectedDefaultCountryCode.trim();

  return {
    ...(dayFirst === undefined ? {} : { dayFirst }),
    ...(defaultCountryCode ? { defaultCountryCode } : {}),
  };
}
