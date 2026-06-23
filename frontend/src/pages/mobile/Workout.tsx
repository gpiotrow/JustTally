import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useWorkouts } from '../../hooks/useWorkouts';
import { Modal, Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import type { WorkoutEntry, WorkoutSession } from '../../lib/types';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';

/** Convert an epoch ms timestamp to a local `datetime-local` input value (no seconds). */
function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a `datetime-local` input value back to epoch ms; falls back to now if invalid. */
function parseLocalInputValue(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * Container: in edit mode (`/workout/:id`) it waits for stored sessions to load,
 * resolves the session, then mounts the editor keyed by id so the form's initial
 * state is seeded from the resolved session.
 */
export function Workout() {
  const { id } = useParams();
  const { sessions, loaded } = useWorkouts();
  const { t } = useLanguage();

  if (id && !loaded) return <Spinner label={t('common.loading')} />;
  const initial = id ? sessions.find((s) => s.id === id) ?? null : null;
  if (id && !initial) return <Navigate to="/history" replace />;

  return <WorkoutEditor key={id ?? 'new'} initial={initial} />;
}

/**
 * Build or edit a workout: set title/start/duration/notes, pick exercises, log
 * sets (reps + weight), then save the session locally.
 */
function WorkoutEditor({ initial }: { initial: WorkoutSession | null }) {
  const { exercises, loading } = useExercises();
  const { addSession, updateSession } = useWorkouts();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [entries, setEntries] = useState<WorkoutEntry[]>(initial?.entries ?? []);
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startedAt, setStartedAt] = useState(() =>
    toLocalInputValue(initial?.startedAt ?? initial?.date ?? Date.now())
  );
  const [duration, setDuration] = useState(
    initial?.durationMin != null ? String(initial.durationMin) : ''
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

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
    const trimmedTitle = title.trim();
    const trimmedNotes = notes.trim();
    const durationMin = duration.trim() === '' ? undefined : Number(duration);
    const session: WorkoutSession = {
      id: initial?.id ?? crypto.randomUUID(),
      date: initial?.date ?? Date.now(),
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      startedAt: parseLocalInputValue(startedAt),
      ...(durationMin !== undefined && !Number.isNaN(durationMin) ? { durationMin } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      entries: entries.map((e) => ({
        ...e,
        sets: e.sets.map((s) => ({ reps: s.reps || 0, weight: s.weight })),
      })),
    };
    if (initial) await updateSession(session);
    else await addSession(session);
    navigate('/history');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {initial ? t('workout.editTitle') : t('workout.title')}
        </h1>
        {entries.length > 0 && (
          <button onClick={save} className="btn-primary px-4 py-2 text-sm">
            {t('common.save')}
          </button>
        )}
      </div>

      <div className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="wo-title">{t('workout.titleLabel')}</label>
          <input
            id="wo-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('workout.titlePlaceholder')}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="wo-start">{t('workout.startedAt')}</label>
            <input
              id="wo-start"
              type="datetime-local"
              className="input"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="wo-duration">{t('workout.duration')}</label>
            <input
              id="wo-duration"
              type="number"
              inputMode="numeric"
              min="0"
              className="input"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="–"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="wo-notes">{t('workout.notes')}</label>
          <textarea
            id="wo-notes"
            className="input min-h-20 resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('workout.notesPlaceholder')}
          />
        </div>
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
