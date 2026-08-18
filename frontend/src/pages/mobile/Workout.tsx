import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useAuth } from '../../hooks/useAuth';
import { useRestTimer } from '../../hooks/useRestTimer';
import { Modal, Spinner, EmptyState, ErrorBanner, PendingSyncChip } from '../../components/ui';
import { ExercisePicker } from '../../components/ExercisePicker';
import { PlateCalculator } from '../../components/PlateCalculator';
import { NumberField } from '../../components/NumberField';
import { DurationField } from '../../components/DurationField';
import { SetTypeToggle } from '../../components/SetTypeToggle';
import { RpePicker } from '../../components/RpePicker';
import { PlatesIcon, CheckIcon } from '../../components/icons';
import {
  setType,
  entryTracking,
  type WorkoutEntry,
  type WorkoutSession,
  type WorkoutSet,
  type SetType,
  type RoutineAlternative,
  type Exercise,
} from '../../lib/types';
import { TRACKING_FIELDS, type TrackingField, type TrackingMode } from '../../lib/tracking';
import {
  convertWeightInput,
  formatWeightInput,
  formatWeightWithUnit,
  formatDistanceWithUnit,
  formatDurationInput,
  formatDistanceInput,
  parseRepsInput,
  parseDurationInput,
  parseDistanceInput,
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
import { shouldSwipe } from '../../lib/swipeGesture';
import { exerciseRecency } from '../../lib/exerciseRecency';
import { formatDuration } from '../../lib/restTimer';
import { findNewRecords, newRecordKinds, RECORD_KINDS_BY_TRACKING, type NewPR } from '../../lib/analytics/records';
import { lastSettingsFor } from '../../lib/analytics/lastSettings';
import type { RoutineInstantiation } from '../../lib/routineInstantiate';
import { useLanguage, type TKey } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';
import { useRpeVisibility } from '../../hooks/useRpeVisibility';
import {
  clearWorkoutDraft,
  loadWorkoutDraft,
  saveWorkoutDraft,
  type WorkoutDraftEntry,
} from '../../lib/workoutDraft';

/** Shown once, the first time any exercise is ever swapped on this device. */
const SWAP_HINT_SEEN_KEY = 'jt_swap_hint_seen';
/** How long the undo toast after a swap stays up before it stops being an option. */
const UNDO_TOAST_MS = 6000;
/** Debounce for the local draft snapshot — frequent enough that a kill mid-set loses at most a keystroke, rare enough not to hammer IndexedDB on every character. */
const DRAFT_SAVE_DEBOUNCE_MS = 800;
/** Seconds per stepper tap on a duration field — fine enough for a hold, coarse enough not to take forever to reach a minute. */
const DURATION_STEP_SEC = 5;
/** Meters per stepper tap on a distance field. */
const DISTANCE_STEP_M = 50;

/**
 * Grid columns for one set row: the type toggle, one column per tracking
 * field, and the done button. Both literal class strings must appear
 * verbatim in this file for Tailwind's static scan to pick them up — this
 * function only chooses between them, never composes one at runtime.
 */
function setRowGridClass(fieldCount: number): string {
  return fieldCount === 1
    ? 'grid-cols-[2.75rem,1fr,3.25rem]'
    : 'grid-cols-[2.75rem,1fr,1fr,3.25rem]';
}

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
  /** Plain seconds as typed; see `DurationField`. Only meaningful for time-tracked modes. */
  duration: string;
  /** Meters as typed. Only meaningful for the distance_time mode. */
  distance: string;
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
  /** Which routine exercise this entry started from — set once, at instantiation, never by editing. */
  plannedExerciseId?: string;
  /**
   * The tracking mode frozen on this entry, if it was loaded from an
   * existing saved session. Absent for an entry added fresh this session —
   * its effective mode (`effectiveTracking` below) is resolved live from the
   * current catalog until save freezes it onto `WorkoutEntry.tracking`.
   * Cleared on a swap to a different exercise, so a stale frozen mode from
   * before the swap never survives it.
   */
  tracking?: TrackingMode;
  /**
   * Machine-setting values for this entry, keyed by code — only ever holds
   * keys the exercise actually exposes (`Exercise.settings`). Cleared the
   * same way `tracking` is on a swap: the values belonged to the exercise
   * being left behind.
   */
  settings?: Record<string, string>;
  /**
   * Plan B, Plan C for the swipe/tap swap gesture. Only ever present on an
   * entry started from a routine; never saved onto `WorkoutEntry` — a swap
   * changes this session, not the plan's list of alternatives.
   */
  alternatives?: RoutineAlternative[];
  /** The routine exercise before any swap, so "back to the plan" is always one of the offered options. */
  plannedExercise?: { exerciseId: string; exerciseRef?: number; exerciseName: string };
  /**
   * The routine's targets, shown as a hint under the exercise name — not fed
   * into the number fields as a placeholder, because that slot already shows
   * what was actually lifted last time, which matters more mid-set. Purely
   * local to this editing session, never saved.
   */
  target?: {
    reps?: string;
    weight?: number;
    durationSec?: number;
    distanceM?: number;
    rpe?: number;
    restSeconds?: number;
  };
}

const blankSet = (): DraftSet => ({
  reps: '',
  weight: '',
  duration: '',
  distance: '',
  type: 'working',
  done: false,
});

