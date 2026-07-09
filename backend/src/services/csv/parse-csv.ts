import type { CsvRow } from '@groweasy/shared';
import Papa from 'papaparse';
import { EmptyCsvError, ValidationError } from '../../errors';

/**
 * CSV parsing, done defensively.
 *
 * PapaParse is asked for raw arrays rather than `header: true`, because header mode silently drops
 * a row's surplus cells and silently collides duplicate headers. Building the row objects ourselves
 * costs ten lines and lets us guarantee the one property this project cares about most: nothing in
 * the source file is silently destroyed.
 */

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  /** Whatever PapaParse sniffed: `,` `;` `\t` `|` … */
  delimiter: string;
  /** Non-fatal oddities worth logging or surfacing, never worth failing over. */
  warnings: string[];
}

/** Ragged rows put their surplus cells here rather than on the floor. */
export const EXTRA_COLUMN = '_extra';

/** U+FEFF, written as an escape so it is visible to a human reading this file. */
const BOM = '\uFEFF';

export function parseCsv(input: Buffer | string): ParsedCsv {
  const text = stripBom(typeof input === 'string' ? input : input.toString('utf8'));

  if (text.trim().length === 0) {
    throw new EmptyCsvError('The uploaded file is empty.');
  }

  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: 'greedy',
    // Everything stays a string. Coercion is the post-validator's job, and PapaParse would happily
    // turn a phone number like 09876543210 into 9876543210, or a zip code into a float.
    dynamicTyping: false,
  });

  const table = result.data;
  const headerCells = table[0];

  if (!headerCells || headerCells.length === 0) {
    throw new EmptyCsvError('The CSV has no header row.');
  }

  const dataRows = table.slice(1);
  if (dataRows.length === 0) {
    throw new EmptyCsvError('The CSV has a header row but no data rows.');
  }

  const headers = normaliseHeaders(headerCells);
  const warnings = collectWarnings(result.errors);

  let sawExtraCells = false;
  const rows: CsvRow[] = dataRows.map((cells) => {
    const row: CsvRow = {};

    for (const [index, header] of headers.entries()) {
      row[header] = (cells[index] ?? '').trim();
    }

    // A row with more cells than the header declares. Real exports do this. Keeping the surplus in
    // a visible column means the model can still salvage it into crm_note.
    if (cells.length > headers.length) {
      const extra = cells
        .slice(headers.length)
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);

      if (extra.length > 0) {
        row[EXTRA_COLUMN] = extra.join(' | ');
        sawExtraCells = true;
      }
    }

    return row;
  });

  if (sawExtraCells) {
    headers.push(EXTRA_COLUMN);
    warnings.push(
      `Some rows had more columns than the header row. Their surplus values were kept in "${EXTRA_COLUMN}".`,
    );
  }

  if (rows.length === 0) {
    throw new ValidationError('The CSV could not be parsed into any rows.');
  }

  return {
    headers,
    rows,
    delimiter: result.meta.delimiter,
    warnings,
  };
}

/**
 * Excel writes a UTF-8 BOM. It is invisible, so the first header silently becomes a *different*
 * string from `created_at` and every lookup against it misses. This is the single most common
 * reason a CSV "works everywhere except in my parser".
 */
export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

/**
 * Header names must be unique and non-empty, because they become object keys. Blank headers are
 * common in hand-made sheets; duplicates are common in exports that repeat a field.
 */
export function normaliseHeaders(cells: readonly string[]): string[] {
  const seen = new Map<string, number>();

  return cells.map((cell, index) => {
    const trimmed = cell.trim();
    const base = trimmed.length > 0 ? trimmed : `column_${index + 1}`;

    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);

    return count === 0 ? base : `${base} (${count + 1})`;
  });
}

/**
 * Field-count mismatches are expected in messy files and are already handled above, so they are not
 * worth surfacing. Malformed quoting is worth surfacing.
 */
function collectWarnings(errors: readonly Papa.ParseError[]): string[] {
  const interesting = errors.filter(
    (error) => error.type !== 'FieldMismatch' && error.code !== 'UndetectableDelimiter',
  );

  return interesting.slice(0, 5).map((error) => {
    const where = typeof error.row === 'number' ? ` at row ${error.row + 1}` : '';
    return `${error.code ?? error.type}${where}: ${error.message}`;
  });
}
