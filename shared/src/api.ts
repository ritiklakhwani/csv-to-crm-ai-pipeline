import type { CrmRecord } from './crm';
import type { MappingPlan } from './mapping';

/** One row of a parsed CSV, keyed by its (possibly ugly) original header. */
export type CsvRow = Record<string, string>;

/** Every response the API can produce fits in one of these two shapes. No exceptions. */
export type ApiResponse<T> = { success: true; data: T } | { success: false; error: ApiError };

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'INVALID_FILE_TYPE',
  'FILE_TOO_LARGE',
  'EMPTY_CSV',
  'ROW_LIMIT_EXCEEDED',
  'IMPORT_NOT_FOUND',
  'LLM_PROVIDER_ERROR',
  'BATCH_FAILED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** `POST /api/v1/imports` — parsing only. No AI has run at this point. */
export interface UploadResult {
  importId: string;
  fileName: string;
  sizeBytes: number;
  headers: string[];
  rowCount: number;
  /** The delimiter PapaParse sniffed: `,`, `;`, `\t`, `|` … */
  delimiter: string;
}

/** A row that never became a CRM record, and the human-readable reason why. */
export interface SkippedRecord {
  /** 0-based index into the data rows (header row excluded). */
  rowIndex: number;
  raw: CsvRow;
  skip_reason: string;
}

export interface ImportSummary {
  totalRows: number;
  imported: number;
  skipped: number;
  processingTimeMs: number;
  batches: {
    total: number;
    /** Batches that succeeded, but only after at least one retry. */
    retried: number;
    /** Batches that exhausted every retry. Their rows appear in `skipped`. */
    failed: number;
  };
  tokens: {
    prompt: number;
    /** Prompt tokens served from OpenAI's automatic prefix cache. Higher is cheaper. */
    cachedPrompt: number;
    completion: number;
  };
}

/** `POST /api/v1/imports/:id/process` — the final payload, streamed or returned whole. */
export interface ImportResult {
  summary: ImportSummary;
  mappingPlan: MappingPlan;
  records: CrmRecord[];
  skipped: SkippedRecord[];
}

export interface HealthResult {
  status: 'ok';
  uptimeSeconds: number;
  version: string;
}
