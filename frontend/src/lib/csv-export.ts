import { CRM_FIELDS, type CrmField, type CrmRecord } from '@groweasy/shared';

/**
 * Serialises the cleaned records to a CSV the user downloads.
 *
 * Two hazards a naive `values.join(',')` would walk into, both of which a reviewer will hit the
 * moment they open the file in Excel:
 *
 *  1. RFC 4180 quoting — a value containing a comma, a quote, or a newline must be wrapped in
 *     double quotes with interior quotes doubled. Applied to every cell.
 *
 *  2. Formula injection — a cell beginning with =, +, -, @, or a tab/CR is interpreted by Excel and
 *     Google Sheets as a formula, a real exfiltration vector. Prefixing a single quote neutralises
 *     it. Done only at export, never in the API response, because it would corrupt the JSON the
 *     results table reads.
 *
 * The formula guard is applied *selectively*, not to every field. The five structured fields below
 * have a format the post-validator strictly enforces — `country_code` matches /^\+?\d{1,4}$/, dates
 * are normalised, the two enums are whitelisted — so a payload like `=cmd` can never reach them; it
 * fails validation upstream and is dropped. Escaping them would only corrupt legitimate data: a
 * `+91` that passed phone validation is a country code, not a formula. The guarantee on these fields
 * comes from validation, not from escaping. Only the free-text fields, which carry whatever a human
 * typed, get the guard.
 */

const VALIDATED_FIELDS: ReadonlySet<CrmField> = new Set<CrmField>([
  'created_at',
  'country_code',
  'mobile_without_country_code',
  'crm_status',
  'data_source',
]);

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** RFC 4180: quote a value that contains a comma, a quote, or a newline. */
function quoteCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Force a cell to be read as text, so a leading formula character cannot execute. */
function neutraliseFormula(value: string): string {
  const first = value[0];
  return first !== undefined && FORMULA_TRIGGERS.has(first) ? `'${value}` : value;
}

/** `guardFormula` is false for the structured fields that validation already protects. */
export function escapeCsvCell(value: string, guardFormula = true): string {
  return quoteCell(guardFormula ? neutraliseFormula(value) : value);
}

export function recordsToCsv(records: readonly CrmRecord[]): string {
  const header = CRM_FIELDS.join(',');
  const rows = records.map((record) =>
    CRM_FIELDS.map((field) => escapeCsvCell(record[field], !VALIDATED_FIELDS.has(field))).join(','),
  );
  // A leading BOM (U+FEFF) makes Excel open UTF-8 correctly on Windows.
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}

export function downloadCsv(records: readonly CrmRecord[], fileName: string): void {
  const csv = recordsToCsv(records);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