/** The catalog's tracking mode for an exercise, or the default when the catalog has no entry for it (not yet loaded, or the exercise was since removed). */
function trackingModeFor(exercises: Exercise[], exerciseId: string): TrackingMode {
  const exercise = exercises.find((e) => e.id === exerciseId);
  return exercise?.tracking ?? 'reps_weight';
}

/**
 * The mode an entry's fields are shown and saved under: the frozen mode if
 * this entry was loaded from an existing session, otherwise resolved live
 * from the current catalog. Freezing itself only happens at save time
 * (`toSavedEntries`) — a brand-new entry has nothing to freeze yet.
 */
function effectiveTracking(entry: Pick<DraftEntry, 'tracking' | 'exerciseId'>, exercises: Exercise[]): TrackingMode {
  return entry.tracking ?? trackingModeFor(exercises, entry.exerciseId);
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

function toDraftEntries(entries: WorkoutEntry[], unit: Unit): DraftEntry[] {
  return entries.map((entry) => ({
    exerciseId: entry.exerciseId,
    exerciseRef: entry.exerciseRef,
    exerciseName: entry.exerciseName,
    groupId: entry.groupId,
    plannedExerciseId: entry.plannedExerciseId,
    tracking: entry.tracking,
    settings: entry.settings,
    sets: entry.sets.map((s) => ({
      reps: String(s.reps),
      weight: formatWeightInput(s.weight, unit),
      duration: formatDurationInput(s.durationSec),
      distance: formatDistanceInput(s.distanceM),
      type: setType(s),
      // Sets that predate check-off were logged after the fact; treating them
      // as unfinished would reopen every workout in the history.
      done: s.done ?? true,
      completedAt: s.completedAt,
      rpe: s.rpe,
    })),
  }));
}

// All four raw fields, not just reps/weight — a set logged under a time or
// distance mode never touches reps/weight at all, so checking only those two
// would silently drop it as "never filled in" (see § tracking-modes plan, UI).
const isBlank = (s: DraftSet) =>
  s.reps.trim() === '' && s.weight.trim() === '' && s.duration.trim() === '' && s.distance.trim() === '';

/**
 * A field the user opened but left blank is not a value to save — dropping it
 * here keeps a later "last time" placeholder from showing an empty string
 * instead of falling through to nothing. `undefined` when nothing is left,
 * so it can be spread away entirely rather than saved as `{}`.
 */
function filledSettings(settings: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!settings) return undefined;
  const filled = Object.fromEntries(Object.entries(settings).filter(([, v]) => v.trim() !== ''));
  return Object.keys(filled).length > 0 ? filled : undefined;
}

/**
 * Rows the user never filled in are sets they never did — dropping them keeps
 * "0 ×" phantoms out of the history, and entries left with nothing at all go
 * with them.
 */
