import type { MappingPlan } from '@groweasy/shared';
import { describe, expect, it } from 'vitest';
import { normaliseMappingPlan } from '../../src/services/extraction/mapping-plan';

const HEADERS = ['Name & Contact', 'E-MAIL', 'project interested', 'legacy_code', 'Internal ID'];

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

const map = (
  sourceColumn: string,
  targetField: MappingPlan['mappings'][number]['targetField'],
) => ({
  sourceColumn,
  targetField,
  confidence: 0.9,
  rationale: '',
});

/** The three lists in a plan must be disjoint. Nothing in the schema can enforce that. */
describe('normaliseMappingPlan', () => {
  describe('composite columns can never be junk', () => {
    /**
     * Observed in production: Phase 1 marked "Name & Contact" as `ignore` while also describing how
     * to split it. Forwarding that tells Phase 2 to discard every name and phone number, and every
     * row is then skipped for having no contact details.
     */
    it('promotes a composite column that was marked ignore', () => {
      const result = normaliseMappingPlan(
        plan({
          mappings: [map('Name & Contact', 'ignore')],
          compositeColumns: [
            {
              sourceColumn: 'Name & Contact',
              splitsInto: ['name', 'mobile_without_country_code'],
              note: 'split on the hyphen',
            },
          ],
        }),
        HEADERS,
      );

      expect(result.mappings[0]?.targetField).toBe('name');
    });

    it('promotes to the first non-ignore field in the split', () => {
      const result = normaliseMappingPlan(
        plan({
          mappings: [map('Name & Contact', 'ignore')],
          compositeColumns: [
            { sourceColumn: 'Name & Contact', splitsInto: ['ignore', 'email'], note: '' },
          ],
        }),
        HEADERS,
      );

      expect(result.mappings[0]?.targetField).toBe('email');
    });

    it('leaves an already-mapped composite column alone', () => {
      const result = normaliseMappingPlan(
        plan({
          mappings: [map('Name & Contact', 'name')],
          compositeColumns: [{ sourceColumn: 'Name & Contact', splitsInto: ['name'], note: '' }],
        }),
        HEADERS,
      );

      expect(result.mappings[0]?.targetField).toBe('name');
    });
  });

  describe('a column cannot be both mapped and unmapped', () => {
    /** Observed in production: "project interested" mapped to data_source AND listed as unmapped. */
    it('drops a mapped column from unmappedColumns', () => {
      const result = normaliseMappingPlan(
        plan({
          mappings: [map('project interested', 'data_source'), map('E-MAIL', 'email')],
          unmappedColumns: ['project interested'],
        }),
        ['project interested', 'E-MAIL'],
      );

      expect(result.unmappedColumns).not.toContain('project interested');
      expect(result.unmappedColumns).toEqual([]);
    });

    it('keeps an ignored column that the model also called worth reading', () => {
      const result = normaliseMappingPlan(
        plan({
          mappings: [map('legacy_code', 'ignore'), map('Internal ID', 'ignore')],
          unmappedColumns: ['legacy_code'],
        }),
        ['legacy_code', 'Internal ID'],
      );

      // The kinder claim wins: it stays out of the bin.
      expect(result.unmappedColumns).toEqual(['legacy_code']);
    });
  });

  describe('coverage', () => {
    it('surfaces a header the model never mentioned, rather than silently losing it', () => {
      const result = normaliseMappingPlan(plan({ mappings: [map('E-MAIL', 'email')] }), [
        'E-MAIL',
        'forgotten column',
      ]);

      expect(result.unmappedColumns).toContain('forgotten column');
    });

    it('drops a column the model invented', () => {
      const result = normaliseMappingPlan(
        plan({
          mappings: [map('E-MAIL', 'email'), map('does not exist', 'city')],
          compositeColumns: [{ sourceColumn: 'also fake', splitsInto: ['name'], note: '' }],
          unmappedColumns: ['imaginary'],
        }),
        ['E-MAIL'],
      );

      expect(result.mappings.map((m) => m.sourceColumn)).toEqual(['E-MAIL']);
      expect(result.compositeColumns).toEqual([]);
      expect(result.unmappedColumns).toEqual([]);
    });

    it('de-duplicates repeated entries', () => {
      const result = normaliseMappingPlan(
        plan({
          mappings: [map('E-MAIL', 'email'), map('E-MAIL', 'lead_owner')],
          compositeColumns: [
            { sourceColumn: 'Name & Contact', splitsInto: ['name'], note: 'a' },
            { sourceColumn: 'Name & Contact', splitsInto: ['name'], note: 'b' },
          ],
        }),
        HEADERS,
      );

      expect(result.mappings.filter((m) => m.sourceColumn === 'E-MAIL')).toHaveLength(1);
      expect(result.compositeColumns).toHaveLength(1);
      // First entry wins.
      expect(result.mappings.find((m) => m.sourceColumn === 'E-MAIL')?.targetField).toBe('email');
    });
  });

  it('leaves the whole-file hints untouched', () => {
    const result = normaliseMappingPlan(plan({ notes: 'phones carry a p: prefix' }), HEADERS);

    expect(result.detectedDateFormat).toBe('DD/MM/YYYY');
    expect(result.detectedDefaultCountryCode).toBe('+91');
    expect(result.notes).toBe('phones carry a p: prefix');
  });

  /** The property that matters: after normalising, the groups partition the headers. */
  it('produces disjoint groups covering every header', () => {
    const result = normaliseMappingPlan(
      plan({
        mappings: [
          map('Name & Contact', 'ignore'),
          map('E-MAIL', 'email'),
          map('project interested', 'data_source'),
          map('legacy_code', 'ignore'),
        ],
        compositeColumns: [{ sourceColumn: 'Name & Contact', splitsInto: ['name'], note: '' }],
        unmappedColumns: ['project interested', 'legacy_code'],
      }),
      HEADERS,
    );

    const mapped = result.mappings
      .filter((m) => m.targetField !== 'ignore')
      .map((m) => m.sourceColumn);
    const ignored = result.mappings
      .filter((m) => m.targetField === 'ignore' && !result.unmappedColumns.includes(m.sourceColumn))
      .map((m) => m.sourceColumn);

    // No overlap.
    for (const column of mapped) expect(result.unmappedColumns).not.toContain(column);
    for (const column of ignored) expect(mapped).not.toContain(column);

    // Full coverage.
    const seen = new Set([...mapped, ...ignored, ...result.unmappedColumns]);
    expect([...seen].sort()).toEqual([...HEADERS].sort());
  });
});
