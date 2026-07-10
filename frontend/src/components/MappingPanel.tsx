import type { MappingPlan } from '@groweasy/shared';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';

/**
 * Shows what Phase 1 inferred about the file. This is the "huge UX win" the build spec calls out:
 * the same mapping plan that gives every extraction batch its whole-file context is surfaced to the
 * user, so the AI's field mapping is visible rather than a black box.
 */
export function MappingPanel({ plan }: { plan: MappingPlan }) {
  const mapped = plan.mappings.filter((mapping) => mapping.targetField !== 'ignore');

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
        Detected mappings
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {mapped.map((mapping) => (
          <span
            key={mapping.sourceColumn}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
          >
            <span className="font-medium">{mapping.sourceColumn}</span>
            <ArrowRight className="h-3 w-3 opacity-60" />
            <span className="font-mono">{mapping.targetField}</span>
          </span>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Detail label="Date format" value={plan.detectedDateFormat || '—'} />
        <Detail label="Country code" value={plan.detectedDefaultCountryCode || '—'} />
        <Detail label="Composite cols" value={plan.compositeColumns.length} />
        <Detail label="Ignored cols" value={plan.mappings.length - mapped.length} />
      </dl>

      {plan.notes && (
        <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          {plan.notes}
        </p>
      )}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-neutral-400 dark:text-neutral-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-neutral-700 dark:text-neutral-200">{value}</dd>
    </div>
  );
}
