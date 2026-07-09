import { describe, expect, it } from 'vitest';
import {
  appendNote,
  escapeNewlines,
  extractEmails,
  extractPhones,
  isPlausibleEmail,
  normalizeDate,
  parseDayFirstHint,
  splitPhone,
} from '../../src/services/extraction/normalizers';

describe('escapeNewlines', () => {
  it.each([
    ['line one\nline two', 'line one\\nline two'],
    ['line one\r\nline two', 'line one\\nline two'],
    ['line one\rline two', 'line one\\nline two'],
    ['no breaks', 'no breaks'],
  ])('escapes %j', (input, expected) => {
    expect(escapeNewlines(input)).toBe(expected);
  });

  it('leaves a record as a single CSV row', () => {
    expect(escapeNewlines('a\nb\nc').includes('\n')).toBe(false);
  });
});

describe('appendNote', () => {
  it('joins two fragments', () => {
    expect(appendNote('Called them', 'No answer')).toBe('Called them | No answer');
  });

  it('does not emit a leading separator', () => {
    expect(appendNote('', 'Alt emails: b@x.com')).toBe('Alt emails: b@x.com');
  });

  it('ignores an empty addition', () => {
    expect(appendNote('Existing', '   ')).toBe('Existing');
  });

  it('returns empty when both sides are empty', () => {
    expect(appendNote('', '')).toBe('');
  });
});

describe('extractEmails', () => {
  it('finds a single address', () => {
    expect(extractEmails('john.doe@example.com')).toEqual(['john.doe@example.com']);
  });

  it('finds two addresses separated by a slash, which hand-made sheets love', () => {
    expect(extractEmails('one@x.com / two@y.com')).toEqual(['one@x.com', 'two@y.com']);
  });

  it('lowercases, so JOHN@X.COM and john@x.com are one address', () => {
    expect(extractEmails('JOHN@X.COM, john@x.com')).toEqual(['john@x.com']);
  });

  it('handles a subdomain', () => {
    expect(extractEmails('a@mail.corp.example.com')).toEqual(['a@mail.corp.example.com']);
  });

  it('pulls an address out of surrounding prose', () => {
    expect(extractEmails('reach him at bob@x.com asap')).toEqual(['bob@x.com']);
  });

  it('returns nothing when there is no address', () => {
    expect(extractEmails('not an email')).toEqual([]);
    expect(extractEmails('')).toEqual([]);
  });
});

describe('isPlausibleEmail', () => {
  it.each(['a@b.co', 'john.doe+tag@sub.example.com'])('accepts %s', (value) => {
    expect(isPlausibleEmail(value)).toBe(true);
  });

  it.each(['', 'nope', 'a@b', 'a b@c.com', 'two@x.com three@y.com'])('rejects %j', (value) => {
    expect(isPlausibleEmail(value)).toBe(false);
  });
});

describe('extractPhones', () => {
  it('keeps a plus sign that appeared before the digits', () => {
    expect(extractPhones('+91 98765 43210')).toEqual(['+919876543210']);
  });

  it('handles the Facebook Leads p: prefix', () => {
    expect(extractPhones('p:+919876543210')).toEqual(['+919876543210']);
  });

  it('splits two numbers on a slash', () => {
    expect(extractPhones('9876543210 / 9988776655')).toEqual(['9876543210', '9988776655']);
  });

  it('splits on the word "and"', () => {
    expect(extractPhones('9876543210 and 9988776655')).toEqual(['9876543210', '9988776655']);
  });

  it('de-duplicates', () => {
    expect(extractPhones('9876543210, 9876543210')).toEqual(['9876543210']);
  });

  it('ignores fragments too short to be a phone number', () => {
    expect(extractPhones('ext 42')).toEqual([]);
  });

  it('returns nothing for text', () => {
    expect(extractPhones('call back later')).toEqual([]);
  });
});

describe('splitPhone', () => {
  it.each([
    ['+919876543210', '', '+91', '9876543210'],
    ['+91 98765 43210', '', '+91', '9876543210'],
    ['p:+91-98765-43210', '', '+91', '9876543210'],
    ['0091 9876543210', '', '+91', '9876543210'],
    ['+1 (415) 555-0100', '', '+1', '4155550100'],
    ['+971 50 123 4567', '', '+971', '501234567'],
  ])('splits %s -> %s %s', (raw, fallback, code, national) => {
    expect(splitPhone(raw, fallback)).toEqual({ countryCode: code, national });
  });

  it('strips a country code that is written without a plus', () => {
    expect(splitPhone('919876543210', '+91')).toEqual({
      countryCode: '+91',
      national: '9876543210',
    });
  });

  /**
   * The trap: 9198765432 is a ten-digit national number that happens to begin with 91. Stripping it
   * would silently corrupt the number.
   */
  it('does not mistake a leading 91 for a country code when the length is wrong', () => {
    expect(splitPhone('9198765432', '+91')).toEqual({
      countryCode: '+91',
      national: '9198765432',
    });
  });

  it('drops a domestic trunk zero', () => {
    expect(splitPhone('09876543210', '+91')).toEqual({
      countryCode: '+91',
      national: '9876543210',
    });
  });

  it('drops the trunk zero before recognising the country code', () => {
    expect(splitPhone('0919876543210', '+91')).toEqual({
      countryCode: '+91',
      national: '9876543210',
    });
  });

  it('applies the whole-file default to a bare national number', () => {
    expect(splitPhone('98765 43210', '+91')).toEqual({
      countryCode: '+91',
      national: '9876543210',
    });
  });

  it('leaves country_code empty when nothing indicates one', () => {
    expect(splitPhone('9876543210')).toEqual({ countryCode: '', national: '9876543210' });
  });

  /** Guessing the split of an unknown code would put wrong digits in both fields. */
  it('refuses to guess an unrecognised dialling code', () => {
    expect(splitPhone('+99912345678')).toEqual({ countryCode: '', national: '99912345678' });
  });

  it('returns empty for a cell with no digits', () => {
    expect(splitPhone('n/a')).toEqual({ countryCode: '', national: '' });
    expect(splitPhone('')).toEqual({ countryCode: '', national: '' });
  });
});

