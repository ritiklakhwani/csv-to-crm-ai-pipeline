import type { ApiError, ApiErrorCode, ApiResponse } from '@groweasy/shared';
import type { Response } from 'express';

/** Every successful response goes through here, so the envelope can never drift. */
export function ok<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { success: true, data };
  res.status(status).json(body);
}

export function fail(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): void {
  const error: ApiError = details === undefined ? { code, message } : { code, message, details };
  const body: ApiResponse<never> = { success: false, error };
  res.status(status).json(body);
}
