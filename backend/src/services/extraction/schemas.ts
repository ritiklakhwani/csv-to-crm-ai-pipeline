import { crmRecordSchema } from '@groweasy/shared';
import { z } from 'zod';

/**
 * The wire schema handed to the model as a strict JSON Schema.
 *
 * Kept separate from the post-validation logic on purpose. Zod v4 throws when a bare transform
 * reaches `zodResponseFormat`, and OpenAI's strict mode rejects constraint keywords like `minLength`
 * — so this file may only contain plain strings, numbers, enums, arrays and objects. Every rule with
 * teeth lives in `post-validator.ts`, in code that can be unit-tested.
 */
export const extractedRecordSchema = crmRecordSchema.extend({
  __row: z
    .number()
    .describe('The row index that was supplied with this row. Copy it back unchanged.'),
  skip_reason: z.string().describe('Why this row cannot become a CRM record, or "" when it can.'),
});

/** Structured Outputs requires an object at the root, so the array is wrapped. */
export const extractionBatchSchema = z.object({
  records: z.array(extractedRecordSchema),
});

export type ExtractedRecord = z.infer<typeof extractedRecordSchema>;
export type ExtractionBatch = z.infer<typeof extractionBatchSchema>;