describe('parseDayFirstHint', () => {
  it.each([
    ['DD/MM/YYYY', true],
    ['dd-mm-yyyy', true],
    ['MM/DD/YYYY', false],
    ['ISO 8601', undefined],
    ['', undefined],
  ])('reads %s', (hint, expected) => {
    expect(parseDayFirstHint(hint)).toBe(expected);
  });
});

describe('normalizeDate', () => {
  it('passes the assignment example straight through', () => {
    expect(normalizeDate('2026-05-13 14:20:48')).toBe('2026-05-13 14:20:48');
  });

  it.each([
    ['2026-05-13T14:20:48Z', '2026-05-13 14:20:48'],
    ['2026-05-13T14:20:48', '2026-05-13 14:20:48'],
    ['2026-05-13', '2026-05-13 00:00:00'],
    ['2026-5-3', '2026-05-03 00:00:00'],
  ])('parses ISO %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it.each([
    ['13-May-2026', '2026-05-13 00:00:00'],
    ['13 May 2026', '2026-05-13 00:00:00'],
    ['13/September/2026', '2026-09-13 00:00:00'],
    ['May 13, 2026', '2026-05-13 00:00:00'],
    ['13-May-26', '2026-05-13 00:00:00'],
  ])('parses named month %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  /**
   * Read as UTC, not as the server's local time, so the result does not change when the container
   * runs in a different timezone from the developer's laptop.
   */
  it('parses unix seconds and milliseconds as UTC', () => {
    expect(normalizeDate('1778760048')).toBe('2026-05-14 12:00:48');
    expect(normalizeDate('1778760048000')).toBe('2026-05-14 12:00:48');
  });

  it('ignores a ten-digit value that is not a plausible timestamp', () => {
    expect(normalizeDate('9999999999999999')).toBeNull();
  });

  describe('the DD/MM versus MM/DD ambiguity', () => {
    it('uses the day when it cannot be a month', () => {
      expect(normalizeDate('13/05/2026')).toBe('2026-05-13 00:00:00');
    });

    it('uses the month when the second number cannot be one', () => {
      expect(normalizeDate('05/13/2026')).toBe('2026-05-13 00:00:00');
    });

    /** Both numbers are <= 12, so only the whole-file hint from Phase 1 can resolve this. */
    it('defers to the day-first hint when both readings are possible', () => {
      expect(normalizeDate('05/06/2026', true)).toBe('2026-06-05 00:00:00');
    });

    it('defers to the month-first hint when both readings are possible', () => {
      expect(normalizeDate('05/06/2026', false)).toBe('2026-05-06 00:00:00');
    });

    it('defaults to day-first with no hint, which is everywhere except the US', () => {
      expect(normalizeDate('05/06/2026')).toBe('2026-06-05 00:00:00');
    });
  });

  it('parses a date with a time', () => {
    expect(normalizeDate('29-06-2026 10:00')).toBe('2026-06-29 10:00:00');
    expect(normalizeDate('13/05/2026 14:20:48')).toBe('2026-05-13 14:20:48');
  });

  it('understands am and pm', () => {
    expect(normalizeDate('13/05/2026 2:20 pm')).toBe('2026-05-13 14:20:00');
    expect(normalizeDate('13/05/2026 12:05 am')).toBe('2026-05-13 00:05:00');
    expect(normalizeDate('13/05/2026 12:05 pm')).toBe('2026-05-13 12:05:00');
  });

  it('expands a two-digit year forward, since these are lead dates', () => {
    expect(normalizeDate('13/05/26')).toBe('2026-05-13 00:00:00');
  });

  it('rejects a calendar date that does not exist', () => {
    expect(normalizeDate('31/02/2026')).toBeNull();
  });

  it.each(['', '   ', 'not a date', 'N/A', '-'])('returns null for %j', (input) => {
    expect(normalizeDate(input)).toBeNull();
  });

  /** The whole point: rule 3 of the assignment. */
  it('always produces a string that new Date() accepts', () => {
    const inputs = [
      '2026-05-13 14:20:48',
      '13/05/2026',
      '13-May-2026',
      '1778760048',
      '05/13/2026 2:20 pm',
    ];

    for (const input of inputs) {
      const normalized = normalizeDate(input);
      expect(normalized).not.toBeNull();
      expect(Number.isNaN(new Date(normalized as string).getTime())).toBe(false);
    }
  });
});
