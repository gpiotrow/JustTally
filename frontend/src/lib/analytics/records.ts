import type { WorkoutSession } from '../types';
import type { TrackingMode } from '../tracking';
import { bestSetEstimate } from './oneRepMax';
import {
  bestSetDistance,
  bestSetDuration,
  bestSetReps,
  bestSetVolume,
  bestSetWeight,
  bestPaceSecPerKm,
} from './volume';

export interface DatedValue {
  value: number;
  date: number;
}

export interface ExerciseRecords {
  /** Heaviest single set logged, with the date it happened. Meaningful for `reps_weight` and `time_weight` alike — a held weight counts even at zero reps. */
  maxWeight: DatedValue | null;
  /** Highest estimated 1RM logged; `reliable` mirrors the set it came from. Only ever comes from a `reps_weight` set — see `oneRepMax.ts`'s `countableSets`. */
  maxE1rm: (DatedValue & { reliable: boolean }) | null;
  /** Heaviest single *set's* volume (reps × weight), not a session total. `reps_weight` only, by construction. */
  maxSetVolume: DatedValue | null;
  /** Most reps logged in a single set — the `reps`-mode counterpart to `maxWeight`. */
  maxReps: DatedValue | null;
  /** Longest single logged duration, in seconds — `time` and `time_weight`. */
  maxDuration: DatedValue | null;
  /** Longest single logged distance, in meters — `distance_time`. */
  maxDistance: DatedValue | null;
  /** Best (lowest) pace, in seconds per kilometer — `distance_time`. Unlike every other record here, lower is the win. */
  bestPace: DatedValue | null;
}

/** Every entry logging one exercise across a set of sessions, oldest first. */
function entriesForExercise(sessions: WorkoutSession[], exerciseId: string) {
  return [...sessions]
    .sort((a, b) => (a.startedAt ?? a.date) - (b.startedAt ?? b.date))
    .flatMap((session) =>
      session.entries
        .filter((e) => e.exerciseId === exerciseId)
        .map((entry) => ({ entry, date: session.startedAt ?? session.date }))
    );
}

/**
 * Best weight, best estimated 1RM, best single-set volume, and their
 * counterparts for the other tracking modes, for one exercise across every
 * session that logs it. Each record keeps the date it happened on,
 * independently — the heaviest weight and the best e1RM do not have to come
 * from the same set, let alone the same session.
 *
 * Computed unconditionally rather than gated on the exercise's current
 * catalog mode: each helper already only finds a value where one is
 * physically meaningful (an e1RM never comes from a zero-rep set, a pace
 * never comes from a set with no distance logged), so a field simply stays
 * `null` for an exercise that never used the mode it belongs to. The caller
 * decides which fields to show based on the exercise's mode.
 */
export function computeExerciseRecords(sessions: WorkoutSession[], exerciseId: string): ExerciseRecords {
  let maxWeight: DatedValue | null = null;
  let maxE1rm: (DatedValue & { reliable: boolean }) | null = null;
  let maxSetVolume: DatedValue | null = null;
  let maxReps: DatedValue | null = null;
  let maxDuration: DatedValue | null = null;
  let maxDistance: DatedValue | null = null;
  let bestPace: DatedValue | null = null;

  for (const { entry, date } of entriesForExercise(sessions, exerciseId)) {
    const weight = bestSetWeight(entry.sets);
    if (weight !== null && (!maxWeight || weight > maxWeight.value)) maxWeight = { value: weight, date };

    const best = bestSetEstimate(entry.sets);
    if (best && (!maxE1rm || best.e1rm > maxE1rm.value)) {
      maxE1rm = { value: best.e1rm, date, reliable: best.reliable };
    }

    const volume = bestSetVolume(entry);
    if (volume !== null && (!maxSetVolume || volume > maxSetVolume.value)) {
      maxSetVolume = { value: volume, date };
    }

    const reps = bestSetReps(entry.sets);
    if (reps !== null && (!maxReps || reps > maxReps.value)) maxReps = { value: reps, date };

    const duration = bestSetDuration(entry.sets);
    if (duration !== null && (!maxDuration || duration > maxDuration.value)) {
      maxDuration = { value: duration, date };
    }

    const distance = bestSetDistance(entry.sets);
    if (distance !== null && (!maxDistance || distance > maxDistance.value)) {
      maxDistance = { value: distance, date };
    }

    const pace = bestPaceSecPerKm(entry.sets);
    if (pace !== null && (!bestPace || pace < bestPace.value)) bestPace = { value: pace, date };
  }

  return { maxWeight, maxE1rm, maxSetVolume, maxReps, maxDuration, maxDistance, bestPace };
}

