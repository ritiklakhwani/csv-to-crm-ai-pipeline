import type { ColumnMapping, MappingPlan, MappingTarget } from '@groweasy/shared';

/**
 * Phase 1's output, sanitised.
 *
 * The plan holds three overlapping lists — `mappings`, `compositeColumns` and `unmappedColumns` —
 * and nothing in the schema forces them to be disjoint. Strict Structured Outputs cannot express
 * that constraint, so the model happily returns plans that contradict themselves: a column marked
 * `ignore` while also described as composite, or mapped to a CRM field while also listed as
 * unmapped. Forwarding either contradiction into the Phase 2 prompt is how you end up telling the
 * extractor to discard the column that holds every name and phone number.
 *
 * So the same rule that governs Phase 2 governs Phase 1: never trust the model. The invariants are
 * enforced here, in code, once — which also means the plan shown in the UI is coherent.
 *
 * Precedence, highest first:
 *   1. composite  — a column that packs several fields can never be junk
 *   2. mapped     — an explicit CRM field wins over any other claim
 *   3. unmapped   — no field, but a human would still want to read the values
 *   4. ignore     — genuine junk: internal ids, ad ids, row numbers
 */
export function normaliseMappingPlan(plan: MappingPlan, headers: readonly string[]): MappingPlan {
  const known = new Set(headers);

  // The model can name a column that does not exist. Drop it rather than confuse Phase 2.
  const compositeColumns = dedupeBy(
    plan.compositeColumns.filter((column) => known.has(column.sourceColumn)),
    (column) => column.sourceColumn,
  );
  const composite = new Set(compositeColumns.map((column) => column.sourceColumn));

  const mappings = dedupeBy(
    plan.mappings.filter((mapping) => known.has(mapping.sourceColumn)),
    (mapping) => mapping.sourceColumn,
  ).map((mapping) => promoteComposite(mapping, compositeColumns, composite));

  const described = new Set(mappings.map((mapping) => mapping.sourceColumn));
  const mapped = new Set(
    mappings.filter((mapping) => mapping.targetField !== 'ignore').map((m) => m.sourceColumn),
  );
  const modelUnmapped = new Set(plan.unmappedColumns.filter((column) => known.has(column)));

  const unmappedColumns = [
    // A header the model never mentioned is not junk — surface it so its value can reach crm_note.
    ...headers.filter((header) => !described.has(header)),
    // The model called it junk, but also said it is worth reading. Believe the kinder claim.
    ...mappings
      .filter((m) => m.targetField === 'ignore' && modelUnmapped.has(m.sourceColumn))
      .map((m) => m.sourceColumn),
  ].filter((column) => !mapped.has(column));

  return {
    ...plan,
    mappings,
    compositeColumns,
    unmappedColumns: [...new Set(unmappedColumns)],
  };
}

/** A composite column holds real data, so it can never be `ignore`. */
function promoteComposite(
  mapping: ColumnMapping,
  compositeColumns: readonly MappingPlan['compositeColumns'][number][],
  composite: ReadonlySet<string>,
): ColumnMapping {
  if (!composite.has(mapping.sourceColumn) || mapping.targetField !== 'ignore') return mapping;

  const split = compositeColumns.find((column) => column.sourceColumn === mapping.sourceColumn);
  const primary: MappingTarget = split?.splitsInto.find((field) => field !== 'ignore') ?? 'name';

  return { ...mapping, targetField: primary };
}

function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }

  return result;
}
