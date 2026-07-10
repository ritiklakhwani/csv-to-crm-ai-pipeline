'use client';

import type { CsvRow } from '@groweasy/shared';
import Papa from 'papaparse';

export interface ParsedPreview {
  headers: string[];
  rows: CsvRow[];
  rowCount: number;
}

/**
 * Parses a CSV in the browser for the preview table.
 *
 * This is deliberately client-side: the assignment requires the preview to appear before any
 * backend call, and the upload endpoint returns only headers and a count, not the row data. The
 * authoritative parse still happens on the server at import time — this one only has to be good
 * enough to render a faithful preview.
 */
export function parseCsvPreview(file: File): Promise<ParsedPreview> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header, index) => {
        const trimmed = header.trim();
        return trimmed.length > 0 ? trimmed : `column_${index + 1}`;
      },
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const rows = results.data.filter((row) =>
          Object.values(row).some((value) => (value ?? '').trim().length > 0),
        );
        resolve({ headers, rows, rowCount: rows.length });
      },
      error: (error: Error) => reject(error),
    });
  });
}
