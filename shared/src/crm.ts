import { z } from 'zod';

/**
 * The GrowEasy CRM contract.
 *
 * Two rules govern every schema in this file, and both exist because these schemas are handed
 * verbatim to an LLM as a strict JSON Schema:
 *
 *  1. Every property is REQUIRED. Optional fields are expressed as `''`, never as `undefined` or
 *     `null`. OpenAI's strict Structured Outputs mode requires every property to appear in
 *     `required`, so modelling "empty" as an empty string sidesteps the problem entirely.
 *
 *  2. No transforms, no refinements, no `.min()`/`.max()`/`.email()`. Zod v4 throws when a bare
 *     transform reaches `zodResponseFormat`, and OpenAI's strict mode rejects constraint keywords
 *     such as `minLength` and `format`. Coercion and business rules live in the post-validator, in
 *     plain testable TypeScript — never in the wire schema.
 */

/** The 15 CRM fields, in the exact order they must appear in an exported CSV row. */
export const CRM_FIELDS = [
  'created_at',
  'name',
  'email',
  'country_code',
  'mobile_without_country_code',
  'company',
  'city',
  'state',
  'country',
  'lead_owner',
  'crm_status',
  'crm_note',
  'data_source',
  'possession_time',
  'description',
] as const;

export type CrmField = (typeof CRM_FIELDS)[number];

/** The only four values `crm_status` may ever hold. A 5th value is a bug, not a feature. */
export const CRM_STATUS_VALUES = [
  'GOOD_LEAD_FOLLOW_UP',
  'DID_NOT_CONNECT',
  'BAD_LEAD',
  'SALE_DONE',
] as const;

export type CrmStatus = (typeof CRM_STATUS_VALUES)[number];

/** The only five values `data_source` may ever hold. */
export const DATA_SOURCE_VALUES = [
  'leads_on_demand',
  'meridian_tower',
  'eden_park',
  'varah_swamy',
  'sarjapur_plots',
] as const;

export type DataSource = (typeof DATA_SOURCE_VALUES)[number];

/**
 * `''` is a first-class member of both enums: it is how the model says "I am not confident".
 * Including it in the enum means the model is *decoding-constrained* away from inventing a 5th
 * status, rather than merely being asked nicely not to.
 */
export const CRM_STATUS_ENUM = ['', ...CRM_STATUS_VALUES] as const;
export const DATA_SOURCE_ENUM = ['', ...DATA_SOURCE_VALUES] as const;

export const crmRecordSchema = z.object({
  created_at: z
    .string()
    .describe('Lead creation timestamp as YYYY-MM-DD HH:mm:ss, or "" if absent or unparseable.'),
  name: z.string().describe('Full name of the lead.'),
  email: z.string().describe('Primary email only. Additional emails belong in crm_note.'),
  country_code: z
    .string()
    .describe('Dialling code including the plus sign, e.g. "+91". "" if it cannot be determined.'),
  mobile_without_country_code: z
    .string()
    .describe('Digits only, country code stripped. Additional numbers belong in crm_note.'),
  company: z.string().describe('Company or organisation name.'),
  city: z.string().describe('City name.'),
  state: z.string().describe('State or province.'),
  country: z.string().describe('Country name.'),
  lead_owner: z.string().describe('The sales rep who owns this lead, usually an email address.'),
  crm_status: z
    .enum(CRM_STATUS_ENUM)
    .describe('One of the four allowed statuses, or "" when confidence is low.'),
  crm_note: z
    .string()
    .describe(
      'Catch-all: remarks, follow-up notes, extra emails, extra phone numbers, and any useful ' +
        'value that does not fit another field. Newlines must be escaped as the two characters \\n.',
    ),
  data_source: z
    .enum(DATA_SOURCE_ENUM)
    .describe('One of the five allowed sources, or "" when no confident match exists.'),
  possession_time: z.string().describe('Real-estate possession timeline, if present.'),
  description: z.string().describe('Any additional descriptive text.'),
});

export type CrmRecord = z.infer<typeof crmRecordSchema>;

/** An all-empty record. The post-validator builds every output on top of this. */
export const EMPTY_CRM_RECORD: CrmRecord = {
  created_at: '',
  name: '',
  email: '',
  country_code: '',
  mobile_without_country_code: '',
  company: '',
  city: '',
  state: '',
  country: '',
  lead_owner: '',
  crm_status: '',
  crm_note: '',
  data_source: '',
  possession_time: '',
  description: '',
};

export function isCrmStatus(value: string): value is CrmStatus {
  return (CRM_STATUS_VALUES as readonly string[]).includes(value);
}

export function isDataSource(value: string): value is DataSource {
  return (DATA_SOURCE_VALUES as readonly string[]).includes(value);
}
