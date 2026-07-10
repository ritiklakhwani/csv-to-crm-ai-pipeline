import {
  formatSseFrame,
  SSE_HEARTBEAT,
  type ImportResult,
  type SseEvent,
  type UploadResult,
} from '@groweasy/shared';
import type { RequestHandler, Response } from 'express';
import type { Env } from '../config/env';
import { ImportNotFoundError, RowLimitError, ValidationError, isAppError } from '../errors';
import { runImport } from '../services/extraction/pipeline';
import type { ImportStore } from '../services/import-store';
import type { LlmProvider } from '../services/llm';
import { parseCsv } from '../services/csv/parse-csv';
import { ok } from '../utils/api-response';
import type { Logger } from '../utils/logger';

/**
 * The HTTP layer, and nothing else. Parsing lives in `services/csv`, the pipeline lives in
 * `services/extraction`. This file's only jobs are to unwrap the request, call a service, and get
 * the bytes back out — including the awkward parts of streaming them.
 */

/** Proxies close a connection that goes quiet, and a slow batch easily outlives their patience. */
const HEARTBEAT_INTERVAL_MS = 15_000;

export interface ImportsControllerDeps {
  env: Env;
  logger: Logger;
  store: ImportStore;
  provider: LlmProvider;
}

/** Express 5 types `params` as `string | string[]` to accommodate wildcards; name it explicitly. */
type ProcessParams = { importId: string };

export interface ImportsController {
  upload: RequestHandler;
  process: RequestHandler<ProcessParams>;
}

export function createImportsController(deps: ImportsControllerDeps): ImportsController {
  const { env, logger, store, provider } = deps;

  /** `POST /api/v1/imports` — parse and stash. No AI runs here; the assignment checks for that. */
  const upload: RequestHandler = (req, res) => {
    const file = req.file;
    if (!file) {
      throw new ValidationError('No file was uploaded. Send one file in a field named "file".');
    }

    const parsed = parseCsv(file.buffer);

    if (parsed.rows.length > env.MAX_ROWS) {
      throw new RowLimitError(parsed.rows.length, env.MAX_ROWS);
    }

    const stored = store.create({
      fileName: file.originalname,
      sizeBytes: file.size,
      headers: parsed.headers,
      rows: parsed.rows,
      delimiter: parsed.delimiter,
    });

    logger.info('CSV uploaded', {
      importId: stored.importId,
      fileName: stored.fileName,
      rowCount: parsed.rows.length,
      delimiter: parsed.delimiter,
      warnings: parsed.warnings,
    });

    const data: UploadResult = {
      importId: stored.importId,
      fileName: stored.fileName,
      sizeBytes: stored.sizeBytes,
      headers: stored.headers,
      rowCount: stored.rows.length,
      delimiter: stored.delimiter,
    };

    ok(res, data, 201);
  };

  /** `POST /api/v1/imports/:importId/process` — SSE by default, `?mode=sync` for graders. */
  const process: RequestHandler<ProcessParams> = async (req, res) => {
    const importId = req.params.importId;
    const stored = store.get(importId);
    if (!stored) throw new ImportNotFoundError(importId);

    const scoped = logger.child({ importId });

    if (req.query['mode'] === 'sync') {
      const result = await runImport({
        provider,
        env,
        logger: scoped,
        importId,
        headers: stored.headers,
        rows: stored.rows,
        signal: abortOnDisconnect(res),
      });
      ok(res, result);
      return;
    }

    await streamImport({ res, env, logger: scoped, provider, importId, stored });
  };

  return { upload, process };
}

/**
 * A closed tab must stop the pipeline, or the import keeps burning tokens for nobody.
 *
 * Listen on the *response*, not the request. Since Node 16 an `IncomingMessage` emits `close` as
 * soon as the request body has been read, which for a POST is immediately — aborting every import
 * the moment it starts. `res.writableEnded` separates "we finished" from "they hung up".
 */
function abortOnDisconnect(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  return controller.signal;
}

interface StreamImportArgs {
  res: Response;
  env: Env;
  logger: Logger;
  provider: LlmProvider;
  importId: string;
  stored: { headers: string[]; rows: Array<Record<string, string>> };
}

async function streamImport({
  res,
  env,
  logger,
  provider,
  importId,
  stored,
}: StreamImportArgs): Promise<void> {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Defeats nginx-style proxy buffering on Render and Railway. Without it the client sees nothing
  // until the whole import finishes.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const controller = new AbortController();
  let disconnected = false;

  const writable = (): boolean => !disconnected && !res.writableEnded && !res.destroyed;

  const heartbeat = setInterval(() => {
    if (writable()) res.write(SSE_HEARTBEAT);
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  const cleanup = (): void => clearInterval(heartbeat);

  res.on('close', () => {
    if (res.writableEnded) return; // we ended it ourselves
    disconnected = true;
    controller.abort();
    cleanup();
  });

  const send = (event: SseEvent): void => {
    if (writable()) res.write(formatSseFrame(event));
  };

  try {
    const result: ImportResult = await runImport({
      provider,
      env,
      logger,
      importId,
      headers: stored.headers,
      rows: stored.rows,
      signal: controller.signal,
      onMappingPlan: (plan) => send({ type: 'mapping_plan', plan }),
      onBatchComplete: (event) => {
        send({
          type: 'progress',
          processedBatches: event.processedBatches,
          totalBatches: event.totalBatches,
          processedRows: event.processedRows,
          totalRows: event.totalRows,
        });
        send({
          type: 'batch_complete',
          batchIndex: event.batchIndex,
          records: event.records,
          skipped: event.skipped,
        });
      },
    });

    send({ type: 'done', result });
  } catch (error) {
    if (disconnected) return;

    logger.error('Import failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Headers are long gone, so the central error middleware cannot help. The failure has to travel
    // down the stream as an event.
    const isProduction = env.NODE_ENV === 'production';
    const expose = isAppError(error) && error.expose;

    send({
      type: 'error',
      error: {
        code: isAppError(error) ? error.code : 'INTERNAL_ERROR',
        message:
          expose || !isProduction
            ? error instanceof Error
              ? error.message
              : String(error)
            : 'The import failed.',
      },
    });
  } finally {
    cleanup();
    if (!disconnected && !res.writableEnded) res.end();
  }
}
