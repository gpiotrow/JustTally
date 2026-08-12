import type { RoutineExercise } from '../../lib/types';
import { useAuth } from '../../hooks/useAuth';
import { formatWeightInput, weightInputToKg } from '../../lib/units';
import { useT } from '../../i18n';

/**
 * Right column: every target a routine exercise carries. Only shown once a
 * slot in the week grid is selected — there is nothing to edit otherwise.
 */
export function PlanDetailPanel({
  exercise,
  onChange,
  onRemoveAlternative,
}: {
  exercise: RoutineExercise | null;
  onChange: (patch: Partial<RoutineExercise>) => void;
  onRemoveAlternative: (index: number) => void;
}) {
  const t = useT();
  const { unit } = useAuth();

  if (!exercise) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-fg-subtle">
        {t('plan.selectExercise')}
      </div>
    );
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto border-l border-border p-4">
      <h2 className="truncate text-lg font-bold text-fg">{exercise.exerciseName}</h2>

      <div>
        <label className="label" htmlFor="detail-sets">
          {t('routines.targetSets')}
        </label>
        <input
          id="detail-sets"
          type="number"
          min={1}
          className="input"
          value={exercise.targetSets}
          onChange={(e) => onChange({ targetSets: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
        />
      </div>

      <div>
        <label className="label" htmlFor="detail-reps">
          {t('routines.targetReps')}
        </label>
        <input
          id="detail-reps"
          className="input"
          value={exercise.targetReps ?? ''}
          onChange={(e) => onChange({ targetReps: e.target.value || undefined })}
          placeholder="8-12"
        />
      </div>

      <div>
        <label className="label" htmlFor="detail-weight">
          {`${t('workout.weight')} (${unit})`}
        </label>
        <input
          id="detail-weight"
          type="number"
          step="0.5"
          min={0}
          className="input"
          value={exercise.targetWeight != null ? formatWeightInput(exercise.targetWeight, unit) : ''}
          onChange={(e) =>
            onChange({ targetWeight: weightInputToKg(e.target.value, unit) })
          }
        />
      </div>

      <div>
        <label className="label" htmlFor="detail-rpe">
          {t('settings.rpe')}
        </label>
        <input
          id="detail-rpe"
          type="number"
          step="0.5"
          min={5}
          max={10}
          className="input"
          value={exercise.targetRpe ?? ''}
          onChange={(e) => onChange({ targetRpe: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </div>

      <div>
        <label className="label" htmlFor="detail-rest">
          {`${t('rest.default')} (${t('rest.seconds')})`}
        </label>
        <input
          id="detail-rest"
          type="number"
          step="15"
          min={0}
          className="input"
          value={exercise.restSeconds ?? ''}
          onChange={(e) => onChange({ restSeconds: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </div>

      <div>
        <span className="label">{t('routines.alternatives')}</span>
        {exercise.alternatives.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t('plan.noAlternatives')}</p>
        ) : (
          <ul className="space-y-1.5">
            {exercise.alternatives.map((alt, i) => (
              <li
                key={alt.exerciseId}
                className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm"
              >
                <span className="min-w-0 truncate text-fg">{alt.exerciseName}</span>
                <button
                  onClick={() => onRemoveAlternative(i)}
                  aria-label={t('routines.removeAlternative', { name: alt.exerciseName })}
                  className="shrink-0 text-fg-subtle hover:text-danger"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-fg-subtle">{t('plan.dragAlternativeHint')}</p>
      </div>
    </div>
  );
}