/**
 * Which of `session`'s records for `exerciseId` beat every *prior* session —
 * meant to run right after saving, comparing the just-saved session against
 * the account's history without it (pass `sessions` excluding this one).
 *
 * A first-ever log of an exercise is deliberately never a "record": there is
 * nothing yet to have beaten, so `prior.maxX` must already exist for that
 * kind to count.
 */
export type RecordKind = 'weight' | 'e1rm' | 'setVolume' | 'reps' | 'duration' | 'distance' | 'pace';

/**
 * Every field on `ExerciseRecords` is computed unconditionally (see
 * `computeExerciseRecords`'s own note on why), so a plain `reps_weight` set
 * genuinely does set a `maxReps` record every time it logs more reps than
 * before — that fact is real, it just is not what a lifter means by "record"
 * for a barbell exercise. This table is how a caller narrows "every kind
 * that changed" down to "the kinds this exercise's mode actually cares
 * about", for the PR banner and the stats page alike.
 */
export const RECORD_KINDS_BY_TRACKING: Record<TrackingMode, readonly RecordKind[]> = {
  reps_weight: ['weight', 'e1rm', 'setVolume'],
  reps: ['reps'],
  time: ['duration'],
  time_weight: ['weight', 'duration'],
  distance_time: ['distance', 'pace'],
};

export interface NewRecords {
  weight: boolean;
  e1rm: boolean;
  setVolume: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
  pace: boolean;
}

/** `NewRecords` as a list of the kinds that hit, for callers that want to iterate rather than field-check. */
export function newRecordKinds(records: NewRecords): RecordKind[] {
  return (['weight', 'e1rm', 'setVolume', 'reps', 'duration', 'distance', 'pace'] as const).filter(
    (kind) => records[kind]
  );
}

/**
 * A PR banner's-worth of information for one exercise in a just-saved
 * session — the shape `Workout.tsx` hands to `History.tsx` via router state.
 */
export interface NewPR {
  exerciseId: string;
  exerciseName: string;
  kinds: RecordKind[];
}

export function findNewRecords(
  priorSessions: WorkoutSession[],
  session: WorkoutSession,
  exerciseId: string
): NewRecords {
  const prior = computeExerciseRecords(priorSessions, exerciseId);
  const inSession = computeExerciseRecords([session], exerciseId);

  return {
    weight: !!prior.maxWeight && !!inSession.maxWeight && inSession.maxWeight.value > prior.maxWeight.value,
    e1rm: !!prior.maxE1rm && !!inSession.maxE1rm && inSession.maxE1rm.value > prior.maxE1rm.value,
    setVolume:
      !!prior.maxSetVolume &&
      !!inSession.maxSetVolume &&
      inSession.maxSetVolume.value > prior.maxSetVolume.value,
    reps: !!prior.maxReps && !!inSession.maxReps && inSession.maxReps.value > prior.maxReps.value,
    duration:
      !!prior.maxDuration && !!inSession.maxDuration && inSession.maxDuration.value > prior.maxDuration.value,
    distance:
      !!prior.maxDistance && !!inSession.maxDistance && inSession.maxDistance.value > prior.maxDistance.value,
    // Lower is faster: a new pace record is a smaller number, not a bigger one.
    pace: !!prior.bestPace && !!inSession.bestPace && inSession.bestPace.value < prior.bestPace.value,
  };
}
