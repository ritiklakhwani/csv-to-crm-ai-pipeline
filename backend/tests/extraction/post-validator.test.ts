import { EMPTY_CRM_RECORD, type CsvRow } from '@groweasy/shared';
import { describe, expect, it } from 'vitest';
import {
  validateRecord,
  type ValidationContext,
  type ValidationOutcome,
} from '../../src/services/extraction/post-validator';
import type { ExtractedRecord } from '../../src/services/extraction/schemas';

function extracted(overrides: Partial<ExtractedRecord> = {}): ExtractedRecord {
  return { ...EMPTY_CRM_RECORD, __row: 0, skip_reason: '', ...overrides };
}

function run(
  model: Partial<ExtractedRecord>,
  raw: CsvRow,
  context: ValidationContext = {},
): ValidationOutcome {
  return validateRecord(extracted(model), raw, 0, context);
}

/** Most tests only care about the happy path, so unwrap it. */
function record(outcome: ValidationOutcome) {
  if (outcome.kind !== 'record')
    throw new Error(`expected a record, got: ${outcome.skipped.skip_reason}`);
  return outcome.record;
}

describe('validateRecord', () => {
  describe('rule 7: skip a row with neither email nor mobile', () => {
    it('skips when the model returned no contact details', () => {
      const outcome = run({ name: 'Nobody' }, { Name: 'Nobody', Note: 'walked in' });

      expect(outcome.kind).toBe('skipped');
      if (outcome.kind !== 'skipped') return;
      expect(outcome.skipped.skip_reason).toMatch(/no email or mobile/i);
      // The raw row travels with the skip, so the UI can show what was dropped.
      expect(outcome.skipped.raw).toEqual({ Name: 'Nobody', Note: 'walked in' });
    });

    it('prefers the reason the model gave', () => {
      const outcome = run({ skip_reason: 'row is a spreadsheet subtotal' }, { Name: 'TOTAL' });

      expect(outcome.kind).toBe('skipped');
      if (outcome.kind !== 'skipped') return;
      expect(outcome.skipped.skip_reason).toBe('row is a spreadsheet subtotal');
    });

    it('keeps a row with only an email', () => {
      const outcome = run({ email: 'a@x.com' }, { Email: 'a@x.com' });
      expect(record(outcome).email).toBe('a@x.com');
    });

    it('keeps a row with only a mobile', () => {
      const outcome = run({ mobile_without_country_code: '9876543210' }, { Phone: '9876543210' });
      expect(record(outcome).mobile_without_country_code).toBe('9876543210');
    });

    /** The model may wrongly mark a contactable row as skippable. Code decides, not the model. */
    it('ignores a model skip_reason when the row actually has contact details', () => {
      const outcome = run(
        { email: 'a@x.com', skip_reason: 'looks incomplete' },
        { Email: 'a@x.com' },
      );
      expect(outcome.kind).toBe('record');
    });
  });

  describe('rule 1 and 2: enum whitelists', () => {
    it('accepts a whitelisted status and source', () => {
      const result = record(
        run(
          { email: 'a@x.com', crm_status: 'SALE_DONE', data_source: 'eden_park' },
          { Email: 'a@x.com' },
        ),
      );

      expect(result.crm_status).toBe('SALE_DONE');
      expect(result.data_source).toBe('eden_park');
    });

    it('drops an invented status to empty and keeps the raw value in the note', () => {
      const result = record(
        run(
          { email: 'a@x.com', crm_status: 'PENDING' as never },
          { Email: 'a@x.com', Status: 'Pending' },
        ),
      );

      expect(result.crm_status).toBe('');
      expect(result.crm_note).toContain('crm_status outside whitelist: PENDING');
    });

    it('drops an invented data source to empty', () => {
      const result = record(
        run({ email: 'a@x.com', data_source: 'some_tower' as never }, { Email: 'a@x.com' }),
      );

      expect(result.data_source).toBe('');
      expect(result.crm_note).toContain('data_source outside whitelist: some_tower');
    });

    it('leaves an empty enum empty without complaining', () => {
      const result = record(run({ email: 'a@x.com' }, { Email: 'a@x.com' }));
      expect(result.crm_status).toBe('');
      expect(result.crm_note).toBe('');
    });
  });

  describe('rule 3: created_at must survive new Date()', () => {
    it('normalizes a day-first date using the phase 1 hint', () => {
      const result = record(
        run(
          { email: 'a@x.com', created_at: '05/06/2026' },
          { Email: 'a@x.com' },
          { dayFirst: true },
        ),
      );

      expect(result.created_at).toBe('2026-06-05 00:00:00');
      expect(Number.isNaN(new Date(result.created_at).getTime())).toBe(false);
    });

    it('normalizes a month-first date using the phase 1 hint', () => {
      const result = record(
        run(
          { email: 'a@x.com', created_at: '05/06/2026' },
          { Email: 'a@x.com' },
          { dayFirst: false },
        ),
      );

      expect(result.created_at).toBe('2026-05-06 00:00:00');
    });

    it('blanks an unparseable date and moves the raw value to the note', () => {
      const result = record(
        run({ email: 'a@x.com', created_at: 'sometime last week' }, { Email: 'a@x.com' }),
      );

      expect(result.created_at).toBe('');
      expect(result.crm_note).toContain('unparsed date: sometime last week');
    });
  });

  describe('rule 4 and 5: first value wins, the rest go to the note', () => {
    it('keeps the first email and notes the others', () => {
      const raw = { Email: 'one@x.com / two@y.com' };
      const result = record(run({ email: 'one@x.com / two@y.com' }, raw));

      expect(result.email).toBe('one@x.com');
      expect(result.crm_note).toContain('Alt emails: two@y.com');
    });

    it('keeps the first mobile and notes the others', () => {
      const raw = { Mobile: '9876543210', 'Alt No.': '9988776655' };
      const result = record(
        run({ mobile_without_country_code: '9876543210 / 9988776655' }, raw, {
          defaultCountryCode: '+91',
        }),
      );

      expect(result.mobile_without_country_code).toBe('9876543210');
      expect(result.country_code).toBe('+91');
      expect(result.crm_note).toContain('Alt phones: +919988776655');
    });
  });

  describe('rule 6: a record stays a single CSV row', () => {
    it('escapes newlines in the note', () => {
      const raw = { Email: 'a@x.com', Remarks: 'line one\nline two' };
      const result = record(run({ email: 'a@x.com', crm_note: 'line one\nline two' }, raw));

      expect(result.crm_note).toBe('line one\\nline two');
      expect(result.crm_note.includes('\n')).toBe(false);
    });

    it('escapes newlines in a passthrough field', () => {
      const result = record(run({ email: 'a@x.com', description: 'a\r\nb' }, { Email: 'a@x.com' }));
      expect(result.description).toBe('a\\nb');
    });
  });

  describe('the anti-hallucination cross-check', () => {
    it('drops an email that appears nowhere in the source row', () => {
      const outcome = run(
        { name: 'John', email: 'invented@nowhere.com', mobile_without_country_code: '9876543210' },
        { Name: 'John', Phone: '9876543210' },
      );

      const result = record(outcome);
      expect(result.email).toBe('');
      // Preserved, not destroyed.
      expect(result.crm_note).toContain('dropped unverified email: invented@nowhere.com');
    });

    it('drops a phone number that appears nowhere in the source row', () => {
      const result = record(
        run(
          { email: 'a@x.com', mobile_without_country_code: '1234567890' },
          { Email: 'a@x.com', Name: 'John' },
        ),
      );

      expect(result.mobile_without_country_code).toBe('');
      expect(result.crm_note).toContain('dropped unverified phone: 1234567890');
    });

    it('matches an email case-insensitively', () => {
      const result = record(run({ email: 'john@x.com' }, { Email: 'JOHN@X.COM' }));
      expect(result.email).toBe('john@x.com');
    });

    it('matches a phone whose source cell was formatted with spaces and a country code', () => {
      const result = record(
        run(
          { email: 'a@x.com', mobile_without_country_code: '9876543210' },
          {
            Email: 'a@x.com',
            Mobile: '+91 98765 43210',
          },
        ),
      );

      expect(result.mobile_without_country_code).toBe('9876543210');
    });

    /**
     * The reason the check is narrow. country_code is derived from the number's shape and is never
     * literally present in the row, so a blanket "must appear in the row" rule would erase it every
     * single time.
     */
    it('never cross-checks country_code, which is inferred rather than present', () => {
      const result = record(
        run(
          { email: 'a@x.com', mobile_without_country_code: '+919876543210' },
          {
            Email: 'a@x.com',
            Mobile: '+919876543210',
          },
        ),
      );

      expect(result.country_code).toBe('+91');
      expect(result.crm_note).not.toContain('country_code');
    });

    it('never cross-checks city, state or company', () => {
      const result = record(
        run(
          { email: 'a@x.com', city: 'Mumbai', state: 'Maharashtra', company: 'GrowEasy' },
          { Email: 'a@x.com' },
        ),
      );

      expect(result.city).toBe('Mumbai');
      expect(result.state).toBe('Maharashtra');
      expect(result.company).toBe('GrowEasy');
      expect(result.crm_note).toBe('');
    });

    it('promotes the second email when the first was invented', () => {
      const result = record(
        run({ email: 'fake@nowhere.com, real@x.com' }, { Email: 'real@x.com' }),
      );

      expect(result.email).toBe('real@x.com');
      expect(result.crm_note).toContain('dropped unverified email: fake@nowhere.com');
    });
  });

  describe('country code resolution', () => {
    it('uses the code the model reported when the number is bare', () => {
      const result = record(
        run(
          { email: 'a@x.com', country_code: '91', mobile_without_country_code: '9876543210' },
          {
            Email: 'a@x.com',
            Mobile: '9876543210',
          },
        ),
      );

      expect(result.country_code).toBe('+91');
    });

    it('falls back to the phase 1 default when the model gave none', () => {
      const result = record(
        run(
          { email: 'a@x.com', mobile_without_country_code: '9876543210' },
          {
            Email: 'a@x.com',
            Mobile: '9876543210',
          },
          { defaultCountryCode: '+91' },
        ),
      );

      expect(result.country_code).toBe('+91');
    });

    it('leaves country_code empty when nothing indicates one', () => {
      const result = record(
        run(
          { email: 'a@x.com', mobile_without_country_code: '9876543210' },
          {
            Email: 'a@x.com',
            Mobile: '9876543210',
          },
        ),
      );

      expect(result.country_code).toBe('');
    });

    it('does not emit a country code without a number to attach it to', () => {
      const result = record(run({ email: 'a@x.com', country_code: '+91' }, { Email: 'a@x.com' }));

      expect(result.country_code).toBe('');
      expect(result.mobile_without_country_code).toBe('');
    });

    it('ignores a nonsense country code', () => {
      const result = record(
        run(
          { email: 'a@x.com', country_code: 'India', mobile_without_country_code: '9876543210' },
          {
            Email: 'a@x.com',
            Mobile: '9876543210',
          },
        ),
      );

      expect(result.country_code).toBe('');
    });
  });

  describe('note assembly', () => {
    it('keeps the model note first, then appends our findings', () => {
      const result = record(
        run(
          {
            email: 'a@x.com',
            crm_note: 'Client asked to reschedule',
            crm_status: 'HOT' as never,
            created_at: 'whenever',
          },
          { Email: 'a@x.com' },
        ),
      );

      expect(result.crm_note.startsWith('Client asked to reschedule')).toBe(true);
      expect(result.crm_note).toContain('crm_status outside whitelist: HOT');
      expect(result.crm_note).toContain('unparsed date: whenever');
    });

    it('produces no leading separator when the model left the note empty', () => {
      const result = record(run({ email: 'a@x.com', created_at: 'bad' }, { Email: 'a@x.com' }));

      expect(result.crm_note.startsWith('|')).toBe(false);
      expect(result.crm_note).toBe('unparsed date: bad');
    });
  });

  it('trims whitespace from every field', () => {
    const result = record(run({ email: 'a@x.com', name: '  John Doe  ' }, { Email: 'a@x.com' }));
    expect(result.name).toBe('John Doe');
  });

  it('returns exactly the 15 CRM fields, no more', () => {
    const result = record(run({ email: 'a@x.com' }, { Email: 'a@x.com' }));
    expect(Object.keys(result).sort()).toEqual(Object.keys(EMPTY_CRM_RECORD).sort());
    expect(result).not.toHaveProperty('__row');
    expect(result).not.toHaveProperty('skip_reason');
  });
});
