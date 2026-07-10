import { EMPTY_CRM_RECORD, type CrmRecord } from '@groweasy/shared';
import { describe, expect, it } from 'vitest';
import { escapeCsvCell, recordsToCsv } from '../src/lib/csv-export';

function record(overrides: Partial<CrmRecord> = {}): CrmRecord {
  return { ...EMPTY_CRM_RECORD, ...overrides };
}

/** The column index of a field in the exported row, so tests can read a specific cell. */
const FIELD_ORDER = EMPTY_CRM_RECORD;
function cell(csvLine: string, field: keyof CrmRecord): string {
  const index = Object.keys(FIELD_ORDER).indexOf(field);
  return csvLine.split(',')[index] ?? '';
}

describe('escapeCsvCell — RFC 4180 quoting', () => {
  it('quotes a value with a comma', () => {
    expect(escapeCsvCell('Busy, will call back')).toBe('"Busy, will call back"');
  });

  it('quotes a value with a quote and doubles the interior quote', () => {
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('quotes a value that still contains a newline', () => {
    expect(escapeCsvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('leaves a plain value untouched', () => {
    expect(escapeCsvCell('Rajesh Patel')).toBe('Rajesh Patel');
  });
});

describe('escapeCsvCell — formula-injection guard', () => {
  it.each(['=SUM(A1)', '+cmd', '-2+3', '@REF', '\tnasty', '\rnasty'])(
    'neutralises a free-text value starting with a trigger: %j',
    (value) => {
      expect(escapeCsvCell(value, true).startsWith("'")).toBe(true);
    },
  );

  it('does not guard when the field is validated (structured)', () => {
    // +91 passed phone validation upstream, so it is a country code, not a formula.
    expect(escapeCsvCell('+91', false)).toBe('+91');
  });

  it('still RFC-quotes a structured value that needs it', () => {
    expect(escapeCsvCell('a,b', false)).toBe('"a,b"');
  });
});

describe('recordsToCsv', () => {
  it('emits the 15 CRM headers in order, plus one row per record', () => {
    const csv = recordsToCsv([record({ name: 'John', email: 'j@x.com' })]);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');

    expect(lines[0]).toBe(
      'created_at,name,email,country_code,mobile_without_country_code,company,city,state,country,lead_owner,crm_status,crm_note,data_source,possession_time,description',
    );
    expect(lines).toHaveLength(2);
  });

  /** The whole point of the user's decision: a valid +91 must survive the export intact. */
  it('does NOT prefix a quote to country_code — +91 stays +91', () => {
    const csv = recordsToCsv([record({ country_code: '+91', name: 'John' })]);
    const row = csv.trim().split('\r\n')[1] ?? '';
    expect(cell(row, 'country_code')).toBe('+91');
  });

  it('does NOT guard the other structured fields', () => {
    const csv = recordsToCsv([
      record({ created_at: '2026-05-13 14:20:48', mobile_without_country_code: '9876543210' }),
    ]);
    const row = csv.trim().split('\r\n')[1] ?? '';
    expect(cell(row, 'created_at')).toBe('2026-05-13 14:20:48');
    expect(cell(row, 'mobile_without_country_code')).toBe('9876543210');
  });

  /** A note is free text, so an injection payload there is neutralised. */
  it('DOES guard a free-text crm_note that starts with a trigger', () => {
    const csv = recordsToCsv([record({ crm_note: '=cmd|calc', name: 'John' })]);
    expect(csv).toContain("'=cmd|calc");
  });

  /** Layered: a payload that is both a formula and needs RFC quoting gets both. */
  it('applies the guard first, then RFC-quotes, when a payload needs both', () => {
    const csv = recordsToCsv([record({ crm_note: '=HYPERLINK("x")', name: 'John' })]);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  });

  it('starts with a UTF-8 BOM so Excel reads it as UTF-8', () => {
    expect(recordsToCsv([]).startsWith('\uFEFF')).toBe(true);
  });

  it('uses CRLF line endings', () => {
    const csv = recordsToCsv([record({ name: 'John', email: 'j@x.com' })]);
    expect(csv.includes('\r\n')).toBe(true);
  });
});
