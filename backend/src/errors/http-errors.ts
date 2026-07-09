import type { ApiErrorCode } from '@groweasy/shared';
import { AppError } from './app-error';

export class ValidationError extends AppError {
  readonly code: ApiErrorCode = 'VALIDATION_ERROR';
  readonly status = 400;
}

export class InvalidFileTypeError extends AppError {
  readonly code: ApiErrorCode = 'INVALID_FILE_TYPE';
  readonly status = 415;

  constructor(message = 'Only .csv files are accepted.') {
    super(message);
  }
}

export class FileTooLargeError extends AppError {
  readonly code: ApiErrorCode = 'FILE_TOO_LARGE';
  readonly status = 413;

  constructor(maxBytes: number) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    super(`File is larger than the ${maxMb} MB limit.`, { maxBytes });
  }
}

export class EmptyCsvError extends AppError {
  readonly code: ApiErrorCode = 'EMPTY_CSV';
  readonly status = 400;

  constructor(message = 'The CSV contains no data rows.') {
    super(message);
  }
}

export class RowLimitError extends AppError {
  readonly code: ApiErrorCode = 'ROW_LIMIT_EXCEEDED';
  readonly status = 413;

  constructor(rowCount: number, maxRows: number) {
    super(
      `This CSV has ${rowCount.toLocaleString()} rows. The hosted demo imports at most ` +
        `${maxRows.toLocaleString()} rows per file because it runs on a personal API key. ` +
        `Raise MAX_ROWS when self-hosting.`,
      { rowCount, maxRows },
    );
  }
}

/**
 * The in-memory import store is bounded and has a TTL, and a free-tier host restarts on idle.
 * The frontend still holds the File, so it recovers by re-uploading rather than failing.
 */
export class ImportNotFoundError extends AppError {
  readonly code: ApiErrorCode = 'IMPORT_NOT_FOUND';
  readonly status = 404;

  constructor(importId: string) {
    super(
      'This upload is no longer available — it expired or the server restarted. Re-upload the file.',
      { importId },
    );
  }
}

/** Raised when a batch exhausts every retry. Its rows become skipped records, never lost rows. */
export class BatchFailedError extends AppError {
  readonly code: ApiErrorCode = 'BATCH_FAILED';
  readonly status = 502;

  constructor(batchIndex: number, attempts: number, cause?: unknown) {
    super(
      `Batch ${batchIndex} failed after ${attempts} attempts.`,
      { batchIndex, attempts },
      { cause },
    );
  }
}

export class InternalError extends AppError {
  readonly code: ApiErrorCode = 'INTERNAL_ERROR';
  readonly status = 500;
  override readonly expose = false;
}
