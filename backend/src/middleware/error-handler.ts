import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { FileTooLargeError, InvalidFileTypeError, ValidationError, isAppError } from '../errors';
import type { Logger } from '../utils/logger';
import { fail } from '../utils/api-response';

/**
 * The single place an error becomes an HTTP response.
 *
 * Multer and Zod both throw their own error shapes, so they are translated into our `AppError`
 * hierarchy here rather than leaking library types into controllers.
 */

function translate(error: unknown, maxFileBytes: number): unknown {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return new FileTooLargeError(maxFileBytes);
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return new InvalidFileTypeError('Upload exactly one file, in a field named "file".');
    }
    return new ValidationError(`Upload rejected: ${error.message}`);
  }

  if (error instanceof ZodError) {
    return new ValidationError(
      'Request failed validation.',
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return error;
}

export interface ErrorHandlerOptions {
  logger: Logger;
  isProduction: boolean;
  maxFileBytes: number;
}

export function errorHandler({
  logger,
  isProduction,
  maxFileBytes,
}: ErrorHandlerOptions): ErrorRequestHandler {
  return (rawError, req, res, next) => {
    // The response is already streaming (SSE). Anything we send now would corrupt the stream, so
    // the controller owns the failure and all we can do is close the connection.
    if (res.headersSent) {
      logger.error('Error after headers were sent; destroying connection', {
        path: req.path,
        error: rawError instanceof Error ? rawError.message : String(rawError),
      });
      res.end();
      return;
    }

    const error = translate(rawError, maxFileBytes);

    if (isAppError(error)) {
      const level = error.status >= 500 ? 'error' : 'warn';
      logger[level](error.message, {
        code: error.code,
        status: error.status,
        path: req.path,
        ...(error.status >= 500 ? { stack: error.stack } : {}),
      });

      // `expose: false` errors (internal, LLM provider payloads) must never reach the client in
      // production. In development the real message is far more useful than a lie.
      const message = error.expose || !isProduction ? error.message : 'Something went wrong.';
      const details = error.expose ? error.details : undefined;

      fail(res, error.status, error.code, message, details);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error('Unhandled error', {
      path: req.path,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    fail(res, 500, 'INTERNAL_ERROR', isProduction ? 'Something went wrong.' : message);

    // Keep Express happy about the unused `next` parameter in the 4-arity signature.
    void next;
  };
}

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    fail(res, 404, 'NOT_FOUND', `No route matches ${req.method} ${req.path}`);
  };
}
