import type { CsvRow } from '@groweasy/shared';
import { describe, expect, it } from 'vitest';
import { findEmptyColumns, sampleRows } from '../../src/services/csv/analyze';

describe('findEmptyColumns', () => {
  const headers = ['name', 'email', 'internal_id', 'alt_email'];

  it('finds columns that are empty in every row', () => {
    const rows: CsvRow[] = [
      { name: 'John', email: 'a@x.com', internal_id: '', alt_email: '' },
      { name: 'Jane', email: 'b@x.com', internal_id: '', alt_email: '' },
    ];

    expect(findEmptyColumns(headers, rows)).toEqual(['internal_id', 'alt_email']);
  });

  it('treats whitespace-only cells as empty', () => {
    const rows: CsvRow[] = [{ name: 'John', email: '', internal_id: '   ', alt_email: '\t' }];

    expect(findEmptyColumns(headers, rows)).toEqual(['email', 'internal_id', 'alt_email']);
  });

  /**
   * This is the whole reason the function exists. A column populated only in the long tail must not
   * be considered empty, because pruning it would destroy data and could wrongly skip a row.
   */
  it('keeps a column that is populated only in the very last row', () => {
    const rows: CsvRow[] = [
      ...Array.from({ length: 499 }, () => ({
        name: 'John',
        email: 'a@x.com',
        internal_id: '',
        alt_email: '',
      })),
      { name: 'Rare', email: '', internal_id: '', alt_email: 'rare@x.com' },
    ];

    expect(findEmptyColumns(headers, rows)).toEqual(['internal_id']);
  });

  it('returns every header when there are no rows', () => {
    expect(findEmptyColumns(headers, [])).toEqual(headers);
  });
});

describe('sampleRows', () => {
  const plain = (i: number): CsvRow => ({ name: `Person ${i}`, email: `p${i}@x.com`, note: '' });

  it('returns every row when the file is smaller than the limit', () => {
    const rows = [plain(0), plain(1), plain(2)];

    expect(sampleRows(rows, 8)).toEqual([
      { rowIndex: 0, row: rows[0] },
      { rowIndex: 1, row: rows[1] },
      { rowIndex: 2, row: rows[2] },
    ]);
  });

  it('never returns more than the limit', () => {
    const rows = Array.from({ length: 500 }, (_, i) => plain(i));

    expect(sampleRows(rows, 8)).toHaveLength(8);
  });

  it('is deterministic, so the prompt is stable and the prefix cache can hit', () => {
    const rows = Array.from({ length: 200 }, (_, i) => plain(i));

    expect(sampleRows(rows, 8)).toEqual(sampleRows(rows, 8));
  });

  it('returns rows in ascending index order', () => {
    const rows = Array.from({ length: 100 }, (_, i) => plain(i));
    const indexes = sampleRows(rows, 8).map((s) => s.rowIndex);

    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('always includes the first two rows', () => {
    const rows = Array.from({ length: 100 }, (_, i) => plain(i));
    const indexes = sampleRows(rows, 8).map((s) => s.rowIndex);

    expect(indexes).toContain(0);
    expect(indexes).toContain(1);
  });

  /**
   * The point of a diverse sample: the tidy rows at the top of a real export teach Phase 1 nothing.
   * A row buried at index 300 with two emails, a country code and an embedded newline teaches it
   * everything.
   */
  it('surfaces a messy row buried deep in the file', () => {
    const rows: CsvRow[] = Array.from({ length: 400 }, (_, i) => plain(i));
    rows[300] = {
      name: 'Messy Person',
      email: 'one@x.com / two@y.com',
      note: 'called them\nno answer +91 98765 43210',
    };

    const indexes = sampleRows(rows, 8).map((s) => s.rowIndex);

    expect(indexes).toContain(300);
  });

  it('surfaces an Excel-mangled scientific-notation phone number', () => {
    const rows: CsvRow[] = Array.from({ length: 200 }, (_, i) => plain(i));
    rows[150] = { name: 'Sci', email: 'sci@x.com', note: '9.88E+9' };

    expect(sampleRows(rows, 8).map((s) => s.rowIndex)).toContain(150);
  });

  it('surfaces the fullest row when nothing is odd', () => {
    const rows: CsvRow[] = Array.from({ length: 100 }, () => ({ a: '', b: '', c: '' }));
    rows[42] = { a: 'x', b: 'y', c: 'z' };

    expect(sampleRows(rows, 8).map((s) => s.rowIndex)).toContain(42);
  });
});
