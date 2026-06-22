import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useWorkouts } from '../../hooks/useWorkouts';
import { Modal, Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import type { WorkoutEntry } from '../../lib/types';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';

/**
 * Build an active workout: pick exercises, log sets (reps + weight),
 * then save the session locally.
 */
export function Workout() {
  const { exercises, loading } = useExercises();
  const { addSession } = useWorkouts();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [picking, setPicking] = useState(false);

  if (loading) return <Spinner label={t('common.loading')} />;

  function addExercise(exerciseId: string, exerciseName: string) {
    setEntries((prev) => [
      ...prev,
      { exerciseId, exerciseName, sets: [{ reps: 10, weight: undefined }] },
    ]);
    setPicking(false);
  }

  function updateSet(ei: number, si: number, field: 'reps' | 'weight', value: string) {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i !== ei
          ? entry
          : {
              ...entry,
              sets: entry.sets.map((set, j) =>
                j !== si ? set : { ...set, [field]: value === '' ? undefined : Number(value) }
              ),
            }
      )
    );
  }

  function addSet(ei: number) {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== ei) return entry;
        const last = entry.sets[entry.sets.length - 1];
        return { ...entry, sets: [...entry.sets, { ...last }] };
      })
    );
  }

  function removeEntry(ei: number) {
    setEntries((prev) => prev.filter((_, i) => i !== ei));
  }

  async function save() {
    if (entries.length === 0) return;
    await addSession({
      id: crypto.randomUUID(),
      date: Date.now(),
      entries: entries.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ reps: s.reps || 0, weight: s.weight })),
      })),
    });
    navigate('/history');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('workout.title')}</h1>
        {entries.length > 0 && (
          <button onClick={save} className="btn-primary px-4 py-2 text-sm">
            {t('common.save')}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState title={t('workout.emptyTitle')} hint={t('workout.emptyHint')} />
      ) : (
        <div className="space-y-4">
          {entries.map((entry, ei) => (
            <div key={ei} className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-fg">{entry.exerciseName}</p>
                <button
                  onClick={() => removeEntry(ei)}
                  className="text-xs text-fg-subtle hover:text-danger"
                >
                  {t('workout.remove')}
                </button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[2rem,1fr,1fr] gap-2 text-xs font-semibold uppercase text-fg-subtle">
                  <span>{t('workout.set')}</span>
                  <span>{t('workout.reps')}</span>
                  <span>{t('workout.weight')}</span>
                </div>
                {entry.sets.map((set, si) => (
                  <div key={si} className="grid grid-cols-[2rem,1fr,1fr] items-center gap-2">
                    <span className="text-sm text-fg-muted">{si + 1}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input py-1.5"
                      value={set.reps ?? ''}
                      onChange={(e) => updateSet(ei, si, 'reps', e.target.value)}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input py-1.5"
                      placeholder="–"
                      value={set.weight ?? ''}
                      onChange={(e) => updateSet(ei, si, 'weight', e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <button onClick={() => addSet(ei)} className="btn-ghost mt-3 w-full py-1.5 text-xs">
                {t('workout.addSet')}
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setPicking(true)} className="btn-ghost w-full">
        {t('workout.addExercise')}
      </button>

      {picking && (
        <Modal title={t('workout.pickTitle')} onClose={() => setPicking(false)}>
          <ul className="space-y-2">
            {exercises.map((ex) => {
              const name = localizedExercise(ex, lang).name;
              return (
                <li key={ex.id}>
                  <button
                    onClick={() => addExercise(ex.id, name)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-left text-fg hover:bg-border"
                  >
                    <span>{name}</span>
                    <CategoryBadge category={ex.category} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </div>
  );
}
