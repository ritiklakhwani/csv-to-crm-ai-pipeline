import type { ApiErrorCode } from '@groweasy/shared';

/**
 * Every error the app throws on purpose extends this. The central error middleware is then a pure
 * function of the error: `AppError` becomes its own status and code, anything else becomes a 500
 * with a generic message. Stack traces and provider payloads never reach the client in production.
 */
export abstract class AppError extends Error {
  abstract readonly code: ApiErrorCode;
  abstract readonly status: number;

  /** When false, the message is replaced by a generic one before it leaves the process. */
  readonly expose: boolean = true;

  /** Machine-readable context. Only sent to the client when `expose` is true. */
  readonly details?: unknown;

  constructor(message: string, details?: unknown, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
