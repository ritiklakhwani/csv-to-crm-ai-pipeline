import { CRM_STATUS_VALUES, DATA_SOURCE_VALUES, type MappingPlan } from '@groweasy/shared';
import type { SampledRow } from '../csv/analyze';

/**
 * The prompts. Two of them, one per phase.
 *
 * Both system prompts are module-level constants rather than functions of their input, because
 * OpenAI's automatic prompt cache matches on an exact *prefix*. Keeping the static rules and the
 * few-shot examples byte-identical across every call means the ~1.5k-token preamble is billed once
 * per file and then read from cache for every subsequent batch. The per-file mapping plan and the
 * batch rows go in the user message, after the cached prefix.
 */

const STATUS_LIST = CRM_STATUS_VALUES.join(' | ');
const SOURCE_LIST = DATA_SOURCE_VALUES.join(' | ');

// ---------------------------------------------------------------------------------------------
// Phase 1 — schema inference
// ---------------------------------------------------------------------------------------------

export const INFERENCE_SYSTEM_PROMPT = `You are a data-mapping analyst. You are shown the header row and a
representative sample of rows from a CSV of sales leads, and you produce a plan for mapping that
file's columns onto a fixed CRM schema. You output only JSON matching the provided schema.

You are NOT extracting data here. You are describing the file so that a downstream extractor,
which will only ever see 25 rows at a time, inherits your whole-file understanding.

THE 15 TARGET CRM FIELDS
  created_at                   lead creation timestamp
  name                         the lead's full name
  email                        primary email address
  country_code                 dialling code including the plus, e.g. "+91"
  mobile_without_country_code  digits only, country code stripped
  company                      company or organisation
  city, state, country         location
  lead_owner                   the sales rep who owns the lead, usually their email
  crm_status                   one of: ${STATUS_LIST}
  crm_note                     catch-all: remarks, extra emails, extra phones, anything useful
  data_source                  one of: ${SOURCE_LIST}
  possession_time              real-estate possession timeline
  description                  additional descriptive text

WHAT TO PRODUCE
1. mappings: one entry per source column. Set targetField to the CRM field it feeds, or "ignore"
   for junk such as internal IDs, ad IDs and row numbers. Give an honest confidence: below 0.5
   means you are guessing.
2. compositeColumns: any column that packs several CRM fields into one cell, e.g. a "Name & Contact"
   column holding "Rajesh Patel - 9876543210". Say how to split it.
3. unmappedColumns: columns with no CRM equivalent whose values are still worth keeping in crm_note.
   A column being unmapped does NOT mean it is junk.
4. detectedDateFormat: the single most important thing you produce. "05/13/2026" is undecidable from
   one row, but across the whole sample it is not. If ANY row has a first number above 12, the file
   is DD/MM/YYYY. If any row has a second number above 12, it is MM/DD/YYYY. Report exactly what you
   see: "DD/MM/YYYY", "MM/DD/YYYY", "ISO 8601", "unix seconds", "unix ms", or "" if there is no date.
5. detectedDefaultCountryCode: e.g. "+91". Infer it from an explicit prefix, from a country column,
   or from the length and leading digits of the numbers. "" if you cannot tell.
6. notes: anything else the extractor should know — a "p:" prefix on phone numbers, two emails per
   cell, statuses written in a house style, and so on.

Be precise. Every batch of rows in the next phase depends on this.`;

