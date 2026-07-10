import type { ApiResponse, ImportResult, UploadResult } from '@groweasy/shared';
import type express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loadEnv, type Env } from '../../src/config/env';
import { ImportStore } from '../../src/services/import-store';
import type { LlmProvider } from '../../src/services/llm';
import { silentLogger } from '../../src/utils/logger';
import { createFakeProvider, echoRecords } from '../helpers/fake-provider';

const CSV = [
  'Client,Mob No.,E-mail,Date,Status',
  'Rajesh Patel,9876543210,rajesh@x.com,13/05/2026,Hot',
  'Sarah Johnson,9876543211,sarah@x.com,14/05/2026,No answer',
  'Walk-in visitor,,,,',
].join('\n');

function makeEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    OPENAI_API_KEY: 'sk-test-not-a-real-key',
    LLM_MAX_RETRIES: '1', // no sleeping in tests
    BATCH_SIZE: '2',
    MAX_CONCURRENCY: '2',
    MAX_ROWS: '10',
    RATE_LIMIT_MAX: '1000',
    ...overrides,
  } as NodeJS.ProcessEnv);
}

function makeApp(provider: LlmProvider, env = makeEnv()): { app: express.Express } {
  const store = new ImportStore();
  return { app: createApp({ env, logger: silentLogger, store, provider }) };
}

async function upload(app: express.Express, csv = CSV, filename = 'leads.csv') {
  return request(app).post('/api/v1/imports').attach('file', Buffer.from(csv), filename);
}

describe('POST /api/v1/imports', () => {
  it('parses the file and returns an importId without calling the AI', async () => {
    const provider = createFakeProvider();
    const { app } = makeApp(provider);

    const response = await upload(app);
    expect(response.status).toBe(201);

    const body = response.body as ApiResponse<UploadResult>;
    expect(body.success).toBe(true);
    if (!body.success) return;

    expect(body.data.rowCount).toBe(3);
    expect(body.data.headers).toEqual(['Client', 'Mob No.', 'E-mail', 'Date', 'Status']);
    expect(body.data.delimiter).toBe(',');
    expect(body.data.importId).toMatch(/^[0-9a-f-]{36}$/);

    // The assignment explicitly checks that no AI processing happens on upload.
    expect(provider.calls.inference).toBe(0);
    expect(provider.calls.extraction).toBe(0);
  });

  it('rejects a non-csv file', async () => {
    const { app } = makeApp(createFakeProvider());
    const response = await upload(app, 'not,a,csv', 'notes.txt');

    expect(response.status).toBe(415);
    const body = response.body as ApiResponse<never>;
    expect(body.success).toBe(false);
    if (body.success) return;
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a request with no file', async () => {
    const { app } = makeApp(createFakeProvider());
    const response = await request(app).post('/api/v1/imports');

    expect(response.status).toBe(400);
    const body = response.body as ApiResponse<never>;
    if (body.success) return;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a header-only file', async () => {
    const { app } = makeApp(createFakeProvider());
    const response = await upload(app, 'a,b,c');

    expect(response.status).toBe(400);
    const body = response.body as ApiResponse<never>;
    if (body.success) return;
    expect(body.error.code).toBe('EMPTY_CSV');
  });

  it('rejects a file with more rows than MAX_ROWS', async () => {
    const { app } = makeApp(createFakeProvider(), makeEnv({ MAX_ROWS: '2' }));
    const response = await upload(app);

    expect(response.status).toBe(413);
    const body = response.body as ApiResponse<never>;
    if (body.success) return;
    expect(body.error.code).toBe('ROW_LIMIT_EXCEEDED');
    expect(body.error.details).toMatchObject({ rowCount: 3, maxRows: 2 });
  });
});

