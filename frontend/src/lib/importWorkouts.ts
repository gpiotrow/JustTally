import { EXPORT_FORMAT, type ExportBundle, type ExportedBodyWeight, type ExportedExercise } from './exportSchema';
import type { Routine, RoutineAlternative, RoutineDay, RoutineExercise, RoutineWeek, WorkoutEntry, WorkoutSession, WorkoutSet } from './types';
import { TRACKING_MODES } from './tracking';
import { MACHINE_SETTINGS } from './machineSettings';

/**
 * Structural validation mirrors the backend's `isValidEntries` /
 * `isValidRoutine` (workouts.js, routines.js) on purpose: a file this loose
 * check accepts is a file the server would also accept on the next sync, so
 * the two must agree on what "valid" means.
 */

const SET_TYPES = new Set(['warmup', 'working', 'drop']);
const TRACKING_MODE_SET = new Set<string>(TRACKING_MODES);
const MACHINE_SETTING_SET = new Set<string>(MACHINE_SETTINGS);

/**
 * A settings-values object (`WorkoutEntry.settings`) is valid when every key
 * is a known machine-setting code and every value is a string. Mirrors
 * `backend/src/services/machineSettings.js`'s `isValidSettingsValues`.
 */
function isValidSettingsValues(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([k, v]) => MACHINE_SETTING_SET.has(k) && typeof v === 'string'
  );
}

function isValidSet(s: unknown): s is WorkoutSet {
  if (!s || typeof s !== 'object') return false;
  const set = s as Record<string, unknown>;
  return (
    typeof set.reps === 'number' &&
    (set.weight === undefined || typeof set.weight === 'number') &&
    (set.durationSec === undefined ||
      (typeof set.durationSec === 'number' && Number.isFinite(set.durationSec) && set.durationSec >= 0)) &&
    (set.distanceM === undefined ||
      (typeof set.distanceM === 'number' && Number.isFinite(set.distanceM) && set.distanceM >= 0)) &&
    (set.type === undefined || (typeof set.type === 'string' && SET_TYPES.has(set.type))) &&
    (set.done === undefined || typeof set.done === 'boolean') &&
    (set.completedAt === undefined ||
      (typeof set.completedAt === 'number' && Number.isFinite(set.completedAt) && set.completedAt > 0)) &&
    (set.rpe === undefined ||
      (typeof set.rpe === 'number' &&
        Number.isFinite(set.rpe) &&
        set.rpe >= 5 &&
        set.rpe <= 10 &&
        set.rpe * 2 === Math.round(set.rpe * 2)))
  );
}

function isValidEntry(e: unknown): e is WorkoutEntry {
  if (!e || typeof e !== 'object') return false;
  const entry = e as Record<string, unknown>;
  return (
    typeof entry.exerciseId === 'string' &&
    typeof entry.exerciseName === 'string' &&
    (entry.exerciseRef === undefined ||
      (typeof entry.exerciseRef === 'number' && Number.isInteger(entry.exerciseRef) && entry.exerciseRef > 0)) &&
    (entry.groupId === undefined || typeof entry.groupId === 'string') &&
    (entry.plannedExerciseId === undefined || typeof entry.plannedExerciseId === 'string') &&
    (entry.tracking === undefined ||
      (typeof entry.tracking === 'string' && TRACKING_MODE_SET.has(entry.tracking))) &&
    (entry.settings === undefined || isValidSettingsValues(entry.settings)) &&
    Array.isArray(entry.sets) &&
    entry.sets.every(isValidSet)
  );
}

function isValidSession(s: unknown): s is WorkoutSession {
  if (!s || typeof s !== 'object') return false;
  const session = s as Record<string, unknown>;
  return (
    typeof session.id === 'string' &&
    typeof session.date === 'number' &&
    typeof session.updatedAt === 'number' &&
    (session.title === undefined || typeof session.title === 'string') &&
    (session.startedAt === undefined || typeof session.startedAt === 'number') &&
    (session.durationMin === undefined || typeof session.durationMin === 'number') &&
    (session.notes === undefined || typeof session.notes === 'string') &&
    (session.routineId === undefined || typeof session.routineId === 'string') &&
    (session.weekIndex === undefined || typeof session.weekIndex === 'number') &&
    (session.dayId === undefined || typeof session.dayId === 'string') &&
    Array.isArray(session.entries) &&
    session.entries.every(isValidEntry)
  );
}

function isValidAlternative(a: unknown): a is RoutineAlternative {
  if (!a || typeof a !== 'object') return false;
  const alt = a as Record<string, unknown>;
  return (
    typeof alt.exerciseId === 'string' &&
    typeof alt.exerciseName === 'string' &&
    (alt.exerciseRef === undefined || (typeof alt.exerciseRef === 'number' && Number.isInteger(alt.exerciseRef) && alt.exerciseRef > 0))
  );
}