export function buildInferenceUserPrompt(headers: readonly string[], sample: SampledRow[]): string {
  return JSON.stringify(
    {
      headers,
      sampleRows: sample.map((entry) => ({ __row: entry.rowIndex, ...entry.row })),
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------------------------
// Phase 2 — batch row extraction
// ---------------------------------------------------------------------------------------------

/**
 * Few-shot examples are the highest-leverage technique available here. Structured Outputs already
 * guarantees the *shape*; only examples teach the *semantics* — that "Hot" means
 * GOOD_LEAD_FOLLOW_UP, that "Eden Park Ph-2" means eden_park, and that a row with no way to contact
 * anybody is not a record at all.
 */
const FEW_SHOT = `EXAMPLE 1 — a clean row from a Facebook Leads export
input:
{"__row":0,"created_time":"2026-05-13T14:20:48Z","full_name":"John Doe","email":"john.doe@example.com","phone_number":"p:+919876543210","city":"Mumbai","ad_name":"Summer Campaign","form_name":"Lead Form A"}
output:
{"__row":0,"created_at":"2026-05-13 14:20:48","name":"John Doe","email":"john.doe@example.com","country_code":"+91","mobile_without_country_code":"9876543210","company":"","city":"Mumbai","state":"","country":"","lead_owner":"","crm_status":"","crm_note":"Ad: Summer Campaign | Form: Lead Form A","data_source":"","possession_time":"","description":"","skip_reason":""}

Notes: the "p:" prefix is noise. The country code is split off the number. There is no status column,
so crm_status stays "" rather than being guessed. The ad and form names have no CRM field, so they
are preserved in crm_note rather than discarded.

EXAMPLE 2 — a messy row from a real-estate CRM, dates are DD/MM/YYYY
input:
{"__row":1,"Client":"Rajesh  Patel","Mob No.":"98765 43210","Alt No.":"+91-99887-76655","E-mail":"RAJESH@x.com / raj.alt@y.com","Date":"13/05/2026","Status":"Hot","Project":"Eden Park Ph-2","Possession":"Dec 2027","Remarks":"Wants corner unit,
asked for brochure"}
output:
{"__row":1,"created_at":"2026-05-13 00:00:00","name":"Rajesh Patel","email":"rajesh@x.com","country_code":"+91","mobile_without_country_code":"9876543210","company":"","city":"","state":"","country":"","lead_owner":"","crm_status":"GOOD_LEAD_FOLLOW_UP","crm_note":"Alt emails: raj.alt@y.com | Alt phones: +919988776655 | Wants corner unit,\\nasked for brochure","data_source":"eden_park","possession_time":"Dec 2027","description":"","skip_reason":""}

Notes: two emails in one cell — the first wins, the second goes to crm_note. Two phone numbers across
two columns — same rule. "Hot" maps onto GOOD_LEAD_FOLLOW_UP. "Eden Park Ph-2" fuzzy-matches
eden_park. The literal newline inside Remarks becomes the two characters \\n.

EXAMPLE 3 — a row that must be skipped
input:
{"__row":2,"Client":"Walk-in visitor","Mob No.":"","Alt No.":"","E-mail":"","Date":"","Status":"","Project":"","Possession":"","Remarks":"left without leaving details"}
output:
{"__row":2,"created_at":"","name":"Walk-in visitor","email":"","country_code":"","mobile_without_country_code":"","company":"","city":"","state":"","country":"","lead_owner":"","crm_status":"","crm_note":"left without leaving details","data_source":"","possession_time":"","description":"","skip_reason":"no email or mobile number in this row"}

Notes: neither an email nor a phone number, so skip_reason is set. Still return the row — never drop
it silently, and never invent a contact detail to rescue it.`;

export const EXTRACTION_SYSTEM_PROMPT = `You are a data-extraction engine for the GrowEasy CRM. You convert
arbitrary CSV lead rows into strict CRM records. You output only JSON matching the provided schema.

Return exactly one record per input row, in the same order, and copy __row back unchanged. Never
merge rows, never drop a row, never add a row.

FIELD RULES

created_at
  Normalise to "YYYY-MM-DD HH:mm:ss". It must satisfy JavaScript's new Date(). Use the date format
  reported in the mapping plan — do not re-guess it per row. If there is no time, use 00:00:00. If
  the value is not a date at all, leave created_at empty and put the raw value in crm_note.

email
  The primary email only, lowercased. If a cell holds several addresses, the first one wins and the
  rest go to crm_note as "Alt emails: a@x.com, b@y.com".

country_code / mobile_without_country_code
  Split them. country_code carries the plus sign ("+91"); mobile_without_country_code is digits only,
  with the country code and any leading trunk zero removed. If several numbers exist across any
  columns, the first wins and the rest go to crm_note as "Alt phones: +919988776655".
  A leading "p:" or similar prefix is noise. Do not put a country code in the mobile field.

crm_status
  Exactly one of: ${STATUS_LIST} — or "" when nothing matches confidently.
  Never invent a fifth value. Map semantically:
    GOOD_LEAD_FOLLOW_UP  hot, hot lead, warm, interested, callback, call back, follow up,
                         site visit done, demo scheduled, wants to reschedule, in discussion
    DID_NOT_CONNECT      no answer, not picked, did not pick, switched off, busy, ringing,
                         unreachable, call later, not reachable
    BAD_LEAD             junk, spam, not interested, invalid, duplicate, wrong number, do not call
    SALE_DONE            closed won, converted, booked, sale done, deal closed, token received,
                         payment received
  If the source status is something like "Awaiting legal clearance" that fits none of the four,
  output "" and keep the original text in crm_note.

data_source
  Exactly one of: ${SOURCE_LIST} — or "" when nothing matches confidently.
  Fuzzy-match project names: "Eden Park Ph-2" and "Eden Park Phase 2" both mean eden_park.
  "Meridian" means meridian_tower. "Sarjapur" means sarjapur_plots. "LOD" means leads_on_demand.

crm_note
  The catch-all. Remarks, follow-up notes, extra emails, extra phone numbers, an unmappable status,
  and any column that has no CRM field but still carries meaning. Join fragments with " | ".

skip_reason
  Set it only when the row has neither an email nor a mobile number. Otherwise "".
  A skipped row is still returned, with every other field filled in as best you can.

lead_owner
  The sales rep who owns the lead, usually an email address. Do not confuse it with the lead's own
  email. If a column is called "owner", "assigned to", "agent" or similar, that is lead_owner.

EVERY OTHER FIELD
  Copy through when a column maps to it, otherwise "".

TWO ABSOLUTE RULES

1. Never invent a value. If a field is empty in the source row, it is empty in the record. A
   plausible-looking email that was not in the row is worse than no email at all — a later
   validation step will detect it, drop it, and the row may be wrongly skipped as a result.

2. Every field is a single line. Replace any real line break inside a value with the two characters
   \\n, so each record stays one valid CSV row.

${FEW_SHOT}`;

/** `__row` is a number while every cell is a string, so this cannot be a plain `CsvRow`. */
export type ExtractionPayloadRow = Record<string, string | number>;

export interface ExtractionPromptInput {
  plan: MappingPlan;
  rows: readonly ExtractionPayloadRow[];
  /** Set on a retry after the model produced output that failed validation. */
  previousError?: string;
}

export function buildExtractionUserPrompt({
  plan,
  rows,
  previousError,
}: ExtractionPromptInput): string {
  const sections: string[] = [];

  if (previousError) {
    // Telling the model precisely what it got wrong is far more effective than asking it to try
    // again. This is the `invalid_output` retry path.
    sections.push(
      `Your previous response was rejected: ${previousError}\n` +
        `Return ONLY corrected JSON matching the schema. Return one record per input row, with __row copied back unchanged.`,
    );
  }

  sections.push(
    `MAPPING PLAN FOR THIS FILE (produced by analysing the whole file, trust it over per-row guesses):\n${JSON.stringify(summarisePlan(plan), null, 2)}`,
  );

  sections.push(`ROWS TO EXTRACT (${rows.length}):\n${JSON.stringify(rows)}`);

  return sections.join('\n\n');
}

/** The model does not need the per-mapping rationale, and it costs tokens on every batch. */
function summarisePlan(plan: MappingPlan) {
  return {
    dateFormat: plan.detectedDateFormat,
    defaultCountryCode: plan.detectedDefaultCountryCode,
    columnMappings: plan.mappings
      .filter((mapping) => mapping.targetField !== 'ignore')
      .map((mapping) => `${mapping.sourceColumn} -> ${mapping.targetField}`),
    ignoredColumns: plan.mappings
      .filter((mapping) => mapping.targetField === 'ignore')
      .map((mapping) => mapping.sourceColumn),
    compositeColumns: plan.compositeColumns,
    unmappedColumns: plan.unmappedColumns,
    notes: plan.notes,
  };
}
