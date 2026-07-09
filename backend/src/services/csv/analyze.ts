import type { CsvRow } from '@groweasy/shared';

/**
 * Pruning columns that Phase 1 *thinks* are junk loses data: it sees 8 sampled rows, so a column
 * filled only at row 500 would be dropped, and if a phone lived there a contactable row would be
 * wrongly skipped. A full-file scan cannot be wrong, costs one pass, and spends no tokens.
 */
export function findEmptyColumns(headers: readonly string[], rows: readonly CsvRow[]): string[] {
  const nonEmpty = new Set<string>();

  for (const row of rows) {
    for (const header of headers) {
      if (nonEmpty.has(header)) continue;
      const value = row[header];
      if (value !== undefined && value.trim().length > 0) nonEmpty.add(header);
    }
    if (nonEmpty.size === headers.length) break; // nothing left to learn
  }

  return headers.filter((header) => !nonEmpty.has(header));
}

export interface SampledRow {
  /** 0-based index into the data rows, header excluded. */
  rowIndex: number;
  row: CsvRow;
}

/**
 * Cells that hint at a parsing hazard. Rows containing these teach Phase 1 far more about the file
 * than the first eight rows, which in a real export are almost always the tidiest.
 */
const ODDITY_PATTERNS: readonly RegExp[] = [
  /[\r\n]/, //                     an embedded newline inside a quoted field
  /@[^@\s]*[\s,;|/]+[^@\s]*@/, //  two email addresses crammed into one cell
  /[;|/]/, //                      a separator character living inside a value
  /\+\d{1,3}[\s-]?\d/, //          an explicit country code
  /\d{11,}/, //                    a digit run too long to be a bare national number
  /\d[eE][+-]?\d+/, //             Excel mangling a long number into 9.88E+9
  /^\s|\s$/, //                    padding that a naive parser would keep
];

function nonEmptyCellCount(row: CsvRow): number {
  return Object.values(row).filter((value) => value.trim().length > 0).length;
}

function oddityScore(row: CsvRow): number {
  let score = 0;
  for (const value of Object.values(row)) {
    for (const pattern of ODDITY_PATTERNS) {
      if (pattern.test(value)) score += 1;
    }
  }
  return score;
}

/**
 * Picks a small, representative slice of the file for Phase 1.
 *
 * Deliberately deterministic — no randomness — so the prompt is stable, the prefix cache hits, and
 * this function is unit-testable. The mix is: the first two rows (what a human would look at), the
 * weirdest rows (where the parsing hazards live), the fullest rows (where the mappings live), then
 * an even spread to cover the tail.
 */
export function sampleRows(rows: readonly CsvRow[], limit = 8): SampledRow[] {
  if (rows.length <= limit) {
    return rows.map((row, rowIndex) => ({ rowIndex, row }));
  }

  const chosen = new Set<number>();
  const take = (index: number): void => {
    if (chosen.size < limit && index >= 0 && index < rows.length) chosen.add(index);
  };

  take(0);
  take(1);

  const scored = rows.map((row, index) => ({
    index,
    oddity: oddityScore(row),
    richness: nonEmptyCellCount(row),
  }));

  const weirdest = [...scored].sort(
    (a, b) => b.oddity - a.oddity || b.richness - a.richness || a.index - b.index,
  );
  for (const entry of weirdest.slice(0, 3)) take(entry.index);

  const fullest = [...scored].sort((a, b) => b.richness - a.richness || a.index - b.index);
  for (const entry of fullest.slice(0, 3)) take(entry.index);

  const stride = Math.max(1, Math.floor(rows.length / limit));
  for (let index = 0; chosen.size < limit && index < rows.length; index += stride) take(index);
  for (let index = 0; chosen.size < limit && index < rows.length; index += 1) take(index);

  return [...chosen]
    .sort((a, b) => a - b)
    .flatMap((rowIndex) => {
      const row = rows[rowIndex];
      return row === undefined ? [] : [{ rowIndex, row }];
    });
}
