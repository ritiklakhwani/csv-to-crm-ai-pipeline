/**
 * Pure functions that turn whatever the source file contained into what the CRM schema demands.
 *
 * They live outside the LLM path on purpose: dates, phone numbers and email lists have exact right
 * answers, and code that can be unit-tested beats a model that has to be trusted.
 */

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

/** Collapses real line breaks into the two characters `\n`, so a record stays one CSV row. */
export function escapeNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, '\\n');
}

/** Joins note fragments without producing a leading or doubled separator. */
export function appendNote(existing: string, addition: string): string {
  const left = existing.trim();
  const right = addition.trim();
  if (!right) return left;
  if (!left) return right;
  return `${left} | ${right}`;
}

// ---------------------------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------------------------

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

/**
 * Every email in a cell, lowercased and de-duplicated, in the order they appear.
 * A cell like `one@x.com / two@y.com` is routine in hand-made sheets.
 */
export function extractEmails(value: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];

  for (const match of value.match(EMAIL_PATTERN) ?? []) {
    const email = match.toLowerCase();
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }

  return emails;
}

export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const matches = trimmed.match(EMAIL_PATTERN);
  return matches?.length === 1 && matches[0]?.length === trimmed.length;
}

// ---------------------------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------------------------

/**
 * Enough dialling codes for the data this importer actually sees. A real product would reach for
 * libphonenumber-js; a table of fifteen entries keeps this dependency-free and unit-testable, and
 * an unrecognised code degrades to an empty country_code rather than a wrong one.
 */
const COUNTRY_CODES = [
  '+880',
  '+971',
  '+966',
  '+353',
  '+977',
  '+94',
  '+92',
  '+91',
  '+86',
  '+81',
  '+65',
  '+61',
  '+49',
  '+44',
  '+33',
  '+1',
] as const;

/** National-number lengths, used only to decide whether a leading `91` is a country code. */
const NATIONAL_LENGTH: Readonly<Record<string, number>> = {
  '+91': 10,
  '+1': 10,
  '+44': 10,
  '+61': 9,
  '+971': 9,
  '+65': 8,
};

const DEFAULT_NATIONAL_LENGTH = 10;
const MIN_PHONE_DIGITS = 7;

/** Splits a cell into candidate numbers. ` and ` appears more often than you would hope. */
const PHONE_SEPARATORS = /[,;/|\n]|\band\b/i;

export interface SplitPhone {
  /** Includes the plus sign, e.g. `+91`. Empty when it cannot be determined. */
  countryCode: string;
  /** Digits only, country code and trunk prefix removed. */
  national: string;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Keeps a leading `+` if one appeared anywhere before the digits, which is how the Facebook Leads
 * export writes `p:+919876543210`.
 */
function cleanPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = digitsOnly(trimmed);
  if (!digits) return '';
  return trimmed.includes('+') ? `+${digits}` : digits;
}

/** Every phone number in a cell, cleaned and de-duplicated. */
export function extractPhones(value: string): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];

  for (const candidate of value.split(PHONE_SEPARATORS)) {
    const phone = cleanPhone(candidate);
    if (digitsOnly(phone).length < MIN_PHONE_DIGITS) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }

  return phones;
}

export function splitPhone(raw: string, defaultCountryCode = ''): SplitPhone {
  let cleaned = cleanPhone(raw);
  if (!cleaned) return { countryCode: '', national: '' };

  // `00` is the international access prefix, and means the same thing as `+`.
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;

  if (cleaned.startsWith('+')) {
    const match = COUNTRY_CODES.find((code) => cleaned.startsWith(code));
    if (!match) {
      // Guessing the split of an unknown code would put wrong digits in both fields.
      return { countryCode: '', national: cleaned.slice(1) };
    }
    return { countryCode: match, national: stripTrunkPrefix(cleaned.slice(match.length)) };
  }

  const national = stripTrunkPrefix(cleaned);
  if (!defaultCountryCode) return { countryCode: '', national };

  const codeDigits = defaultCountryCode.replace('+', '');
  const expected = NATIONAL_LENGTH[defaultCountryCode] ?? DEFAULT_NATIONAL_LENGTH;

  // Only strip a leading `91` when what remains is exactly a national number. Otherwise a genuine
  // number that happens to begin with 91 loses its first two digits.
  if (national.startsWith(codeDigits) && national.length === codeDigits.length + expected) {
    return { countryCode: defaultCountryCode, national: national.slice(codeDigits.length) };
  }

  return { countryCode: defaultCountryCode, national };
}

