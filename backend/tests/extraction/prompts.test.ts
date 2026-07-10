import { CRM_STATUS_VALUES, DATA_SOURCE_VALUES, type MappingPlan } from '@groweasy/shared';
import { describe, expect, it } from 'vitest';
import {
  buildExtractionUserPrompt,
  buildInferenceUserPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  INFERENCE_SYSTEM_PROMPT,
} from '../../src/services/extraction/prompts';

function plan(overrides: Partial<MappingPlan> = {}): MappingPlan {
  return {
    mappings: [],
    compositeColumns: [],
    unmappedColumns: [],
    detectedDateFormat: 'DD/MM/YYYY',
    detectedDefaultCountryCode: '+91',
    notes: '',
    ...overrides,
  };
}

describe('EXTRACTION_SYSTEM_PROMPT', () => {
  it('names every allowed status and data source, so the enums cannot drift apart', () => {
    for (const status of CRM_STATUS_VALUES) expect(EXTRACTION_SYSTEM_PROMPT).toContain(status);
    for (const source of DATA_SOURCE_VALUES) expect(EXTRACTION_SYSTEM_PROMPT).toContain(source);
  });

  it('carries the three few-shot examples', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('EXAMPLE 1');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('EXAMPLE 2');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('EXAMPLE 3');
    // The skip example is the one that stops the model inventing a contact to rescue a row.
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('skip_reason');
  });

  it('teaches the semantic status mapping that the whitelist alone cannot', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/hot lead/i);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/closed won/i);
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/switched off/i);
  });

  /**
   * OpenAI only caches prompt prefixes of 1024 tokens or more. Roughly four characters per token,
   * so a system prompt under ~4000 characters would silently never cache, and every batch would pay
   * full price for the same preamble.
   */
  it('is long enough to clear the provider prefix-cache threshold', () => {
    expect(EXTRACTION_SYSTEM_PROMPT.length).toBeGreaterThan(4000);
  });

  it('is a constant, so its bytes are identical on every call', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toBe(EXTRACTION_SYSTEM_PROMPT);
  });
});

describe('INFERENCE_SYSTEM_PROMPT', () => {
  it('explains how to resolve the DD/MM versus MM/DD ambiguity', () => {
    expect(INFERENCE_SYSTEM_PROMPT).toMatch(/first number above 12/i);
    expect(INFERENCE_SYSTEM_PROMPT).toMatch(/second number above 12/i);
  });

  it('forbids marking a composite column as ignore', () => {
    expect(INFERENCE_SYSTEM_PROMPT).toMatch(/NEVER mark a composite column as "ignore"/);
  });
});

describe('buildInferenceUserPrompt', () => {
  it('sends the headers and the sampled rows with their row indexes', () => {
    const user = buildInferenceUserPrompt(
      ['Client', 'Mob No.'],
      [{ rowIndex: 0, row: { Client: 'A', 'Mob No.': '1' } }],
    );

    const parsed = JSON.parse(user) as { headers: string[]; sampleRows: Array<{ __row: number }> };
    expect(parsed.headers).toEqual(['Client', 'Mob No.']);
    expect(parsed.sampleRows[0]?.__row).toBe(0);
  });
});

describe('buildExtractionUserPrompt', () => {
  const rows = [{ __row: 0, Client: 'Rajesh', 'Mob No.': '9876543210' }];

  it('carries the whole-file hints and the batch rows', () => {
    const user = buildExtractionUserPrompt({ plan: plan(), rows });

    expect(user).toContain('DD/MM/YYYY');
    expect(user).toContain('+91');
    expect(user).toContain('ROWS TO EXTRACT (1)');
    expect(user).toContain('9876543210');
  });

  it('drops the per-mapping rationale, which costs tokens on every batch', () => {
    const user = buildExtractionUserPrompt({
      plan: plan({
        mappings: [
          {
            sourceColumn: 'Client',
            targetField: 'name',
            confidence: 0.9,
            rationale: 'this rationale must not be sent',
          },
        ],
      }),
      rows,
    });

    expect(user).toContain('Client -> name');
    expect(user).not.toContain('this rationale must not be sent');
  });

  /**
   * The bug this guards against: Phase 1 marked "Name & Contact" as `ignore` while also listing it
   * as a composite column. Forwarding that would tell Phase 2 to discard the column holding every
   * name and phone number, and every row would then be skipped for having no contact details.
   */
  it('never tells the extractor to ignore a composite column', () => {
    const user = buildExtractionUserPrompt({
      plan: plan({
        mappings: [
          { sourceColumn: 'Name & Contact', targetField: 'ignore', confidence: 0.6, rationale: '' },
          { sourceColumn: 'Internal ID', targetField: 'ignore', confidence: 1, rationale: '' },
        ],
        compositeColumns: [
          {
            sourceColumn: 'Name & Contact',
            splitsInto: ['name', 'mobile_without_country_code'],
            note: 'split on the hyphen',
          },
        ],
      }),
      rows,
    });

    // The plan is the JSON object between the two section markers; the rows follow it.
    const planJson = user.slice(user.indexOf('{'), user.indexOf('ROWS TO EXTRACT')).trimEnd();
    const parsed = JSON.parse(planJson) as {
      ignoredColumns: string[];
      columnMappings: string[];
    };

    expect(parsed.ignoredColumns).toEqual(['Internal ID']);
    expect(parsed.ignoredColumns).not.toContain('Name & Contact');
    expect(parsed.columnMappings.join(' ')).toContain('Name & Contact -> composite');
  });

  it('appends the parse error on a retry, rather than just asking again', () => {
    const user = buildExtractionUserPrompt({
      plan: plan(),
      rows,
      previousError: 'records.0.crm_status: invalid enum value',
    });

    expect(user).toContain('Your previous response was rejected');
    expect(user).toContain('records.0.crm_status: invalid enum value');
  });

  it('omits the retry preamble on the first attempt', () => {
    expect(buildExtractionUserPrompt({ plan: plan(), rows })).not.toContain('previous response');
  });
});
