import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useRoutines } from '../../hooks/useRoutines';
import { Modal, Spinner, EmptyState } from '../../components/ui';
import { ExercisePicker } from '../../components/ExercisePicker';
import { NumberField } from '../../components/NumberField';
import { instantiateRoutineDay } from '../../lib/routineInstantiate';
import {
  exerciseTracking,
  type Exercise,
  type Routine,
  type RoutineDay,
  type RoutineExercise,
} from '../../lib/types';
import { TRACKING_FIELDS } from '../../lib/tracking';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';

/**
 * A day always carries at least one blank exercise slot in edit mode isn't
 * needed — an empty day is valid, just not startable yet.
 */
function blankDay(): RoutineDay {
  return { id: crypto.randomUUID(), name: '', exercises: [] };
}

/**
 * The mobile editor deliberately covers one week only. Periodization —
 * duplicating a week with a percentage bump — is § 8's Desktop-Planer job;
 * building that machinery here for a phone screen would be building it twice.
 * `weeks[0]` is where every routine created on mobile lives.
 */
/** How long the undo toast after removing a day/exercise/alternative stays up. */
const UNDO_TOAST_MS = 6000;

function blankRoutine(): Routine {
  return {
    id: crypto.randomUUID(),
    name: '',
    weeks: [{ id: crypto.randomUUID(), days: [blankDay()] }],
    updatedAt: Date.now(),
  };
}