describe('POST /api/v1/imports/:importId/process?mode=sync', () => {
  async function runSync(provider: LlmProvider, env = makeEnv()) {
    const store = new ImportStore();
    const app = createApp({ env, logger: silentLogger, store, provider });

    const uploaded = await upload(app);
    const body = uploaded.body as ApiResponse<UploadResult>;
    if (!body.success) throw new Error('upload failed');

    const response = await request(app)
      .post(`/api/v1/imports/${body.data.importId}/process`)
      .query({ mode: 'sync' });

    return { response, importId: body.data.importId };
  }

  it('extracts records and skips the row with no contact details', async () => {
    const provider = createFakeProvider();
    const { response } = await runSync(provider);

    expect(response.status).toBe(200);
    const body = response.body as ApiResponse<ImportResult>;
    expect(body.success).toBe(true);
    if (!body.success) return;

    const { summary, records, skipped } = body.data;
    expect(summary.totalRows).toBe(3);
    expect(summary.imported).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(records).toHaveLength(2);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.rowIndex).toBe(2);
    expect(skipped[0]?.skip_reason).toMatch(/no email or mobile/i);

    // 3 rows at BATCH_SIZE=2 is two batches, plus one Phase 1 call.
    expect(provider.calls.inference).toBe(1);
    expect(provider.calls.extraction).toBe(2);
    expect(summary.batches).toEqual({ total: 2, retried: 0, failed: 0 });
  });

  it('returns records in source order even though batches finish out of order', async () => {
    const provider = createFakeProvider();
    const { response } = await runSync(provider);
    const body = response.body as ApiResponse<ImportResult>;
    if (!body.success) return;

    expect(body.data.records.map((r) => r.email)).toEqual(['rajesh@x.com', 'sarah@x.com']);
  });

  it('applies the phase 1 date and country-code hints', async () => {
    const provider = createFakeProvider({
      onExtract: (rows) => echoRecords(rows, { created_at: '13/05/2026' }),
    });
    const { response } = await runSync(provider);
    const body = response.body as ApiResponse<ImportResult>;
    if (!body.success) return;

    const first = body.data.records[0];
    expect(first?.created_at).toBe('2026-05-13 00:00:00');
    expect(Number.isNaN(new Date(first?.created_at ?? '').getTime())).toBe(false);
    expect(first?.country_code).toBe('+91');
  });

  /** The single most important resilience property in the assignment. */
  it('never hard-fails when every AI batch dies; the rows become skipped records', async () => {
    const provider = createFakeProvider({ failExtractionWith: 'server' });
    const { response } = await runSync(provider);

    expect(response.status).toBe(200);
    const body = response.body as ApiResponse<ImportResult>;
    expect(body.success).toBe(true);
    if (!body.success) return;

    expect(body.data.records).toHaveLength(0);
    expect(body.data.skipped).toHaveLength(3);
    expect(body.data.summary.batches.failed).toBe(2);
    for (const skip of body.data.skipped) {
      expect(skip.skip_reason).toMatch(/AI extraction failed after 1 attempts/);
      // The raw row travels with the skip, so nothing is lost.
      expect(Object.keys(skip.raw).length).toBeGreaterThan(0);
    }
  });

  it('fails fast on a client error rather than retrying it', async () => {
    const provider = createFakeProvider({ failExtractionWith: 'client' });
    const { response } = await runSync(provider);

    expect(response.status).toBe(200);
    const body = response.body as ApiResponse<ImportResult>;
    if (!body.success) return;
    expect(body.data.summary.batches.failed).toBe(2);
    expect(provider.calls.extraction).toBe(2); // one attempt each, no retries
  });

  /** Phase 1 is a nicety, not a dependency. Losing it degrades quality, not availability. */
  it('still imports when phase 1 fails', async () => {
    const provider = createFakeProvider({ failInference: true });
    const { response } = await runSync(provider);

    expect(response.status).toBe(200);
    const body = response.body as ApiResponse<ImportResult>;
    if (!body.success) return;
    expect(body.data.summary.imported).toBe(2);
    expect(body.data.mappingPlan.detectedDateFormat).toBe('');
  });

  it('re-extracts rows the model silently dropped', async () => {
    let first = true;
    const provider = createFakeProvider({
      onExtract: (rows) => {
        if (first && rows.length > 1) {
          first = false;
          return echoRecords(rows.slice(0, 1)); // "forget" a row
        }
        return echoRecords(rows);
      },
    });

    const { response } = await runSync(provider);
    const body = response.body as ApiResponse<ImportResult>;
    if (!body.success) return;

    expect(body.data.summary.imported).toBe(2);
    expect(body.data.summary.batches.retried).toBe(1);
  });

  it('returns 404 for an importId that does not exist', async () => {
    const { app } = makeApp(createFakeProvider());
    const response = await request(app)
      .post('/api/v1/imports/2f1c0f4e-0000-4000-8000-000000000000/process')
      .query({ mode: 'sync' });

    expect(response.status).toBe(404);
    const body = response.body as ApiResponse<never>;
    if (body.success) return;
    expect(body.error.code).toBe('IMPORT_NOT_FOUND');
  });
});

describe('POST /api/v1/imports/:importId/process (SSE)', () => {
  it('streams progress, batch_complete and done events', async () => {
    const store = new ImportStore();
    const app = createApp({
      env: makeEnv(),
      logger: silentLogger,
      store,
      provider: createFakeProvider(),
    });

    const uploaded = await upload(app);
    const body = uploaded.body as ApiResponse<UploadResult>;
    if (!body.success) throw new Error('upload failed');

    const response = await request(app).post(`/api/v1/imports/${body.data.importId}/process`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    // Defeats proxy buffering; without it a deployed stream delivers nothing until the end.
    expect(response.headers['x-accel-buffering']).toBe('no');
    // compression() must never touch this route.
    expect(response.headers['content-encoding']).toBeUndefined();

    const text = response.text;
    expect(text).toContain('event: mapping_plan');
    expect(text).toContain('event: progress');
    expect(text).toContain('event: batch_complete');
    expect(text).toContain('event: done');

    const doneFrame = text.split('event: done\ndata: ')[1] ?? '';
    const done = JSON.parse(doneFrame.split('\n\n')[0] ?? '{}') as {
      result: ImportResult;
    };
    expect(done.result.summary.imported).toBe(2);
    expect(done.result.summary.skipped).toBe(1);
  });
});

describe('GET /api/v1/health', () => {
  it('reports ok', async () => {
    const { app } = makeApp(createFakeProvider());
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });
});