function toSavedEntries(entries: DraftEntry[], unit: Unit, exercises: Exercise[]): WorkoutEntry[] {
  return entries
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      ...(entry.exerciseRef !== undefined ? { exerciseRef: entry.exerciseRef } : {}),
      exerciseName: entry.exerciseName,
      ...(entry.groupId !== undefined ? { groupId: entry.groupId } : {}),
      ...(entry.plannedExerciseId !== undefined
        ? { plannedExerciseId: entry.plannedExerciseId }
        : {}),
      // Frozen here, at save time: an entry loaded from an existing session
      // keeps the mode it was logged under, a fresh one takes whatever the
      // catalog says right now — see `effectiveTracking`.
      tracking: effectiveTracking(entry, exercises),
      ...(filledSettings(entry.settings) ? { settings: filledSettings(entry.settings) } : {}),
      sets: entry.sets.filter((s) => !isBlank(s)).map((s): WorkoutSet => {
        const weight = weightInputToKg(s.weight, unit);
        const durationSec = parseDurationInput(s.duration);
        const distanceM = parseDistanceInput(s.distance);
        return {
          reps: parseRepsInput(s.reps) ?? 0,
          ...(weight !== undefined ? { weight } : {}),
          ...(durationSec !== undefined ? { durationSec } : {}),
          ...(distanceM !== undefined ? { distanceM } : {}),
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
 * The draft only needs to survive the logged numbers and which exercises are
 * on the sheet — routine-only extras (`alternatives`, `plannedExercise`,
 * `target`) are never saved onto the real session either, and are cheap to
 * live without across a crash-and-restore.
 */
function toDraftSnapshot(entry: DraftEntry): WorkoutDraftEntry {
  return {
    exerciseId: entry.exerciseId,
    exerciseRef: entry.exerciseRef,
    exerciseName: entry.exerciseName,
    groupId: entry.groupId,
    plannedExerciseId: entry.plannedExerciseId,
    tracking: entry.tracking,
    settings: entry.settings,
    sets: entry.sets.map((s) => ({ ...s })),
  };
}

function fromDraftSnapshot(entry: WorkoutDraftEntry): DraftEntry {
  return {
    exerciseId: entry.exerciseId,
    exerciseRef: entry.exerciseRef,
    exerciseName: entry.exerciseName,
    groupId: entry.groupId,
    plannedExerciseId: entry.plannedExerciseId,
    tracking: entry.tracking,
    settings: entry.settings,
    sets: entry.sets.map((s) => ({ ...s })),
  };
}

/** Seed a fresh workout's entries from "Training starten" — blank sets, targets carried as a hint. */
function instantiationToDraftEntries(instantiation: RoutineInstantiation): DraftEntry[] {
  return instantiation.entries.map((ex) => ({
    exerciseId: ex.exerciseId,
    exerciseRef: ex.exerciseRef,
    exerciseName: ex.exerciseName,
    groupId: ex.groupId,
    plannedExerciseId: ex.plannedExerciseId,
    alternatives: ex.alternatives,
    plannedExercise: { exerciseId: ex.exerciseId, exerciseRef: ex.exerciseRef, exerciseName: ex.exerciseName },
    target: {
      reps: ex.targetReps,
      weight: ex.targetWeight,
      durationSec: ex.targetDurationSec,
      distanceM: ex.targetDistanceM,
      rpe: ex.targetRpe,
      restSeconds: ex.restSeconds,
    },
    sets: Array.from({ length: ex.setCount }, () => blankSet()),
  }));
}

/**
 * Container: waits for stored sessions — needed for the edit target as well as
 * for last session's numbers — then mounts the editor keyed by id so the form's
 * initial state is seeded from the resolved session.
 */
export function Workout() {
  const { id } = useParams();
  const location = useLocation();
  const { sessions, loaded } = useWorkouts();
  const { t } = useLanguage();

  if (!loaded) return <Spinner label={t('common.loading')} />;
  const initial = id ? sessions.find((s) => s.id === id) ?? null : null;
  if (id && !initial) return <Navigate to="/history" replace />;

  // Only for a brand-new session — an existing one is always edited as logged.
  const instantiation = !id
    ? ((location.state as { instantiation?: RoutineInstantiation } | null)?.instantiation ?? null)
    : null;

  // `location.key` is stable across re-renders of the same navigation (e.g. a
  // background sync updating `sessions`) but changes on every new "Training
  // starten" tap, even back to the same day — exactly the remount this needs
  // and nothing more.
  const key = id ?? (instantiation ? `routine-${location.key}` : 'new');

  return (
    <WorkoutEditor
      key={key}
      sessionKey={key}
      initial={initial}
      sessions={sessions}
      instantiation={instantiation}
    />
  );
}

/** The form's starting point before any draft is considered — what a plain (re)load of this session looks like. */
function initialFormState(
  initial: WorkoutSession | null,
  instantiation: RoutineInstantiation | null,
  unit: Unit
) {
  return {
    entries: initial
      ? toDraftEntries(initial.entries, unit)
      : instantiation
        ? instantiationToDraftEntries(instantiation)
        : [],
    title: initial?.title ?? instantiation?.title ?? '',
    startedAt: toLocalInputValue(initial?.startedAt ?? initial?.date ?? Date.now()),
    duration: initial?.durationMin != null ? String(initial.durationMin) : '',
    notes: initial?.notes ?? '',
  };
}

/**
 * Build or edit a workout: set title/start/duration/notes, pick exercises, log
 * sets, check them off as they are done.
 */
function WorkoutEditor({
  sessionKey,
  initial,
  sessions,
  instantiation,
}: {
  /** Stable identity for this editing session (same value used as the React `key`), so the local draft is scoped to the right workout. */
  sessionKey: string;
  initial: WorkoutSession | null;
  sessions: WorkoutSession[];
  instantiation: RoutineInstantiation | null;
}) {
  const { exercises, loading } = useExercises();
  const { addSession, updateSession, pendingCount } = useWorkouts();
  const { user, unit } = useAuth();
  const userId = user?.id;
  const rest = useRestTimer();
  const navigate = useNavigate();
  const { lang, t } = useLanguage();
  const [rpeVisible] = useRpeVisibility();
  const timeFmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const [entries, setEntries] = useState<DraftEntry[]>(
    () => initialFormState(initial, instantiation, unit).entries
  );
  /** Entries checked for the next "group as superset" action. */
  const [selectedForGroup, setSelectedForGroup] = useState<Set<number>>(new Set());
  /** Entries whose machine-settings panel is open — closed by default, so a plain reps/weight workout never shows it. */
  const [expandedSettings, setExpandedSettings] = useState<Set<number>>(new Set());
  /** `'add'` appends a new entry; an index replaces that entry's exercise instead. */
  const [picking, setPicking] = useState<'add' | number | false>(false);
  /** Entry index whose alternatives list is open (tap on the exercise name). */
  const [alternativesFor, setAlternativesFor] = useState<number | null>(null);
  /**
   * One toast, three reasons: swapping an exercise, removing one, and
   * discarding a recovered draft all need a way back. A swap only needs to
   * restore that one entry's identity; a removal needs the whole entries
   * array back exactly as it was — group membership included; a discarded
   * draft needs the whole form snapshot, since it wipes everything at once —
   * the one action in this recovery feature that could otherwise erase real
   * data from a real crash with no way back.
   */
  const [undo, setUndo] = useState<
    | {
        kind: 'swap';
        ei: number;
        previous: {
          exerciseId: string;
          exerciseRef?: number;
          exerciseName: string;
          tracking?: TrackingMode;
          settings?: Record<string, string>;
        };
        showHint: boolean;
      }
    | { kind: 'remove'; entries: DraftEntry[]; selectedForGroup: Set<number>; exerciseName: string }
    | { kind: 'discardDraft'; snapshot: ReturnType<typeof initialFormState> }
    | null
  >(null);
  const [plateEntry, setPlateEntry] = useState<number | null>(null);
  const [title, setTitle] = useState(() => initialFormState(initial, instantiation, unit).title);
  const [startedAt, setStartedAt] = useState(
    () => initialFormState(initial, instantiation, unit).startedAt
  );
  const [duration, setDuration] = useState(
    () => initialFormState(initial, instantiation, unit).duration
  );
  const [notes, setNotes] = useState(() => initialFormState(initial, instantiation, unit).notes);
  /** Whether the recovered-draft banner should show; cleared on save or explicit discard. */
  const [draftRestored, setDraftRestored] = useState(false);
  /** Set when `save()` throws, so a failed write is never mistaken for a successful one. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** When the local draft last wrote successfully — the "is this actually saved?" answer, shown right where the anxiety is. */
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<number | null>(null);
  /** Set when a background draft write throws — the local safety net silently failing is exactly the thing draft persistence exists to prevent, so it can't fail silently too. */
  const [draftSaveError, setDraftSaveError] = useState(false);
  /** Gates the autosave effect until the one-time draft check has resolved, so it never overwrites a not-yet-loaded draft with the plain initial state. */
  const [draftChecked, setDraftChecked] = useState(false);
  const routineId = initial?.routineId ?? instantiation?.routineId;
  const weekIndex = initial?.weekIndex ?? instantiation?.weekIndex;
  const dayId = initial?.dayId ?? instantiation?.dayId;

  // The undo toast is a moment, not a state: it clears itself.
  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), UNDO_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [undo]);

  /**
   * One-time recovery check: a draft newer than what this session last saved
   * means the previous edit never made it past the local snapshot — most
   * likely a killed tab or dead battery mid-workout. Older or absent drafts
   * are left alone; the plain initial state already covers those.
   */
  useEffect(() => {
    if (!userId) {
      setDraftChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const draft = await loadWorkoutDraft(userId, sessionKey);
      if (cancelled) return;
      if (draft && draft.savedAt > (initial?.updatedAt ?? 0)) {
        setEntries(draft.entries.map(fromDraftSnapshot));
        setTitle(draft.title);
        setStartedAt(draft.startedAt);
        setDuration(draft.duration);
        setNotes(draft.notes);
        setDraftRestored(true);
      }
      setDraftChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, sessionKey, initial?.updatedAt]);

  /**
   * Snapshots the in-progress workout to IndexedDB on every change, so the
   * one-time recovery check above always has something current to find.
   * Debounced rather than per-keystroke, and gated on `draftChecked` so this
   * never fires before the restore effect has had a chance to load an
   * existing draft first.
   */
  useEffect(() => {
    if (!userId || !draftChecked) return;
    const hasContent =
      entries.length > 0 || title.trim() !== '' || notes.trim() !== '' || duration.trim() !== '';
    if (!hasContent) return;
    const id = window.setTimeout(() => {
      saveWorkoutDraft(userId, sessionKey, {
        entries: entries.map(toDraftSnapshot),
        title,
        startedAt,
        duration,
        notes,
      })
        .then(() => {
          setDraftSaveError(false);
          setLastDraftSavedAt(Date.now());
        })
        .catch((err: unknown) => {
          // The local safety net just failed quietly (IndexedDB quota,
          // private-browsing restrictions) — surfaced so the user knows not
          // to trust it, rather than assuming their taps are being caught.
          console.error('Failed to save workout draft', err);
          setDraftSaveError(true);
        });
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [userId, sessionKey, draftChecked, entries, title, startedAt, duration, notes]);

  /**
   * Discard a restored draft and go back to the plain, unedited session — the
   * escape hatch for "no, I didn't want that back." Gets the same undo toast
   * as swap/remove: this is real recovered data from a real crash, and a
   * reflexive tap here should not be the one unrecoverable action in the
   * whole recovery feature.
   */
  function discardDraft() {
    const snapshot = { entries, title, startedAt, duration, notes };
    if (userId) void clearWorkoutDraft(userId, sessionKey);
    const fresh = initialFormState(initial, instantiation, unit);
    setEntries(fresh.entries);
    setTitle(fresh.title);
    setStartedAt(fresh.startedAt);
    setDuration(fresh.duration);
    setNotes(fresh.notes);
    setDraftRestored(false);
    setLastDraftSavedAt(null);
    setUndo({ kind: 'discardDraft', snapshot });
  }

  function undoDiscardDraft() {
    if (!undo || undo.kind !== 'discardDraft') return;
    const { snapshot } = undo;
    setEntries(snapshot.entries);
    setTitle(snapshot.title);
    setStartedAt(snapshot.startedAt);
    setDuration(snapshot.duration);
    setNotes(snapshot.notes);
    setDraftRestored(true);
    if (userId) {
      void saveWorkoutDraft(userId, sessionKey, snapshot).then(() => setLastDraftSavedAt(Date.now()));
    }
    setUndo(null);
  }

  /** Drag origin for the swap-to-alternative swipe; a ref because it never needs to trigger a render. */
  const swipeOrigin = useRef<{ ei: number; x: number; width: number } | null>(null);
  /** Set when a swipe just swapped the exercise, so the click that follows the pointer-up does not also open the alternatives list. */
  const suppressNameClick = useRef(false);

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
   * pre-filling anything that could be saved unread. The session under edit is
   * excluded, the same way it always was: comparing a workout against itself
   * would show today's numbers as "last time".
   */
  const previousSets = useMemo(
    () => exerciseRecency(sessions, { excludeSessionId: initial?.id }),
    [sessions, initial?.id]
  );

  const savedEntries = useMemo(
    () => toSavedEntries(entries, unit, exercises),
    [entries, unit, exercises]
  );

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
    const sets = previousSets.get(exerciseId)?.lastSets;
    if (!sets || sets.length === 0) return undefined;
    return sets[Math.min(index, sets.length - 1)];
  }

  // exerciseRef is recorded alongside the id: if the id link is ever lost, the
  // reference number is what lets the entry be reattached to its exercise.
  function addExercise(exerciseId: string, exerciseName: string, exerciseRef: number) {
    setEntries((prev) => [...prev, { exerciseId, exerciseRef, exerciseName, sets: [blankSet()] }]);
    setPicking(false);
  }

  /**
   * Swap which exercise an entry logs against — the routine's own picture of
   * this slot (`plannedExerciseId`) never changes, only what is being logged
   * right now. Sets, groupId and targets carry over unchanged: a swap is a
   * substitution, not a fresh start.
   */
  function replaceExercise(
    ei: number,
    next: { exerciseId: string; exerciseRef?: number; exerciseName: string }
  ) {
    const entry = entries[ei];
    if (!entry || next.exerciseId === entry.exerciseId) return;
    const previous = {
      exerciseId: entry.exerciseId,
      exerciseRef: entry.exerciseRef,
      exerciseName: entry.exerciseName,
      tracking: entry.tracking,
      settings: entry.settings,
    };
    setEntries((prev) =>
      // Clears any frozen tracking mode and logged settings along with the
      // swap: both belonged to the exercise being left behind. Tracking
      // resolves its own live from the catalog (`effectiveTracking`) until
      // this entry is saved; settings simply has nothing to show until the
      // new exercise's own slots are filled in.
      prev.map((e, i) => (i !== ei ? e : { ...e, ...next, tracking: undefined, settings: undefined }))
    );
    const seenHint = localStorage.getItem(SWAP_HINT_SEEN_KEY) === 'true';
    if (!seenHint) localStorage.setItem(SWAP_HINT_SEEN_KEY, 'true');
    setUndo({ kind: 'swap', ei, previous, showHint: !seenHint });
  }

  function undoSwap() {
    if (!undo || undo.kind !== 'swap') return;
    setEntries((prev) => prev.map((e, i) => (i !== undo.ei ? e : { ...e, ...undo.previous })));
    setUndo(null);
  }

  function onSwipeStart(ei: number, e: ReactPointerEvent<HTMLElement>) {
    const entry = entries[ei];
    if (!entry.alternatives || entry.alternatives.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    swipeOrigin.current = { ei, x: e.clientX, width: rect.width };
  }

  function onSwipeEnd(e: ReactPointerEvent<HTMLElement>) {
    const origin = swipeOrigin.current;
    swipeOrigin.current = null;
    if (!origin) return;
    if (!shouldSwipe(e.clientX - origin.x, origin.width)) return;
    const alt = entries[origin.ei].alternatives?.[0];
    if (alt) {
      replaceExercise(origin.ei, alt);
      suppressNameClick.current = true;
    }
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

  function updateEntrySetting(ei: number, code: string, value: string) {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i !== ei ? entry : { ...entry, settings: { ...entry.settings, [code]: value } }
      )
    );
  }

  function toggleSettingsExpanded(ei: number) {
    setExpandedSettings((prev) => {
      const next = new Set(prev);
      if (next.has(ei)) next.delete(ei);
      else next.add(ei);
      return next;
    });
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

  /**
   * A single tap deletes an exercise and every set logged against it — the
   * most destructive action in this editor, so it gets the same undo toast a
   * swap does rather than a confirm dialog: recoverable beats an extra tap
   * between "logging fast" and "removing one thing."
   */
  function removeEntry(ei: number) {
    const removed = entries[ei];
    if (!removed) return;
    setUndo({ kind: 'remove', entries, selectedForGroup, exerciseName: removed.exerciseName });
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
    setExpandedSettings((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i === ei) return;
        next.add(i > ei ? i - 1 : i);
      });
      return next;
    });
  }

  function undoRemove() {
    if (!undo || undo.kind !== 'remove') return;
    setEntries(undo.entries);
    setSelectedForGroup(undo.selectedForGroup);
    // Not restored to its pre-removal mapping: it is display-only state, and
    // the indices `removeEntry` shifted have no matching "undo" snapshot the
    // way `selectedForGroup` does. Closing every panel is a safe default —
    // wrong, but never misleadingly wrong.
    setExpandedSettings(new Set());
    setUndo(null);
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
    // A routine-set duration for this exercise overrides the global default;
    // without one, `start()` falls back to it on its own.
    if (set.type !== 'drop' && isLastGroupMember(entries, ei)) {
      rest.start(entries[ei].target?.restSeconds);
    }

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
    if (savedEntries.length === 0 || saving) return;
    setSaveError(null);
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
      // A backward-pointing label only: there is no path from here back into
      // the routine, so nothing this session does can ever edit the template.
      ...(routineId !== undefined ? { routineId, weekIndex, dayId } : {}),
      entries: savedEntries,
    };
    // Computed against the account's history *without* this session — an
    // edit to an already-saved workout must not be compared against itself.
    const priorSessions = sessions.filter((s) => s.id !== session.id);
    const exerciseIds = [...new Set(savedEntries.map((e) => e.exerciseId))];
    const newPRs: NewPR[] = exerciseIds
      .map((exerciseId): NewPR | null => {
        const savedEntry = savedEntries.find((e) => e.exerciseId === exerciseId)!;
        // Every record kind is computed unconditionally (see
        // `computeExerciseRecords`), so this narrows "everything that
        // changed" down to what this entry's own tracking mode actually
        // means — a bench-press session never announces a "reps record".
        const relevant = RECORD_KINDS_BY_TRACKING[entryTracking(savedEntry)];
        const kinds = newRecordKinds(findNewRecords(priorSessions, session, exerciseId)).filter((k) =>
          relevant.includes(k)
        );
        if (kinds.length === 0) return null;
        return { exerciseId, exerciseName: savedEntry.exerciseName, kinds };
      })
      .filter((pr): pr is NewPR => pr !== null);

    setSaving(true);
    try {
      if (initial) await updateSession(session);
      else await addSession(session);
    } catch (err) {
      // The raw error (IndexedDB quota, private-browsing restrictions, ...)
      // is never gym-floor language, so the message shown is always the
      // translated fallback rather than whatever the browser threw — but it's
      // still logged, so a recurring failure leaves a trace to debug from.
      console.error('Failed to save workout', err);
      setSaveError(t('workout.saveError'));
      setSaving(false);
      return;
    }
    if (userId) {
      try {
        await clearWorkoutDraft(userId, sessionKey);
      } catch {
        // Best-effort: the session itself is already saved; a leftover local
        // draft is harmless and gets overwritten the next time this session
        // is edited.
      }
    }
    navigate('/history', newPRs.length > 0 ? { state: { newPRs } } : undefined);
  }

  /** Plate calculator / remove — shared between a standalone card and a group member's row. */
  function renderEntryActions(ei: number) {
    const entry = entries[ei];
    // No weight is ever logged under this mode — a plate calculator for a
    // plank or a bodyweight pull-up has nothing to compute.
    const showPlates = entry && TRACKING_FIELDS[effectiveTracking(entry, exercises)].includes('weight');
    return (
      <div className="flex shrink-0 items-center">
        {showPlates && (
          <button
            onClick={() => setPlateEntry(ei)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-fg-subtle transition hover:bg-surface-2 hover:text-fg"
            aria-label={t('plates.open')}
            title={t('plates.open')}
          >
            <PlatesIcon width={20} height={20} />
          </button>
        )}
        <button
          onClick={() => removeEntry(ei)}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs text-fg-subtle transition hover:bg-surface-2 hover:text-danger"
        >
          {t('workout.remove')}
        </button>
      </div>
    );
  }

  /**
   * Exercise name — shared between a standalone card and a group member.
   * Only entries started from a routine carry `alternatives`, so the swipe
   * and tap-to-swap affordances are silent no-ops everywhere else: a plain
   * `onSwipeStart` bails immediately when there is nothing to swap to.
   */
  function renderExerciseName(ei: number, entry: DraftEntry, letter?: string) {
    const target = entry.target;
    // Only the fields this entry's own mode actually uses — a routine slot
    // can carry stale targets from before a swap or a mode change, and
    // showing e.g. a leftover target duration on a reps_weight lift would be
    // exactly the kind of irrelevant-field noise tracking modes exist to cut.
    const fields = TRACKING_FIELDS[effectiveTracking(entry, exercises)];
    const targetHint = target
      ? [
          fields.includes('reps') && target.reps ? `${target.reps} ${t('workout.reps')}` : null,
          fields.includes('weight') && target.weight != null
            ? formatWeightWithUnit(target.weight, unit)
            : null,
          fields.includes('duration') && target.durationSec != null
            ? formatDuration(target.durationSec)
            : null,
          fields.includes('distance') && target.distanceM != null
            ? formatDistanceWithUnit(target.distanceM)
            : null,
          target.rpe != null ? `RPE ${target.rpe}` : null,
        ]
          .filter((part): part is string => part !== null)
          .join(' · ')
      : '';

    return (
      <div
        className="min-w-0 flex-1"
        onPointerDown={(e) => onSwipeStart(ei, e)}
        onPointerUp={(e) => onSwipeEnd(e)}
        onPointerCancel={() => {
          swipeOrigin.current = null;
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (suppressNameClick.current) {
              suppressNameClick.current = false;
              return;
            }
            if (entry.alternatives && entry.alternatives.length > 0) setAlternativesFor(ei);
          }}
          className="flex min-w-0 items-center gap-1.5 text-left font-semibold text-fg"
        >
          {letter && (
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent">
              {letter}
            </span>
          )}
          <span className="min-w-0 truncate">{entry.exerciseName}</span>
        </button>
        {targetHint && <p className="truncate text-xs text-fg-subtle">{targetHint}</p>}
      </div>
    );
  }

  /** The header label for one tracking-field column. */
  function fieldHeaderLabel(field: TrackingField): string {
    switch (field) {
      case 'reps':
        return t('workout.reps');
      case 'weight':
        return `${t('workout.weight')} (${unit})`;
      case 'duration':
        return t('workout.setDuration');
      case 'distance':
        return t('workout.setDistance');
    }
  }

  /** One set row's field for a given tracking mode. `inputRef` is only wired on the row's first field, so the check-off jump lands somewhere real regardless of mode. */
  function renderTrackingField(
    field: TrackingField,
    ei: number,
    si: number,
    set: DraftSet,
    last: WorkoutSet | undefined,
    isPrimary: boolean
  ) {
    const inputRef = isPrimary ? registerReps(`${ei}:${si}`) : undefined;
    const label = fieldHeaderLabel(field);
    const fieldLabel = `${t('workout.set')} ${si + 1} — ${label}`;
    const stepUpLabel = t('set.more', { label });
    const stepDownLabel = t('set.less', { label });

    switch (field) {
      case 'reps':
        return (
          <NumberField
            inputRef={inputRef}
            value={set.reps}
            onChange={(reps) => updateSet(ei, si, { reps })}
            step={1}
            min={0}
            integer
            label={fieldLabel}
            stepUpLabel={stepUpLabel}
            stepDownLabel={stepDownLabel}
            placeholder={last ? String(last.reps) : '–'}
          />
        );
      case 'weight':
        return (
          <NumberField
            inputRef={inputRef}
            value={set.weight}
            onChange={(weight) => updateSet(ei, si, { weight })}
            step={weightStep(unit)}
            min={0}
            label={fieldLabel}
            stepUpLabel={stepUpLabel}
            stepDownLabel={stepDownLabel}
            placeholder={last?.weight != null ? formatWeightInput(last.weight, unit) : '–'}
          />
        );
      case 'duration':
        return (
          <DurationField
            inputRef={inputRef}
            value={set.duration}
            onChange={(duration) => updateSet(ei, si, { duration })}
            step={DURATION_STEP_SEC}
            label={fieldLabel}
            stepUpLabel={stepUpLabel}
            stepDownLabel={stepDownLabel}
            placeholder={last?.durationSec != null ? formatDuration(last.durationSec) : '–'}
          />
        );
      case 'distance':
        return (
          <NumberField
            inputRef={inputRef}
            value={set.distance}
            onChange={(distance) => updateSet(ei, si, { distance })}
            step={DISTANCE_STEP_M}
            min={0}
            integer
            label={fieldLabel}
            stepUpLabel={stepUpLabel}
            stepDownLabel={stepDownLabel}
            placeholder={last?.distanceM != null ? String(last.distanceM) : '–'}
          />
        );
    }
  }

  /** Set rows for one entry — shared between a standalone card and a group member. */
  function renderSetRows(ei: number, entry: DraftEntry) {
    const mode = effectiveTracking(entry, exercises);
    const fields = TRACKING_FIELDS[mode];
    const gridClass = setRowGridClass(fields.length);

    return (
      <>
        <div className={`grid ${gridClass} gap-x-2 text-xs font-semibold uppercase text-fg-subtle`}>
          <span>{t('workout.set')}</span>
          {fields.map((field) => (
            <span key={field}>{fieldHeaderLabel(field)}</span>
          ))}
          <span className="sr-only">{t('workout.doneColumn')}</span>
        </div>

        <div className="mt-2 space-y-2">
          {entry.sets.map((set, si) => {
            const last = previousSet(entry.exerciseId, si);
            const dampened = set.done || set.type === 'warmup';
            return (
              <div key={si} className="space-y-1.5">
                <div
                  className={`grid ${gridClass} items-start gap-x-2 transition-opacity ${
                    dampened ? 'opacity-55' : ''
                  }`}
                >
                  <SetTypeToggle
                    value={set.type}
                    setNumber={si + 1}
                    onChange={(type) => updateSet(ei, si, { type })}
                  />

                  {fields.map((field, fi) => (
                    <Fragment key={field}>
                      {renderTrackingField(field, ei, si, set, last, fi === 0)}
                    </Fragment>
                  ))}

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

  /**
   * Machine-setting values for one entry — collapsed by default, and absent
   * entirely for an exercise with no settings configured in the catalog, so
   * a plain reps/weight workout never shows an empty panel.
   */
  function renderSettingsPanel(ei: number, entry: DraftEntry) {
    const codes = exercises.find((e) => e.id === entry.exerciseId)?.settings ?? [];
    if (codes.length === 0) return null;

    const expanded = expandedSettings.has(ei);
    const last = lastSettingsFor(sessions, entry.exerciseId, { excludeSessionId: initial?.id });

    return (
      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => toggleSettingsExpanded(ei)}
          aria-expanded={expanded}
          className="focus-ring flex min-h-8 items-center gap-1 text-xs font-semibold uppercase text-fg-subtle transition hover:text-fg"
        >
          <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>
            ›
          </span>
          {t('workout.settings')}
        </button>
        {expanded && (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {codes.map((code) => (
              <div key={code}>
                <label className="label" htmlFor={`wo-setting-${ei}-${code}`}>
                  {t(`setting.${code}` as TKey)}
                </label>
                <input
                  id={`wo-setting-${ei}-${code}`}
                  type="text"
                  autoComplete="off"
                  className="input"
                  value={entry.settings?.[code] ?? ''}
                  onChange={(e) => updateEntrySetting(ei, code, e.target.value)}
                  placeholder={last?.[code] ?? '–'}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {initial ? t('workout.editTitle') : t('workout.title')}
        </h1>
        {savedEntries.length > 0 && (
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary px-5 text-sm disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        )}
      </div>

      {saveError && <ErrorBanner message={saveError} />}

      {!saveError && draftSaveError && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t('workout.draftSaveError')}</p>
      )}

      {!saveError && !draftSaveError && (lastDraftSavedAt !== null || pendingCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {/* The anxiety this answers is "did my last tap actually stick?" —
              answered right here, not three screens away in History. */}
          <PendingSyncChip count={pendingCount} />
          {lastDraftSavedAt !== null && (
            <span className="text-fg-subtle">
              {t('workout.savedLocally', { time: timeFmt.format(lastDraftSavedAt) })}
            </span>
          )}
        </div>
      )}

      {draftRestored && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3"
        >
          <span className="text-sm text-fg">{t('workout.draftRestored')}</span>
          <button onClick={discardDraft} className="btn-ghost shrink-0 px-3 py-1.5 text-sm">
            {t('workout.discardDraft')}
          </button>
        </div>
      )}

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
                    <div className="flex min-w-0 items-center gap-0.5">
                      <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectedForGroup.has(ei)}
                          onChange={() => toggleSelectedForGroup(ei)}
                          aria-label={t('workout.selectForGroup', { name: entry.exerciseName })}
                          className="focus-ring h-5 w-5 accent-accent"
                        />
                      </label>
                      {renderExerciseName(ei, entry)}
                    </div>
                    {renderEntryActions(ei)}
                  </div>
                  {renderSetRows(ei, entry)}
                  {renderSettingsPanel(ei, entry)}
                </div>
              );
            }

            // groupId is set here: a multi-member block always shares one.
            return (
              <div key={groupId} className="card space-y-4 border-accent/30 bg-accent/[0.03] p-4">
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
                        {renderExerciseName(ei, entry, letters[ei])}
                        {renderEntryActions(ei)}
                      </div>
                      {renderSetRows(ei, entry)}
                      {renderSettingsPanel(ei, entry)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => setPicking('add')} className="btn-ghost w-full">
        {t('workout.addExercise')}
      </button>

      {picking !== false && (
        <ExercisePicker
          exercises={exercises}
          mode={picking === 'add' ? 'add' : 'single'}
          onSelect={(picked) => {
            if (picking === 'add') {
              for (const ex of picked) {
                addExercise(ex.id, localizedExercise(ex, lang).name, ex.ref);
              }
            } else {
              const ex = picked[0];
              replaceExercise(picking, {
                exerciseId: ex.id,
                exerciseRef: ex.ref,
                exerciseName: localizedExercise(ex, lang).name,
              });
            }
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {alternativesFor !== null && entries[alternativesFor] && (
        <Modal
          title={t('routines.alternativesTitle', { name: entries[alternativesFor].exerciseName })}
          onClose={() => setAlternativesFor(null)}
        >
          <ul className="space-y-2">
            {entries[alternativesFor].plannedExercise &&
              entries[alternativesFor].plannedExercise!.exerciseId !== entries[alternativesFor].exerciseId && (
                <li>
                  <button
                    onClick={() => {
                      replaceExercise(alternativesFor, entries[alternativesFor].plannedExercise!);
                      setAlternativesFor(null);
                    }}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-left text-fg hover:bg-border"
                  >
                    <span>{entries[alternativesFor].plannedExercise!.exerciseName}</span>
                    <span className="chip bg-surface text-fg-subtle">{t('routines.backToPlan')}</span>
                  </button>
                </li>
              )}
            {(entries[alternativesFor].alternatives ?? [])
              .filter((alt) => alt.exerciseId !== entries[alternativesFor].exerciseId)
              .map((alt) => (
                <li key={alt.exerciseId}>
                  <button
                    onClick={() => {
                      replaceExercise(alternativesFor, alt);
                      setAlternativesFor(null);
                    }}
                    className="flex min-h-14 w-full items-center rounded-xl bg-surface-2 px-4 py-3 text-left text-fg hover:bg-border"
                  >
                    {alt.exerciseName}
                  </button>
                </li>
              ))}
            <li>
              <button
                onClick={() => {
                  setPicking(alternativesFor);
                  setAlternativesFor(null);
                }}
                className="btn-ghost w-full text-sm"
              >
                {t('routines.pickOtherExercise')}
              </button>
            </li>
          </ul>
        </Modal>
      )}

      {undo && (
        <div
          role="status"
          // The rest timer bar lives at this same bottom-16 strip and can be
          // showing at the same time — finishing a set starts it, and a swap
          // or removal right after is an ordinary sequence — so this toast
          // steps up above it instead of stacking directly on top.
          className={`fixed left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-3 pb-2 ${
            rest.rest ? 'bottom-36' : 'bottom-16'
          }`}
        >
          <div className="card flex items-center justify-between gap-3 p-3 shadow-lg">
            <div className="min-w-0">
              <p className="truncate text-sm text-fg">
                {undo.kind === 'swap' && t('routines.swapped', { name: entries[undo.ei]?.exerciseName ?? '' })}
                {undo.kind === 'remove' && t('workout.removedEntry', { name: undo.exerciseName })}
                {undo.kind === 'discardDraft' && t('workout.draftDiscarded')}
              </p>
              {undo.kind === 'swap' && undo.showHint && (
                <p className="mt-0.5 text-xs text-fg-subtle">{t('routines.swapHint')}</p>
              )}
            </div>
            <button
              onClick={
                undo.kind === 'swap' ? undoSwap : undo.kind === 'remove' ? undoRemove : undoDiscardDraft
              }
              className="btn-ghost shrink-0 px-3 py-1.5 text-sm"
            >
              {t('routines.undoSwap')}
            </button>
          </div>
        </div>
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