function isValidRoutineExercise(e: unknown): e is RoutineExercise {
  if (!e || typeof e !== 'object') return false;
  const ex = e as Record<string, unknown>;
  return (
    typeof ex.exerciseId === 'string' &&
    typeof ex.exerciseName === 'string' &&
    (ex.exerciseRef === undefined || (typeof ex.exerciseRef === 'number' && Number.isInteger(ex.exerciseRef) && ex.exerciseRef > 0)) &&
    Array.isArray(ex.alternatives) &&
    ex.alternatives.every(isValidAlternative) &&
    typeof ex.targetSets === 'number' &&
    Number.isInteger(ex.targetSets) &&
    ex.targetSets > 0 &&
    (ex.targetReps === undefined || typeof ex.targetReps === 'string') &&
    (ex.targetWeight === undefined || typeof ex.targetWeight === 'number') &&
    (ex.targetDurationSec === undefined || typeof ex.targetDurationSec === 'number') &&
    (ex.targetDistanceM === undefined || typeof ex.targetDistanceM === 'number') &&
    (ex.targetRpe === undefined || typeof ex.targetRpe === 'number') &&
    (ex.restSeconds === undefined || typeof ex.restSeconds === 'number') &&
    (ex.groupId === undefined || typeof ex.groupId === 'string') &&
    (ex.notes === undefined || typeof ex.notes === 'string')
  );
}

function isValidDay(d: unknown): d is RoutineDay {
  if (!d || typeof d !== 'object') return false;
  const day = d as Record<string, unknown>;
  return (
    typeof day.id === 'string' &&
    typeof day.name === 'string' &&
    Array.isArray(day.exercises) &&
    day.exercises.every(isValidRoutineExercise)
  );
}

function isValidWeek(w: unknown): w is RoutineWeek {
  if (!w || typeof w !== 'object') return false;
  const week = w as Record<string, unknown>;
  return (
    typeof week.id === 'string' &&
    (week.name === undefined || typeof week.name === 'string') &&
    Array.isArray(week.days) &&
    week.days.every(isValidDay)
  );
}

function isValidRoutine(r: unknown): r is Routine {
  if (!r || typeof r !== 'object') return false;
  const routine = r as Record<string, unknown>;
  return (
    typeof routine.id === 'string' &&
    typeof routine.name === 'string' &&
    typeof routine.updatedAt === 'number' &&
    (routine.description === undefined || typeof routine.description === 'string') &&
    Array.isArray(routine.weeks) &&
    routine.weeks.every(isValidWeek)
  );
}

function isValidExercise(e: unknown): e is ExportedExercise {
  if (!e || typeof e !== 'object') return false;
  const ex = e as Record<string, unknown>;
  return (
    typeof ex.id === 'string' &&
    typeof ex.ref === 'number' &&
    typeof ex.name === 'string' &&
    (ex.musclesPrimary === undefined ||
      (Array.isArray(ex.musclesPrimary) && ex.musclesPrimary.every((m) => typeof m === 'string'))) &&
    (ex.musclesSecondary === undefined ||
      (Array.isArray(ex.musclesSecondary) && ex.musclesSecondary.every((m) => typeof m === 'string'))) &&
    (ex.tracking === undefined ||
      (typeof ex.tracking === 'string' && TRACKING_MODE_SET.has(ex.tracking))) &&
    (ex.settings === undefined ||
      (Array.isArray(ex.settings) && ex.settings.every((s) => MACHINE_SETTING_SET.has(s as string))))
  );
}

function isValidBodyWeight(b: unknown): b is ExportedBodyWeight {
  if (!b || typeof b !== 'object') return false;
  const bw = b as Record<string, unknown>;
  return typeof bw.date === 'number' && typeof bw.kg === 'number';
}

export class ExportFormatError extends Error {}

/**
 * Filter an array to the entries that pass a validator, describing what got
 * dropped instead of silently discarding it — a hand-edited or foreign file
 * can be partially wrong without being worthless.
 */
function filterValid<T>(
  items: unknown,
  isValid: (item: unknown) => item is T,
  label: string,
  errors: string[]
): T[] {
  if (!Array.isArray(items)) {
    errors.push(`${label}: not an array, treated as empty`);
    return [];
  }
  const valid: T[] = [];
  items.forEach((item, index) => {
    if (isValid(item)) valid.push(item);
    else errors.push(`${label}[${index}]: malformed, skipped`);
  });
  return valid;
}

/**
 * Parse a `justtally-export/v1` file back into an {@link ExportBundle}.
 *
 * Throws only when the file is not recognisable as an export at all (wrong
 * format tag, not an object). Once past that gate, malformed rows inside an
 * otherwise-valid file are dropped and reported in `errors` rather than
 * failing the whole import — the same "reject the row, not the file" line
 * `isValidEntries` draws on the server.
 */
export function parseExport(input: unknown): { bundle: ExportBundle; errors: string[] } {
  if (!input || typeof input !== 'object') {
    throw new ExportFormatError('Not a Just Tally export file');
  }
  const data = input as Record<string, unknown>;
  if (data.format !== EXPORT_FORMAT) {
    throw new ExportFormatError(`Unrecognised export format: ${String(data.format)}`);
  }

  const errors: string[] = [];
  const bundle: ExportBundle = {
    exercises: filterValid(data.exercises, isValidExercise, 'exercises', errors),
    routines: filterValid(data.routines, isValidRoutine, 'routines', errors),
    bodyWeights: filterValid(data.bodyWeights, isValidBodyWeight, 'bodyWeights', errors),
    sessions: filterValid(data.sessions, isValidSession, 'sessions', errors),
  };
  return { bundle, errors };
}
