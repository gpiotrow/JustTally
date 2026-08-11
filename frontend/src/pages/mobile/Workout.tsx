import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useWorkouts } from '../../hooks/useWorkouts';
import { Modal, Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import { PlateCalculator } from '../../components/PlateCalculator';
import { PlatesIcon } from '../../components/icons';
import type { WorkoutEntry, WorkoutSession, WorkoutSet } from '../../lib/types';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';

/**
 * A set being edited may be blank in either field — that is what makes room for
 * last session's numbers to show through as placeholders. `WorkoutEntry` keeps
 * requiring `reps`, so drafts are converted on save.
 */
interface DraftSet {
  reps?: number;
  weight?: number;
}

interface DraftEntry {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
  sets: DraftSet[];
}

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
 * Rows the user never filled in are sets they never did — dropping them keeps
 * "0 ×" phantoms out of the history, and entries left with nothing at all go
 * with them.
 */
function toSavedEntries(entries: DraftEntry[]): WorkoutEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      sets: entry.sets
        .filter((s) => s.reps !== undefined || s.weight !== undefined)
        .map((s) => ({ reps: s.reps ?? 0, weight: s.weight })),
    }))
    .filter((entry) => entry.sets.length > 0);
}

/**
 * Container: waits for stored sessions — needed for the edit target as well as
 * for last session's numbers — then mounts the editor keyed by id so the form's
 * initial state is seeded from the resolved session.
 */
export function Workout() {
  const { id } = useParams();
  const { sessions, loaded } = useWorkouts();
  const { t } = useLanguage();

  if (!loaded) return <Spinner label={t('common.loading')} />;
  const initial = id ? sessions.find((s) => s.id === id) ?? null : null;
  if (id && !initial) return <Navigate to="/history" replace />;

  return <WorkoutEditor key={id ?? 'new'} initial={initial} sessions={sessions} />;
}

/**
 * Build or edit a workout: set title/start/duration/notes, pick exercises, log
 * sets (reps + weight), then save the session locally.
 */
function WorkoutEditor({
  initial,
  sessions,
}: {
  initial: WorkoutSession | null;
  sessions: WorkoutSession[];
}) {
  const { exercises, loading } = useExercises();
  const { addSession, updateSession } = useWorkouts();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [entries, setEntries] = useState<DraftEntry[]>(initial?.entries ?? []);
  const [picking, setPicking] = useState(false);
  const [plateEntry, setPlateEntry] = useState<number | null>(null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startedAt, setStartedAt] = useState(() =>
    toLocalInputValue(initial?.startedAt ?? initial?.date ?? Date.now())
  );
  const [duration, setDuration] = useState(
    initial?.durationMin != null ? String(initial.durationMin) : ''
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

  /**
   * What was lifted last time, per exercise — shown as the placeholder in each
   * empty field so the number to beat is where the eyes already are, without
   * pre-filling anything that could be saved unread.
   */
  const previousSets = useMemo(() => {
    const byExercise = new Map<string, WorkoutSet[]>();
    const olderFirstLast = [...sessions]
      .filter((s) => s.id !== initial?.id)
      .sort((a, b) => (b.startedAt ?? b.date) - (a.startedAt ?? a.date));
    for (const session of olderFirstLast) {
      for (const entry of session.entries) {
        if (!byExercise.has(entry.exerciseId)) byExercise.set(entry.exerciseId, entry.sets);
      }
    }
    return byExercise;
  }, [sessions, initial?.id]);

  /**
   * The set at the same position last time; if that session was shorter, its
   * final set — a fourth set has more to learn from the third than from nothing.
   */
  function previousSet(exerciseId: string, index: number): WorkoutSet | undefined {
    const sets = previousSets.get(exerciseId);
    if (!sets || sets.length === 0) return undefined;
    return sets[Math.min(index, sets.length - 1)];
  }

  const savedEntries = useMemo(() => toSavedEntries(entries), [entries]);

  if (loading) return <Spinner label={t('common.loading')} />;

  // exerciseRef is recorded alongside the id: if the id link is ever lost, the
  // reference number is what lets the entry be reattached to its exercise.
  function addExercise(exerciseId: string, exerciseName: string, exerciseRef: number) {
    setEntries((prev) => [...prev, { exerciseId, exerciseRef, exerciseName, sets: [{}] }]);
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

  /** Weight to open the plate calculator with: what is loaded now, else last time's. */
  function seedWeight(ei: number): number | undefined {
    const entry = entries[ei];
    if (!entry) return undefined;
    for (let i = entry.sets.length - 1; i >= 0; i -= 1) {
      const weight = entry.sets[i].weight;
      if (weight !== undefined) return weight;
    }
    return previousSet(entry.exerciseId, entry.sets.length - 1)?.weight;
  }

  async function save() {
    if (savedEntries.length === 0) return;
    const trimmedTitle = title.trim();
    const trimmedNotes = notes.trim();
    const durationMin = duration.trim() === '' ? undefined : Number(duration);
    const session: WorkoutSession = {
      id: initial?.id ?? crypto.randomUUID(),
      date: initial?.date ?? Date.now(),
      updatedAt: Date.now(),
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      startedAt: parseLocalInputValue(startedAt),
      ...(durationMin !== undefined && !Number.isNaN(durationMin) ? { durationMin } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      entries: savedEntries,
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
        {savedEntries.length > 0 && (
          <button onClick={save} className="btn-primary px-5 text-sm">
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-semibold text-fg">{entry.exerciseName}</p>
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={() => setPlateEntry(ei)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
                    aria-label={t('plates.open')}
                    title={t('plates.open')}
                  >
                    <PlatesIcon width={20} height={20} />
                  </button>
                  <button
                    onClick={() => removeEntry(ei)}
                    className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs text-fg-subtle transition hover:bg-surface-2 hover:text-danger"
                  >
                    {t('workout.remove')}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[2rem,1fr,1fr] gap-2 text-xs font-semibold uppercase text-fg-subtle">
                  <span>{t('workout.set')}</span>
                  <span>{t('workout.reps')}</span>
                  <span>{t('workout.weight')}</span>
                </div>
                {entry.sets.map((set, si) => {
                  const last = previousSet(entry.exerciseId, si);
                  return (
                    <div key={si} className="grid grid-cols-[2rem,1fr,1fr] items-center gap-2">
                      <span className="text-sm font-semibold text-fg-muted">{si + 1}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        className="input-gym"
                        aria-label={`${t('workout.set')} ${si + 1} — ${t('workout.reps')}`}
                        placeholder={last ? String(last.reps) : '–'}
                        value={set.reps ?? ''}
                        onChange={(e) => updateSet(ei, si, 'reps', e.target.value)}
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="0"
                        className="input-gym"
                        aria-label={`${t('workout.set')} ${si + 1} — ${t('workout.weight')}`}
                        placeholder={last?.weight != null ? String(last.weight) : '–'}
                        value={set.weight ?? ''}
                        onChange={(e) => updateSet(ei, si, 'weight', e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <button onClick={() => addSet(ei)} className="btn-ghost mt-3 w-full text-sm">
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
                    onClick={() => addExercise(ex.id, name, ex.ref)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-left text-fg hover:bg-border"
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

      {plateEntry !== null && (
        <PlateCalculator initialKg={seedWeight(plateEntry)} onClose={() => setPlateEntry(null)} />
      )}
    </div>
  );
}
