import { describe, expect, it } from 'vitest';
import { EmptyCsvError } from '../../src/errors';
import {
  EXTRA_COLUMN,
  normaliseHeaders,
  parseCsv,
  stripBom,
} from '../../src/services/csv/parse-csv';

describe('stripBom', () => {
  it('removes a leading UTF-8 BOM', () => {
    expect(stripBom('\uFEFFcreated_at,name')).toBe('created_at,name');
  });

  it('leaves a BOM that is not leading alone', () => {
    expect(stripBom('name,\uFEFFemail')).toBe('name,\uFEFFemail');
  });
});

describe('normaliseHeaders', () => {
  it('names blank headers by their 1-based position', () => {
    expect(normaliseHeaders(['name', '', 'email'])).toEqual(['name', 'column_2', 'email']);
  });

  it('disambiguates duplicates instead of letting them collide', () => {
    expect(normaliseHeaders(['Phone', 'Phone', 'Phone'])).toEqual([
      'Phone',
      'Phone (2)',
      'Phone (3)',
    ]);
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseHeaders(['  name  ', '\temail\t'])).toEqual(['name', 'email']);
  });
});

describe('parseCsv', () => {
  it('parses a simple comma-delimited file', () => {
    const result = parseCsv('name,email\nJohn,john@x.com\nJane,jane@x.com');

    expect(result.headers).toEqual(['name', 'email']);
    expect(result.delimiter).toBe(',');
    expect(result.rows).toEqual([
      { name: 'John', email: 'john@x.com' },
      { name: 'Jane', email: 'jane@x.com' },
    ]);
  });

  it('strips a BOM so the first header is usable', () => {
    const result = parseCsv('\uFEFFcreated_at,name\n2026-05-13,John');

    expect(result.headers[0]).toBe('created_at');
    expect(result.rows[0]?.['created_at']).toBe('2026-05-13');
  });

  it('sniffs a semicolon delimiter', () => {
    const result = parseCsv('name;email\nJohn;john@x.com');

    expect(result.delimiter).toBe(';');
    expect(result.rows[0]).toEqual({ name: 'John', email: 'john@x.com' });
  });

  it('sniffs a tab delimiter', () => {
    const result = parseCsv('name\temail\nJohn\tjohn@x.com');

    expect(result.delimiter).toBe('\t');
    expect(result.rows[0]).toEqual({ name: 'John', email: 'john@x.com' });
  });

  it('keeps commas that live inside a quoted field', () => {
    const result = parseCsv('name,note\nJohn,"Busy, will call back"');

    expect(result.rows[0]?.['note']).toBe('Busy, will call back');
  });

  it('keeps a newline that lives inside a quoted field', () => {
    const result = parseCsv('name,note\nJohn,"line one\nline two"\nJane,ok');

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.['note']).toBe('line one\nline two');
    expect(result.rows[1]?.['name']).toBe('Jane');
  });

  it('keeps escaped double quotes', () => {
    const result = parseCsv('name,note\nJohn,"He said ""hello"""');

    expect(result.rows[0]?.['note']).toBe('He said "hello"');
  });

  it('handles CRLF line endings', () => {
    const result = parseCsv('name,email\r\nJohn,john@x.com\r\n');

    expect(result.rows).toEqual([{ name: 'John', email: 'john@x.com' }]);
  });

  it('pads rows that have fewer cells than the header', () => {
    const result = parseCsv('name,email,city\nJohn,john@x.com');

    expect(result.rows[0]).toEqual({ name: 'John', email: 'john@x.com', city: '' });
  });

  it('preserves surplus cells rather than dropping them', () => {
    const result = parseCsv('name,email\nJohn,john@x.com,extra-1,extra-2');

    expect(result.headers).toContain(EXTRA_COLUMN);
    expect(result.rows[0]?.[EXTRA_COLUMN]).toBe('extra-1 | extra-2');
    expect(result.warnings.join(' ')).toMatch(/surplus/i);
  });

  it('does not invent an _extra column when no row is ragged', () => {
    const result = parseCsv('name,email\nJohn,john@x.com');

    expect(result.headers).not.toContain(EXTRA_COLUMN);
  });

  it('skips blank lines rather than emitting empty rows', () => {
    const result = parseCsv('name,email\n\nJohn,john@x.com\n\n\nJane,jane@x.com\n');

    expect(result.rows).toHaveLength(2);
  });

  it('does not coerce a leading-zero phone number into a number', () => {
    const result = parseCsv('phone\n09876543210');

    expect(result.rows[0]?.['phone']).toBe('09876543210');
  });

  it('rejects an empty file', () => {
    expect(() => parseCsv('')).toThrow(EmptyCsvError);
    expect(() => parseCsv('   \n  \n')).toThrow(EmptyCsvError);
  });

  it('rejects a header-only file', () => {
    expect(() => parseCsv('name,email')).toThrow(EmptyCsvError);
    expect(() => parseCsv('name,email\n')).toThrow(EmptyCsvError);
  });

  it('accepts a Buffer', () => {
    const result = parseCsv(Buffer.from('name\nJohn', 'utf8'));

    expect(result.rows[0]?.['name']).toBe('John');
  });

  it('trims cell padding but keeps interior whitespace', () => {
    const result = parseCsv('name\n"  John  Doe  "');

    expect(result.rows[0]?.['name']).toBe('John  Doe');
  });
});