/** A leading zero is a domestic trunk prefix, not part of the number. */
function stripTrunkPrefix(value: string): string {
  return value.replace(/^0+/, '');
}

// ---------------------------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------------------------

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * `05/13/2026` is undecidable from one row. Phase 1 looks at the whole file and reports the format,
 * and that answer arrives here as `dayFirst`.
 */
export function parseDayFirstHint(hint: string): boolean | undefined {
  const normalized = hint.trim().toUpperCase();
  if (normalized.startsWith('DD')) return true;
  if (normalized.startsWith('MM')) return false;
  return undefined;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Returns `YYYY-MM-DD HH:mm:ss`, or null when the value is not a date.
 *
 * Wall-clock components are preserved rather than converted between timezones: the source file has
 * no timezone and inventing one would shift every lead by hours.
 */
export function normalizeDate(raw: string, dayFirst?: boolean): string | null {
  const value = raw.trim();
  if (!value) return null;

  const parts =
    parseUnix(value) ?? parseIso(value) ?? parseNamedMonth(value) ?? parseNumeric(value, dayFirst);

  if (parts && isRealDate(parts)) return format(parts);

  // Last resort: whatever the JS engine can make of it.
  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) return null;

  return format({
    year: fallback.getUTCFullYear(),
    month: fallback.getUTCMonth() + 1,
    day: fallback.getUTCDate(),
    hour: fallback.getUTCHours(),
    minute: fallback.getUTCMinutes(),
    second: fallback.getUTCSeconds(),
  });
}

const MIN_UNIX_SECONDS = 0;
const MAX_UNIX_SECONDS = 4_102_444_800; // 2100-01-01

function parseUnix(value: string): DateParts | null {
  if (!/^\d{10}$|^\d{13}$/.test(value)) return null;

  const numeric = Number(value);
  const ms = value.length === 13 ? numeric : numeric * 1000;
  if (numeric < MIN_UNIX_SECONDS || (value.length === 10 && numeric > MAX_UNIX_SECONDS))
    return null;

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

function parseIso(value: string): DateParts | null {
  const match = ISO.exec(value);
  if (!match) return null;

  return {
    year: num(match[1]),
    month: num(match[2]),
    day: num(match[3]),
    hour: num(match[4]),
    minute: num(match[5]),
    second: num(match[6]),
  };
}

const NAMED_DMY = /^(\d{1,2})[\s\-/]([a-z]{3,9})[\s\-/](\d{2,4})/i;
const NAMED_MDY = /^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})/i;

function parseNamedMonth(value: string): DateParts | null {
  const time = parseTime(value);

  const dmy = NAMED_DMY.exec(value);
  if (dmy) {
    const month = MONTHS[(dmy[2] ?? '').toLowerCase()];
    if (month) return { year: fullYear(num(dmy[3])), month, day: num(dmy[1]), ...time };
  }

  const mdy = NAMED_MDY.exec(value);
  if (mdy) {
    const month = MONTHS[(mdy[1] ?? '').toLowerCase()];
    if (month) return { year: fullYear(num(mdy[3])), month, day: num(mdy[2]), ...time };
  }

  return null;
}

const NUMERIC = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/;

function parseNumeric(value: string, dayFirst?: boolean): DateParts | null {
  const match = NUMERIC.exec(value);
  if (!match) return null;

  const first = num(match[1]);
  const second = num(match[2]);
  const year = fullYear(num(match[3]));

  // The values themselves settle it whenever they can; the whole-file hint is only consulted when
  // both numbers are 12 or less. Defaulting to day-first matches everywhere except the US.
  let day: number;
  let month: number;
  if (first > 12) {
    day = first;
    month = second;
  } else if (second > 12) {
    month = first;
    day = second;
  } else if (dayFirst === false) {
    month = first;
    day = second;
  } else {
    day = first;
    month = second;
  }

  return { year, month, day, ...parseTime(value) };
}

const TIME = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i;

function parseTime(value: string): Pick<DateParts, 'hour' | 'minute' | 'second'> {
  const match = TIME.exec(value);
  if (!match) return { hour: 0, minute: 0, second: 0 };

  let hour = num(match[1]);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return { hour, minute: num(match[2]), second: num(match[3]) };
}

function num(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseInt(value, 10);
}

/** `26` means 2026, not 1926 — these are lead creation dates, not birthdays. */
function fullYear(year: number): number {
  if (year >= 100) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/** Rejects 31 February and friends: the components must survive a round trip through Date. */
function isRealDate({ year, month, day, hour, minute, second }: DateParts): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function format({ year, month, day, hour, minute, second }: DateParts): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}
