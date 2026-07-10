import type { RequestHandler } from 'express';
import multer from 'multer';
import { maxFileSizeBytes, type Env } from '../config/env';
import { InvalidFileTypeError } from '../errors';

/**
 * Browsers and operating systems disagree wildly about the MIME type of a `.csv` file, so the
 * extension is the reliable signal and the MIME type is only used to reject the obviously wrong.
 * Whether the bytes really are a CSV is decided later, by trying to parse them.
 */
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
]);

export const UPLOAD_FIELD_NAME = 'file';

export function uploadMiddleware(env: Env): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileSizeBytes(env),
      files: 1,
      // Multer's own size errors are translated into FileTooLargeError by the error middleware.
    },
    fileFilter: (_req, file, callback) => {
      if (!file.originalname.toLowerCase().endsWith('.csv')) {
        callback(new InvalidFileTypeError('Only .csv files are accepted.'));
        return;
      }
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        callback(new InvalidFileTypeError(`Unexpected content type: ${file.mimetype}`));
        return;
      }
      callback(null, true);
    },
  });

  return upload.single(UPLOAD_FIELD_NAME);
}
