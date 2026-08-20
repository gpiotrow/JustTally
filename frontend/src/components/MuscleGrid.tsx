import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/muscles';

/**
 * All sixteen muscle groups, including the ones nothing is recorded for — an
 * empty group later says something true about the catalog, and hiding it
 * would just move the confusion one step further away.
 *
 * Two columns at 320 px rather than four: four would clear the 44 px target
 * but leave about 64 px of width for labels like "Seitliche Bauchmuskeln".
 *
 * Shared between `ExercisePicker` (the modal) and `PlanCatalog` (the desktop
 * planner's drag-source column) — both stand this in for the exercise list
 * until a muscle is chosen, so it exists once rather than twice.
 */
export function MuscleGrid({
  onPick,
  label,
}: {
  onPick: (muscle: MuscleGroup) => void;
  label: (muscle: MuscleGroup) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {MUSCLE_GROUPS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onPick(m)}
          className="min-h-14 rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold text-fg transition hover:bg-border"
        >
          {label(m)}
        </button>
      ))}
    </div>
  );
}
