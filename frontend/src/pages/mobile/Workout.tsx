import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useAuth } from '../../hooks/useAuth';
import { useRestTimer } from '../../hooks/useRestTimer';
import { Modal, Spinner, EmptyState, CategoryBadge } from '../../components/ui';
import { PlateCalculator } from '../../components/PlateCalculator';
import { NumberField } from '../../components/NumberField';
import { SetTypeToggle } from '../../components/SetTypeToggle';
import { RpePicker } from '../../components/RpePicker';
import { PlatesIcon, CheckIcon } from '../../components/icons';
import { setType, type WorkoutEntry, type WorkoutSession, type WorkoutSet, type SetType } from '../../lib/types';
import {
  convertWeightInput,
  formatWeightInput,
  parseRepsInput,
  weightInputToKg,
  weightStep,
  type Unit,
} from '../../lib/units';
import {
  groupLetters,
  isLastGroupMember,
  buildRenderBlocks,
  groupEntries,
  ungroupEntries,
  nextOpenInOrder,
} from '../../lib/supersets';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';
import { useRpeVisibility } from '../../hooks/useRpeVisibility';

/**
 * Sets under edit hold the raw text of each field rather than a number.
 *
 * Three problems collapse into one solution that way: a half-typed "62." stops
 * being reparsed into "62" on every keystroke, a German "62,5" survives, and
 * the pound/kilogram conversion happens once at the boundary instead of on
 * every render. Parsing to canonical kilograms happens on save.
 */
interface DraftSet {
  reps: string;
  weight: string;
  type: SetType;
  done: boolean;
  completedAt?: number;
  /** No UI yet (that comes with the RPE work); carried so editing never drops it. */
  rpe?: number;
}

interface DraftEntry {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
  sets: DraftSet[];
  /** Superset membership; entries sharing this render as one card. */
  groupId?: string;
  /** No UI yet (that comes with routines); carried so editing never drops it. */
  plannedExerciseId?: string;
}

const blankSet = (): DraftSet => ({ reps: '', weight: '', type: 'working', done: false });

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

function toDraftEntries(entries: WorkoutEntry[], unit: Unit): DraftEntry[] {
  return entries.map((entry) => ({
    exerciseId: entry.exerciseId,
    exerciseRef: entry.exerciseRef,
    exerciseName: entry.exerciseName,
    groupId: entry.groupId,
    plannedExerciseId: entry.plannedExerciseId,
    sets: entry.sets.map((s) => ({
      reps: String(s.reps),
      weight: formatWeightInput(s.weight, unit),
      type: setType(s),
      // Sets that predate check-off were logged after the fact; treating them
      // as unfinished would reopen every workout in the history.
      done: s.done ?? true,
      completedAt: s.completedAt,
      rpe: s.rpe,
    })),
  }));
}

const isBlank = (s: DraftSet) => s.reps.trim() === '' && s.weight.trim() === '';

/**
 * Rows the user never filled in are sets they never did — dropping them keeps
 * "0 ×" phantoms out of the history, and entries left with nothing at all go
 * with them.
 */
