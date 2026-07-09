import { z } from 'zod';
import { CRM_FIELDS } from './crm';

/**
 * The output of Phase 1 (schema inference): a whole-file understanding of what each column means.
 *
 * This exists because some questions are *undecidable from a single row*. Is `05/13/2026` May 13th
 * or the 5th day of the 13th month? You cannot know. But if any row in the file contains
 * `13/05/2026`, the format is unambiguously day-first. Phase 1 buys that global context once, then
 * every Phase 2 batch inherits it.
 */

/** A column may map onto any CRM field, or be explicitly ignored. */
export const MAPPING_TARGETS = [...CRM_FIELDS, 'ignore'] as const;
export type MappingTarget = (typeof MAPPING_TARGETS)[number];

export const columnMappingSchema = z.object({
  sourceColumn: z.string().describe('The column header exactly as it appears in the CSV.'),
  targetField: z
    .enum(MAPPING_TARGETS)
    .describe('The CRM field this column feeds, or "ignore" for junk such as internal IDs.'),
  confidence: z.number().describe('0 to 1. Below 0.5 means "guessing".'),
  rationale: z.string().describe('One short sentence explaining the mapping.'),
});

export const compositeColumnSchema = z.object({
  sourceColumn: z
    .string()
    .describe('A column holding more than one CRM field, e.g. "Name & Phone".'),
  splitsInto: z.array(z.enum(MAPPING_TARGETS)).describe('The CRM fields packed into this column.'),
  note: z.string().describe('How to split it, e.g. "name then phone, separated by a hyphen".'),
});

export const mappingPlanSchema = z.object({
  mappings: z.array(columnMappingSchema),
  compositeColumns: z.array(compositeColumnSchema),
  unmappedColumns: z
    .array(z.string())
    .describe(
      'Columns with no CRM equivalent whose values may still be worth keeping in crm_note.',
    ),
  detectedDateFormat: z
    .string()
    .describe('e.g. "DD/MM/YYYY", "ISO 8601", "unix ms". "" if there is no date column.'),
  detectedDefaultCountryCode: z
    .string()
    .describe('e.g. "+91", inferred from number length, an explicit prefix, or a country column.'),
  notes: z.string().describe('Anything else a downstream extractor should know about this file.'),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;
export type CompositeColumn = z.infer<typeof compositeColumnSchema>;
export type MappingPlan = z.infer<typeof mappingPlanSchema>;
