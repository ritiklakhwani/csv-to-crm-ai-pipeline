import type { ApiResponse, UploadResult } from '@groweasy/shared';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function apiUrl(path: string): string {
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

/** Unwraps the `{ success, data | error }` envelope into a value or a thrown ApiError. */
async function unwrap<T>(response: Response): Promise<T> {
  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      `The server returned an unreadable response.`,
      'BAD_RESPONSE',
      response.status,
    );
  }

  if (!body.success) {
    throw new ApiError(body.error.message, body.error.code, response.status);
  }
  return body.data;
}

/** POST /api/v1/imports — parses the file server-side. No AI runs here. */
export async function uploadCsv(file: File, signal?: AbortSignal): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(apiUrl('/api/v1/imports'), {
    method: 'POST',
    body: form,
    ...(signal ? { signal } : {}),
  });

  return unwrap<UploadResult>(response);
}

/**
 * POST /api/v1/imports/:id/process — opens the SSE stream and returns the raw body.
 * The caller feeds it to `readSseEvents`. Kept separate from parsing so the transport and the
 * frame-decoding can be tested independently.
 */
export async function openImportStream(
  importId: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(apiUrl(`/api/v1/imports/${importId}/process`), {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    // A pre-stream failure (404 for an expired import, 429 for the rate limit) arrives as the JSON
    // envelope, not as an SSE frame.
    await unwrap(response);
  }

  if (!response.body) {
    throw new ApiError('The server did not return a stream.', 'NO_STREAM', response.status);
  }

  return response.body;
}

export function sampleUrl(fileName: string): string {
  return `/samples/${fileName}`;
}