export function Routines() {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { exercises, loading: exercisesLoading } = useExercises();
  const { routines, loaded, saveRoutine, deleteRoutine } = useRoutines();
  const [editing, setEditing] = useState<Routine | null>(null);

  // "Als Routine" from the history hands a pre-filled draft over via router
  // state — opened once here, then cleared from history state so a reload or
  // browser back doesn't reopen the editor a second time. Same pattern
  // `Workout.tsx` uses for a routine's `instantiation` and `History.tsx` for
  // `newPRs`, just with the state cleared afterwards since this one edits.
  useEffect(() => {
    const draft = (location.state as { draftRoutine?: Routine } | null)?.draftRoutine;
    if (!draft) return;
    setEditing(draft);
    navigate(location.pathname, { replace: true, state: null });
    // Only ever meant to fire for the state this mount arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded || exercisesLoading) return <Spinner label={t('common.loading')} />;

  function startDay(routine: Routine, dayId: string) {
    const instantiation = instantiateRoutineDay(routine, 0, dayId);
    if (!instantiation) return;
    navigate('/workout', { state: { instantiation } });
  }

  async function remove(id: string) {
    if (!window.confirm(t('routines.deleteConfirm'))) return;
    await deleteRoutine(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('routines.title')}</h1>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => navigate('/plan')} className="btn-ghost px-3 text-sm">
            {t('plan.title')}
          </button>
          <button onClick={() => setEditing(blankRoutine())} className="btn-primary px-4 text-sm">
            {t('routines.new')}
          </button>
        </div>
      </div>

      {routines.length === 0 ? (
        <EmptyState title={t('routines.emptyTitle')} hint={t('routines.emptyHint')} />
      ) : (
        <ul className="space-y-3">
          {routines.map((routine) => {
            const days = routine.weeks[0]?.days ?? [];
            return (
              <li key={routine.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{routine.name}</p>
                    {routine.description && (
                      <p className="mt-0.5 truncate text-sm text-fg-subtle">
                        {routine.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button
                      onClick={() => setEditing(routine)}
                      className="text-xs text-fg-subtle hover:text-accent"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => void remove(routine.id)}
                      className="text-xs text-fg-subtle hover:text-danger"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>

                {days.length === 0 ? (
                  <p className="text-sm text-fg-subtle">{t('routines.noDays')}</p>
                ) : (
                  <ul className="space-y-2">
                    {days.map((day) => (
                      <li
                        key={day.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-fg">
                            {day.name || t('routines.untitledDay')}
                          </p>
                          <p className="text-xs text-fg-subtle">
                            {t('routines.exerciseCount', { count: day.exercises.length })}
                          </p>
                        </div>
                        <button
                          onClick={() => startDay(routine, day.id)}
                          disabled={day.exercises.length === 0}
                          className="btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-40"
                        >
                          {t('routines.start')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <RoutineEditor
          routine={editing}
          exercises={exercises}
          lang={lang}
          onClose={() => setEditing(null)}
          onSave={async (routine) => {
            await saveRoutine(routine);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RoutineEditor({
  routine: initial,
  exercises,
  lang,
  onClose,
  onSave,
}: {
  routine: Routine;
  exercises: ReturnType<typeof useExercises>['exercises'];
  lang: ReturnType<typeof useLanguage>['lang'];
  onClose: () => void;
  onSave: (routine: Routine) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [days, setDays] = useState<RoutineDay[]>(initial.weeks[0]?.days ?? [blankDay()]);
  const [saving, setSaving] = useState(false);
  /** Which day + exercise the exercise picker is currently filling: an exercise slot, or an alternative slot. */
  const [picking, setPicking] = useState<{ dayIndex: number; exerciseIndex?: number } | null>(
    null
  );
  /**
   * One snapshot covers removing a day, an exercise, or an alternative —
   * all three just restore `days` wholesale, the same way `Workout.tsx`'s
   * entry-removal undo does. Nothing here is persisted until "Save", so
   * (unlike a routine's own delete, which queues a sync tombstone and needs
   * a confirm instead) undo is the safe, low-friction fix.
   */
  const [undo, setUndo] = useState<{ days: RoutineDay[]; label: string } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), UNDO_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [undo]);

  const canSave = name.trim() !== '' && days.some((d) => d.exercises.length > 0);

  function updateDay(dayIndex: number, patch: Partial<RoutineDay>) {
    setDays((prev) => prev.map((d, i) => (i !== dayIndex ? d : { ...d, ...patch })));
  }

  function addDay() {
    setDays((prev) => [...prev, blankDay()]);
  }

  function removeDay(dayIndex: number) {
    const day = days[dayIndex];
    setUndo({
      days,
      label: t('routines.removedDay', { name: day.name || t('routines.untitledDay') }),
    });
    setDays((prev) => prev.filter((_, i) => i !== dayIndex));
  }

  /**
   * Adds every picked exercise to the day in one go — mirrors the workout
   * editor's "add" picker, which also commits a whole selection at once.
   * Builds the new list from `prev` rather than the `days` closure: looping
   * `updateDay` calls per exercise would each read the same stale
   * `days[dayIndex]` and only the last one would survive.
   */
  function addExercisesToDay(dayIndex: number, picked: Exercise[]) {
    const added: RoutineExercise[] = picked.map((ex) => ({
      exerciseId: ex.id,
      exerciseRef: ex.ref,
      exerciseName: localizedExercise(ex, lang).name,
      alternatives: [],
      targetSets: 3,
    }));
    setDays((prev) =>
      prev.map((d, i) => (i !== dayIndex ? d : { ...d, exercises: [...d.exercises, ...added] }))
    );
    setPicking(null);
  }

  function addAlternative(dayIndex: number, exerciseIndex: number, exerciseId: string, exerciseName: string, ref: number) {
    setDays((prev) =>
      prev.map((d, di) =>
        di !== dayIndex
          ? d
          : {
              ...d,
              exercises: d.exercises.map((ex, ei) =>
                ei !== exerciseIndex
                  ? ex
                  : {
                      ...ex,
                      alternatives: [
                        ...ex.alternatives,
                        { exerciseId, exerciseRef: ref, exerciseName },
                      ],
                    }
              ),
            }
      )
    );
    setPicking(null);
  }

  function removeAlternative(dayIndex: number, exerciseIndex: number, altIndex: number) {
    const alt = days[dayIndex].exercises[exerciseIndex].alternatives[altIndex];
    setUndo({ days, label: t('routines.removedAlternative', { name: alt.exerciseName }) });
    setDays((prev) =>
      prev.map((d, di) =>
        di !== dayIndex
          ? d
          : {
              ...d,
              exercises: d.exercises.map((ex, ei) =>
                ei !== exerciseIndex
                  ? ex
                  : { ...ex, alternatives: ex.alternatives.filter((_, ai) => ai !== altIndex) }
              ),
            }
      )
    );
  }

  function updateExercise(dayIndex: number, exerciseIndex: number, patch: Partial<RoutineExercise>) {
    setDays((prev) =>
      prev.map((d, di) =>
        di !== dayIndex
          ? d
          : {
              ...d,
              exercises: d.exercises.map((ex, ei) => (ei !== exerciseIndex ? ex : { ...ex, ...patch })),
            }
      )
    );
  }

  function removeExercise(dayIndex: number, exerciseIndex: number) {
    const exercise = days[dayIndex].exercises[exerciseIndex];
    setUndo({ days, label: t('routines.removedExercise', { name: exercise.exerciseName }) });
    updateDay(dayIndex, { exercises: days[dayIndex].exercises.filter((_, i) => i !== exerciseIndex) });
  }

  function undoRemoval() {
    if (!undo) return;
    setDays(undo.days);
    setUndo(null);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const routine: Routine = {
        ...initial,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        weeks: [{ id: initial.weeks[0]?.id ?? crypto.randomUUID(), days }],
        updatedAt: Date.now(),
      };
      await onSave(routine);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial.name ? t('routines.editTitle') : t('routines.newTitle')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="routine-name">
            {t('routines.name')}
          </label>
          <input
            id="routine-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('routines.namePlaceholder')}
          />
        </div>
        <div>
          <label className="label" htmlFor="routine-description">
            {t('routines.description')}
          </label>
          <textarea
            id="routine-description"
            className="input min-h-16 resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {days.map((day, dayIndex) => (
            <div key={day.id} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={day.name}
                  onChange={(e) => updateDay(dayIndex, { name: e.target.value })}
                  placeholder={t('routines.dayNamePlaceholder')}
                />
                {days.length > 1 && (
                  <button
                    onClick={() => removeDay(dayIndex)}
                    className="btn-ghost px-2 py-1.5 text-xs text-danger"
                  >
                    {t('workout.remove')}
                  </button>
                )}
              </div>

              {day.exercises.length > 0 && (
                <ul className="mb-2 space-y-2">
                  {day.exercises.map((ex, exerciseIndex) => {
                    const catalogExercise = exercises.find((e) => e.id === ex.exerciseId);
                    // Absent from the catalog (deleted, or not yet loaded)
                    // falls back to the same default `exerciseTracking` uses
                    // elsewhere.
                    const mode = catalogExercise ? exerciseTracking(catalogExercise) : 'reps_weight';
                    const fields = TRACKING_FIELDS[mode];
                    // distance_time is the only mode needing two target
                    // fields alongside sets; every other mode fits two columns.
                    const gridClass = mode === 'distance_time' ? 'grid-cols-3' : 'grid-cols-2';

                    return (
                      <li key={exerciseIndex} className="rounded-lg bg-surface-2 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-fg">
                            {ex.exerciseName}
                          </p>
                          <button
                            onClick={() => removeExercise(dayIndex, exerciseIndex)}
                            className="shrink-0 text-xs text-fg-subtle hover:text-danger"
                          >
                            {t('workout.remove')}
                          </button>
                        </div>
                        <div className={`mt-2 grid ${gridClass} gap-2`}>
                          <div>
                            <span className="mb-1 block text-xs text-fg-subtle">
                              {t('routines.targetSets')}
                            </span>
                            <NumberField
                              value={String(ex.targetSets)}
                              onChange={(v) =>
                                updateExercise(dayIndex, exerciseIndex, {
                                  targetSets: Math.max(1, Math.round(Number(v) || 1)),
                                })
                              }
                              step={1}
                              min={1}
                              integer
                              label={t('routines.targetSets')}
                              stepUpLabel={t('set.more', { label: t('routines.targetSets') })}
                              stepDownLabel={t('set.less', { label: t('routines.targetSets') })}
                            />
                          </div>

                          {fields.includes('reps') && (
                            <div>
                              <span className="mb-1 block text-xs text-fg-subtle">
                                {t('routines.targetReps')}
                              </span>
                              <input
                                className="input"
                                value={ex.targetReps ?? ''}
                                onChange={(e) =>
                                  updateExercise(dayIndex, exerciseIndex, {
                                    targetReps: e.target.value || undefined,
                                  })
                                }
                                placeholder="8-12"
                              />
                            </div>
                          )}

                          {fields.includes('distance') && (
                            <div>
                              <span className="mb-1 block text-xs text-fg-subtle">
                                {t('routines.targetDistance')}
                              </span>
                              <NumberField
                                value={ex.targetDistanceM != null ? String(ex.targetDistanceM) : ''}
                                onChange={(v) =>
                                  updateExercise(dayIndex, exerciseIndex, {
                                    targetDistanceM:
                                      v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v) || 0)),
                                  })
                                }
                                step={50}
                                min={0}
                                integer
                                label={t('routines.targetDistance')}
                                stepUpLabel={t('set.more', { label: t('routines.targetDistance') })}
                                stepDownLabel={t('set.less', { label: t('routines.targetDistance') })}
                              />
                            </div>
                          )}

                          {fields.includes('duration') && (
                            <div>
                              <span className="mb-1 block text-xs text-fg-subtle">
                                {t('routines.targetDuration')}
                              </span>
                              <NumberField
                                value={ex.targetDurationSec != null ? String(ex.targetDurationSec) : ''}
                                onChange={(v) =>
                                  updateExercise(dayIndex, exerciseIndex, {
                                    targetDurationSec:
                                      v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v) || 0)),
                                  })
                                }
                                step={5}
                                min={0}
                                integer
                                label={t('routines.targetDuration')}
                                stepUpLabel={t('set.more', { label: t('routines.targetDuration') })}
                                stepDownLabel={t('set.less', { label: t('routines.targetDuration') })}
                              />
                            </div>
                          )}
                        </div>

                        <div className="mt-2">
                          <span className="mb-1 block text-xs text-fg-subtle">
                            {t('routines.alternatives')}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {ex.alternatives.map((alt, altIndex) => (
                              <span
                                key={altIndex}
                                className="chip flex items-center gap-1 bg-surface text-fg-muted"
                              >
                                {alt.exerciseName}
                                <button
                                  onClick={() => removeAlternative(dayIndex, exerciseIndex, altIndex)}
                                  aria-label={t('routines.removeAlternative', {
                                    name: alt.exerciseName,
                                  })}
                                  className="text-fg-subtle hover:text-danger"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                            <button
                              onClick={() => setPicking({ dayIndex, exerciseIndex })}
                              className="chip bg-surface text-accent hover:bg-surface-2"
                            >
                              {t('routines.addAlternative')}
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <button
                onClick={() => setPicking({ dayIndex })}
                className="btn-ghost w-full text-sm"
              >
                {t('workout.addExercise')}
              </button>
            </div>
          ))}
        </div>

        {undo && (
          <div
            role="status"
            className="card flex items-center justify-between gap-3 border-accent/40 bg-accent/5 p-3"
          >
            <p className="truncate text-sm text-fg">{undo.label}</p>
            <button onClick={undoRemoval} className="btn-ghost shrink-0 px-3 py-1.5 text-sm">
              {t('routines.undoSwap')}
            </button>
          </div>
        )}

        <button onClick={addDay} className="btn-ghost w-full text-sm">
          {t('routines.addDay')}
        </button>

        <button
          onClick={() => void save()}
          disabled={!canSave || saving}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? t('form.saving') : t('common.save')}
        </button>
      </div>

      {picking && (
        <ExercisePicker
          exercises={exercises}
          // Filling a day's exercise list collects a whole selection, just
          // like the workout editor's "add" picker — an alternative fills
          // exactly one slot and commits on the first tap, like "replace".
          mode={picking.exerciseIndex === undefined ? 'add' : 'single'}
          onSelect={(picked) => {
            if (picking.exerciseIndex === undefined) {
              addExercisesToDay(picking.dayIndex, picked);
            } else {
              const ex = picked[0];
              const localized = localizedExercise(ex, lang).name;
              addAlternative(picking.dayIndex, picking.exerciseIndex, ex.id, localized, ex.ref);
            }
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Modal>
  );
}