function toSavedEntries(entries: DraftEntry[], unit: Unit): WorkoutEntry[] {
  return entries
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      ...(entry.exerciseRef !== undefined ? { exerciseRef: entry.exerciseRef } : {}),
      exerciseName: entry.exerciseName,
      ...(entry.groupId !== undefined ? { groupId: entry.groupId } : {}),
      ...(entry.plannedExerciseId !== undefined
        ? { plannedExerciseId: entry.plannedExerciseId }
        : {}),
      sets: entry.sets.filter((s) => !isBlank(s)).map((s): WorkoutSet => {
        const weight = weightInputToKg(s.weight, unit);
        return {
          reps: parseRepsInput(s.reps) ?? 0,
          ...(weight !== undefined ? { weight } : {}),
          type: s.type,
          done: s.done,
          ...(s.completedAt !== undefined ? { completedAt: s.completedAt } : {}),
          ...(s.rpe !== undefined ? { rpe: s.rpe } : {}),
        };
      }),
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
 * sets, check them off as they are done.
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
  const { unit } = useAuth();
  const rest = useRestTimer();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [rpeVisible] = useRpeVisibility();

  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    toDraftEntries(initial?.entries ?? [], unit)
  );
  /** Entries checked for the next "group as superset" action. */
  const [selectedForGroup, setSelectedForGroup] = useState<Set<number>>(new Set());
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

  /** Reps inputs by `entryIndex:setIndex`, so check-off can jump to the next one. */
  const repsInputs = useRef(new Map<string, HTMLInputElement>());
  const registerReps = (key: string) => (el: HTMLInputElement | null) => {
    if (el) repsInputs.current.set(key, el);
    else repsInputs.current.delete(key);
  };

  /**
   * Set by check-off, consumed on the next commit.
   *
   * An effect rather than requestAnimationFrame: rAF is suspended while the
   * document is hidden, so the jump would silently never happen there. What is
   * actually needed is "once React has rendered the row", which is exactly
   * when an effect runs.
   */
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    const input = repsInputs.current.get(key);
    if (!input) return;
    // Focus first without scrolling, then centre it deliberately — letting the
    // browser scroll on focus lands the row wherever it likes, usually just
    // under the sticky header.
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  /**
   * Re-express every weight already typed when the display unit changes, so a
   * switch mid-workout does not silently reinterpret 60 kg as 60 lb.
   */
  const previousUnit = useRef(unit);
  useEffect(() => {
    const from = previousUnit.current;
    if (from === unit) return;
    previousUnit.current = unit;
    setEntries((prev) =>
      prev.map((entry) => ({
        ...entry,
        sets: entry.sets.map((s) => ({ ...s, weight: convertWeightInput(s.weight, from, unit) })),
      }))
    );
  }, [unit]);

  /**
   * What was lifted last time, per exercise — shown as the placeholder in each
   * empty field so the number to beat is where the eyes already are, without
   * pre-filling anything that could be saved unread.
   */
  const previousSets = useMemo(() => {
    const byExercise = new Map<string, WorkoutSet[]>();
    const newestFirst = [...sessions]
      .filter((s) => s.id !== initial?.id)
      .sort((a, b) => (b.startedAt ?? b.date) - (a.startedAt ?? a.date));
    for (const session of newestFirst) {
      for (const entry of session.entries) {
        if (!byExercise.has(entry.exerciseId)) byExercise.set(entry.exerciseId, entry.sets);
      }
    }
    return byExercise;
  }, [sessions, initial?.id]);

  const savedEntries = useMemo(() => toSavedEntries(entries, unit), [entries, unit]);

  /** A/B/C per entry within its superset; `undefined` for ungrouped entries. */
  const letters = useMemo(() => groupLetters(entries), [entries]);
  /** Render units: `[i]` for a standalone entry, every member's index for a group. */
  const blocks = useMemo(() => buildRenderBlocks(entries), [entries]);

  if (loading) return <Spinner label={t('common.loading')} />;

  /**
   * The set at the same position last time; if that session was shorter, its
   * final set — a fourth set has more to learn from the third than from nothing.
   */
  function previousSet(exerciseId: string, index: number): WorkoutSet | undefined {
    const sets = previousSets.get(exerciseId);
    if (!sets || sets.length === 0) return undefined;
    return sets[Math.min(index, sets.length - 1)];
  }

  // exerciseRef is recorded alongside the id: if the id link is ever lost, the
  // reference number is what lets the entry be reattached to its exercise.
  function addExercise(exerciseId: string, exerciseName: string, exerciseRef: number) {
    setEntries((prev) => [...prev, { exerciseId, exerciseRef, exerciseName, sets: [blankSet()] }]);
    setPicking(false);
  }

  function updateSet(ei: number, si: number, patch: Partial<DraftSet>) {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i !== ei
          ? entry
          : { ...entry, sets: entry.sets.map((s, j) => (j !== si ? s : { ...s, ...patch })) }
      )
    );
  }

  function addSet(ei: number) {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== ei) return entry;
        const last = entry.sets[entry.sets.length - 1];
        // Carries the numbers forward but never the completion: a new set is by
        // definition one that has not been done yet.
        return {
          ...entry,
          sets: [...entry.sets, { ...(last ?? blankSet()), done: false, completedAt: undefined }],
        };
      })
    );
  }

  function removeEntry(ei: number) {
    setEntries((prev) => {
      const groupId = prev[ei].groupId;
      const next = prev.filter((_, i) => i !== ei);
      if (!groupId) return next;
      // A "group" of one left behind by the removal is not a superset anymore.
      const remaining = next.filter((e) => e.groupId === groupId).length;
      return remaining >= 2 ? next : ungroupEntries(next, groupId);
    });
    setSelectedForGroup((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i === ei) return;
        next.add(i > ei ? i - 1 : i);
      });
      return next;
    });
  }

  function toggleSelectedForGroup(ei: number) {
    setSelectedForGroup((prev) => {
      const next = new Set(prev);
      if (next.has(ei)) next.delete(ei);
      else next.add(ei);
      return next;
    });
  }

  function groupSelected() {
    if (selectedForGroup.size < 2) return;
    const groupId = crypto.randomUUID();
    setEntries((prev) => groupEntries(prev, [...selectedForGroup], groupId));
    setSelectedForGroup(new Set());
  }

  function ungroup(groupId: string) {
    setEntries((prev) => ungroupEntries(prev, groupId));
  }

  function toggleDone(ei: number, si: number) {
    const set = entries[ei].sets[si];
    if (set.done) {
      updateSet(ei, si, { done: false, completedAt: undefined });
      return;
    }

    updateSet(ei, si, { done: true, completedAt: Date.now() });

    // A drop set is by definition taken without a pause, so it starts none.
    // Inside a superset, only the group's last exercise starts a rest — the
    // point of pairing them is no rest in between, only after the round.
    // `start` must run inside this tap: arming the audio alarm needs a gesture.
    if (set.type !== 'drop' && isLastGroupMember(entries, ei)) rest.start();

    const next = nextOpenInOrder(entries, ei, si);
    pendingFocus.current = next ? `${next[0]}:${next[1]}` : null;
  }

  /** Weight to open the plate calculator with: what is loaded now, else last time's. */
  function seedWeight(ei: number): number | undefined {
    const entry = entries[ei];
    if (!entry) return undefined;
    for (let i = entry.sets.length - 1; i >= 0; i -= 1) {
      const kg = weightInputToKg(entry.sets[i].weight, unit);
      if (kg !== undefined) return kg;
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

  /** Plate calculator / remove — shared between a standalone card and a group member's row. */
  function renderEntryActions(ei: number) {
    return (
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
    );
  }

  /** Set rows for one entry — shared between a standalone card and a group member. */
  function renderSetRows(ei: number, entry: DraftEntry) {
    return (
      <>
        <div className="grid grid-cols-[2.75rem,1fr,1fr,3.25rem] gap-x-2 text-xs font-semibold uppercase text-fg-subtle">
          <span>{t('workout.set')}</span>
          <span>{t('workout.reps')}</span>
          <span>{`${t('workout.weight')} (${unit})`}</span>
          <span className="sr-only">{t('workout.doneColumn')}</span>
        </div>

        <div className="mt-2 space-y-2">
          {entry.sets.map((set, si) => {
            const last = previousSet(entry.exerciseId, si);
            const repsLabel = t('workout.reps');
            const weightLabel = t('workout.weight');
            const dampened = set.done || set.type === 'warmup';
            return (
              <div key={si} className="space-y-1.5">
                <div
                  className={`grid grid-cols-[2.75rem,1fr,1fr,3.25rem] items-start gap-x-2 transition-opacity ${
                    dampened ? 'opacity-55' : ''
                  }`}
                >
                  <SetTypeToggle
                    value={set.type}
                    setNumber={si + 1}
                    onChange={(type) => updateSet(ei, si, { type })}
                  />

                  <NumberField
                    inputRef={registerReps(`${ei}:${si}`)}
                    value={set.reps}
                    onChange={(reps) => updateSet(ei, si, { reps })}
                    step={1}
                    min={0}
                    integer
                    label={`${t('workout.set')} ${si + 1} — ${repsLabel}`}
                    stepUpLabel={t('set.more', { label: repsLabel })}
                    stepDownLabel={t('set.less', { label: repsLabel })}
                    placeholder={last ? String(last.reps) : '–'}
                  />

                  <NumberField
                    value={set.weight}
                    onChange={(weight) => updateSet(ei, si, { weight })}
                    step={weightStep(unit)}
                    min={0}
                    label={`${t('workout.set')} ${si + 1} — ${weightLabel}`}
                    stepUpLabel={t('set.more', { label: weightLabel })}
                    stepDownLabel={t('set.less', { label: weightLabel })}
                    placeholder={
                      last?.weight != null ? formatWeightInput(last.weight, unit) : '–'
                    }
                  />

                  <button
                    type="button"
                    onClick={() => toggleDone(ei, si)}
                    aria-pressed={set.done}
                    aria-label={t(set.done ? 'set.undone' : 'set.done', { n: si + 1 })}
                    className={`flex h-14 w-full items-center justify-center rounded-xl border transition ${
                      set.done
                        ? 'border-accent bg-accent text-white'
                        : 'border-border bg-surface-2 text-fg-subtle hover:border-accent hover:text-accent'
                    }`}
                  >
                    <CheckIcon width={22} height={22} />
                  </button>
                </div>

                {rpeVisible && (
                  <RpePicker
                    value={set.rpe}
                    setNumber={si + 1}
                    onChange={(rpe) => updateSet(ei, si, { rpe })}
                  />
                )}
              </div>
            );
          })}
        </div>

        <button onClick={() => addSet(ei)} className="btn-ghost mt-3 w-full text-sm">
          {t('workout.addSet')}
        </button>
      </>
    );
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

      {selectedForGroup.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3">
          <span className="text-sm text-fg-muted">
            {t('workout.selectedCount', { count: selectedForGroup.size })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedForGroup(new Set())}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              {t('common.close')}
            </button>
            <button
              onClick={groupSelected}
              disabled={selectedForGroup.size < 2}
              className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {t('workout.groupConfirm')}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState title={t('workout.emptyTitle')} hint={t('workout.emptyHint')} />
      ) : (
        <div className="space-y-4">
          {blocks.map((memberIndices) => {
            const groupId = entries[memberIndices[0]].groupId;

            if (memberIndices.length === 1 && !groupId) {
              const ei = memberIndices[0];
              const entry = entries[ei];
              return (
                <div key={ei} className="card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <label className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedForGroup.has(ei)}
                        onChange={() => toggleSelectedForGroup(ei)}
                        aria-label={t('workout.selectForGroup', { name: entry.exerciseName })}
                        className="h-5 w-5 shrink-0 accent-accent"
                      />
                      <p className="min-w-0 truncate font-semibold text-fg">{entry.exerciseName}</p>
                    </label>
                    {renderEntryActions(ei)}
                  </div>
                  {renderSetRows(ei, entry)}
                </div>
              );
            }

            // groupId is set here: a multi-member block always shares one.
            return (
              <div key={groupId} className="card space-y-4 border-l-4 border-l-accent p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-fg-subtle">
                    {t('workout.supersetLabel')}
                  </span>
                  <button
                    onClick={() => ungroup(groupId!)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    {t('workout.ungroup')}
                  </button>
                </div>
                {memberIndices.map((ei, memberPosition) => {
                  const entry = entries[ei];
                  return (
                    <div
                      key={ei}
                      className={memberPosition > 0 ? 'border-t border-border pt-4' : ''}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-fg">
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                            {letters[ei]}
                          </span>
                          <span className="min-w-0 truncate">{entry.exerciseName}</span>
                        </p>
                        {renderEntryActions(ei)}
                      </div>
                      {renderSetRows(ei, entry)}
                    </div>
                  );
                })}
              </div>
            );
          })}
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
        <PlateCalculator
          initialKg={seedWeight(plateEntry)}
          unit={unit}
          onClose={() => setPlateEntry(null)}
        />
      )}
    </div>
  );
}
