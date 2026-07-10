import { EMPTY_CRM_RECORD, type MappingPlan } from '@groweasy/shared';
import { LlmProviderError, type LlmFailureKind } from '../../src/errors';
import type { ExtractedRecord } from '../../src/services/extraction/schemas';
import type { LlmJsonRequest, LlmJsonResult, LlmProvider } from '../../src/services/llm';

/**
 * A LlmProvider that never touches the network.
 *
 * That this is thirty lines, and needs no HTTP mocking or API key, is the payoff for the provider
 * interface. The whole pipeline can be driven deterministically.
 */

export const FAKE_PLAN: MappingPlan = {
  mappings: [],
  compositeColumns: [],
  unmappedColumns: [],
  detectedDateFormat: 'DD/MM/YYYY',
  detectedDefaultCountryCode: '+91',
  notes: 'fake plan',
};

export interface FakeProviderOptions {
  plan?: MappingPlan;
  /** Build the records for a batch. Receives the rows exactly as the prompt sent them. */
  onExtract?: (rows: Array<Record<string, string | number>>) => ExtractedRecord[];
  /** Make every extraction call fail with this kind. */
  failExtractionWith?: LlmFailureKind;
  /** Make the Phase 1 call fail. The pipeline should degrade, not die. */
  failInference?: boolean;
}

export interface FakeProvider extends LlmProvider {
  readonly calls: { inference: number; extraction: number };
}

/** Pulls the batch rows back out of the user prompt the extractor built. */
export function rowsFromPrompt(user: string): Array<Record<string, string | number>> {
  const marker = user.indexOf('ROWS TO EXTRACT');
  const start = user.indexOf('[', marker);
  return JSON.parse(user.slice(start)) as Array<Record<string, string | number>>;
}

/** Echoes each row straight back, filling email/mobile from the row so nothing is skipped. */
export function echoRecords(
  rows: Array<Record<string, string | number>>,
  overrides: Partial<ExtractedRecord> = {},
): ExtractedRecord[] {
  return rows.map((row) => {
    const values = Object.entries(row)
      .filter(([key]) => key !== '__row')
      .map(([, value]) => String(value));

    const email = values.find((value) => value.includes('@')) ?? '';
    const mobile = values.find((value) => /\d{7,}/.test(value)) ?? '';

    return {
      ...EMPTY_CRM_RECORD,
      __row: Number(row['__row']),
      skip_reason: '',
      email,
      mobile_without_country_code: mobile.replace(/\D/g, ''),
      ...overrides,
    };
  });
}

export function createFakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const calls = { inference: 0, extraction: 0 };

  const provider: FakeProvider = {
    name: 'fake',
    calls,

    completeJson<T>(request: LlmJsonRequest<T>): Promise<LlmJsonResult<T>> {
      const usage = { promptTokens: 100, cachedPromptTokens: 0, completionTokens: 50 };

      if (request.schema.name === 'mapping_plan') {
        calls.inference += 1;
        if (options.failInference) {
          return Promise.reject(new LlmProviderError('server', 'inference exploded'));
        }
        const plan = options.plan ?? FAKE_PLAN;
        return Promise.resolve({ data: plan as T, model: 'fake', cached: false, usage });
      }

      calls.extraction += 1;
      if (options.failExtractionWith) {
        return Promise.reject(
          new LlmProviderError(options.failExtractionWith, 'extraction exploded'),
        );
      }

      const rows = rowsFromPrompt(request.user);
      const records = options.onExtract ? options.onExtract(rows) : echoRecords(rows);
      return Promise.resolve({ data: { records } as T, model: 'fake', cached: false, usage });
    },
  };

  return provider;
}
