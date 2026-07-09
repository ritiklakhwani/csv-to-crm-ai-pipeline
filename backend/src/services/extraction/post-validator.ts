import {
  EMPTY_CRM_RECORD,
  isCrmStatus,
  isDataSource,
  type CrmRecord,
  type CrmStatus,
  type CsvRow,
  type DataSource,
  type SkippedRecord,
} from '@groweasy/shared';
import {
  appendNote,
  escapeNewlines,
  extractEmails,
  extractPhones,
  normalizeDate,
  splitPhone,
  type SplitPhone,
} from './normalizers';
import type { ExtractedRecord } from './schemas';

/**
 * Phase 3. Every record the model returns passes through here on the assumption that it is wrong.
 *
 * Constrained decoding already guarantees a *structurally* valid record. What it cannot guarantee is
 * a *truthful* one: the model can still hallucinate an email that was never in the row, or read
 * 05/13 as the 5th of the 13th month. That is what this file is for.
 */

export interface ValidationContext {
  /** From Phase 1: resolves `05/06/2026` when both readings are possible. */
  dayFirst?: boolean;
  /** From Phase 1: e.g. `+91`, applied to bare national numbers. */
  defaultCountryCode?: string;
}

export type ValidationOutcome =
  { kind: 'record'; record: CrmRecord } | { kind: 'skipped'; skipped: SkippedRecord };

/** Fields copied across as-is. None of them can be cross-checked against the row. */
const PASSTHROUGH_FIELDS = [
  'name',
  'company',
  'city',
  'state',
  'country',
  'lead_owner',
  'possession_time',
  'description',
] as const;

export function validateRecord(
  extracted: ExtractedRecord,
  raw: CsvRow,
  rowIndex: number,
  context: ValidationContext = {},
): ValidationOutcome {
  const notes: string[] = [];
  const haystack = buildHaystack(raw);
  const record: CrmRecord = { ...EMPTY_CRM_RECORD };

  for (const field of PASSTHROUGH_FIELDS) {
    record[field] = text(extracted[field]);
  }

  record.crm_status = coerceEnum<CrmStatus>(extracted.crm_status, isCrmStatus, 'crm_status', notes);
  record.data_source = coerceEnum<DataSource>(
    extracted.data_source,
    isDataSource,
    'data_source',
    notes,
  );

  record.created_at = resolveDate(extracted.created_at, context.dayFirst, notes);
  record.email = resolveEmail(extracted.email, haystack, notes);

  const phone = resolvePhone(extracted, haystack, context, notes);
  record.mobile_without_country_code = phone.national;
  record.country_code = phone.countryCode;

  record.crm_note = escapeNewlines([text(extracted.crm_note), ...notes].reduce(appendNote, ''));

  // Rule 7, re-enforced in code because the model can miss it.
  if (!record.email && !record.mobile_without_country_code) {
    const reason = text(extracted.skip_reason) || 'no email or mobile number in this row';
    return { kind: 'skipped', skipped: { rowIndex, raw, skip_reason: reason } };
  }

  return { kind: 'record', record };
}

// ---------------------------------------------------------------------------------------------

interface Haystack {
  /** Every cell, lowercased. */
  text: string;
  /** Every digit in the row, concatenated. */
  digits: string;
}

function buildHaystack(raw: CsvRow): Haystack {
  const joined = Object.values(raw).join(' ').toLowerCase();
  return { text: joined, digits: joined.replace(/\D/g, '') };
}

function text(value: string): string {
  return escapeNewlines(value.trim());
}

/**
 * Structured Outputs already constrains the model to the whitelist, so this should never fire. It
 * fires anyway if the schema is ever loosened, and it keeps the raw value rather than deleting it.
 */
function coerceEnum<T extends string>(
  value: string,
  guard: (candidate: string) => candidate is T,
  field: string,
  notes: string[],
): T | '' {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (guard(trimmed)) return trimmed;

  notes.push(`${field} outside whitelist: ${trimmed}`);
  return '';
}

/** Rule 3: `new Date(created_at)` must be valid. An unparseable date moves to the note, not the bin. */
function resolveDate(value: string, dayFirst: boolean | undefined, notes: string[]): string {
  const raw = value.trim();
  if (!raw) return '';

  const normalized = normalizeDate(raw, dayFirst);
  if (normalized) return normalized;

  notes.push(`unparsed date: ${raw}`);
  return '';
}

/**
 * The anti-hallucination cross-check, deliberately narrow.
 *
 * A hard "every field must appear in the raw row" rule would blank `country_code` on every record,
 * because it is *inferred* from the number's shape and is never literally present. So the check
 * applies only to email and to the national phone digits, and a value that fails it is preserved in
 * `crm_note` rather than deleted — the assignment prefers empty over invented, but never prefers
 * lost.
 */
function resolveEmail(value: string, haystack: Haystack, notes: string[]): string {
  const emails = extractEmails(value.trim());
  if (emails.length === 0) return '';

  const verified = emails.filter((email) => haystack.text.includes(email));
  const invented = emails.filter((email) => !haystack.text.includes(email));

  for (const email of invented) notes.push(`dropped unverified email: ${email}`);

  // Rule 5: first email wins, the rest go to the note.
  const [primary, ...extras] = verified;
  if (extras.length > 0) notes.push(`Alt emails: ${extras.join(', ')}`);

  return primary ?? '';
}

const COUNTRY_CODE_PATTERN = /^\+?\d{1,4}$/;

function normalizeCountryCode(value: string): string {
  const trimmed = value.trim();
  if (!COUNTRY_CODE_PATTERN.test(trimmed)) return '';
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

function resolvePhone(
  extracted: ExtractedRecord,
  haystack: Haystack,
  context: ValidationContext,
  notes: string[],
): SplitPhone {
  const source = extracted.mobile_without_country_code.trim();
  const fallbackCode =
    normalizeCountryCode(extracted.country_code) || (context.defaultCountryCode ?? '');

  const candidates = extractPhones(source).map((phone) => splitPhone(phone, fallbackCode));

  const verified = candidates.filter(
    (phone) => phone.national.length > 0 && haystack.digits.includes(phone.national),
  );
  const invented = candidates.filter(
    (phone) => phone.national.length > 0 && !haystack.digits.includes(phone.national),
  );

  for (const phone of invented) notes.push(`dropped unverified phone: ${phone.national}`);

  const [primary, ...extras] = verified;
  if (extras.length > 0) {
    // Rule 5 again: extra mobiles belong in the note.
    notes.push(`Alt phones: ${extras.map((p) => `${p.countryCode}${p.national}`).join(', ')}`);
  }

  if (!primary) return { countryCode: '', national: '' };

  return {
    national: primary.national,
    // A country code with no number attached is noise, so it is only kept alongside one.
    countryCode: primary.countryCode || fallbackCode,
  };
}
