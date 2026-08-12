import type { WorkoutSession } from '../types';
import { bestSetEstimate } from './oneRepMax';
import { bestSetVolume } from './volume';

export interface DatedValue {
  value: number;
  date: number;
}

export interface ExerciseRecords {
  /** Heaviest single set logged, with the date it happened. */
  maxWeight: DatedValue | null;
  /** Highest estimated 1RM logged; `reliable` mirrors the set it came from. */
  maxE1rm: (DatedValue & { reliable: boolean }) | null;
  /** Heaviest single *set's* volume (reps × weight), not a session total. */
  maxSetVolume: DatedValue | null;
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
 * Best weight, best estimated 1RM, and best single-set volume for one
 * exercise across every session that logs it. Each record keeps the date it
 * happened on, independently — the heaviest weight and the best e1RM do not
 * have to come from the same set, let alone the same session.
 */
export function computeExerciseRecords(sessions: WorkoutSession[], exerciseId: string): ExerciseRecords {
  let maxWeight: DatedValue | null = null;
  let maxE1rm: (DatedValue & { reliable: boolean }) | null = null;
  let maxSetVolume: DatedValue | null = null;

  for (const { entry, date } of entriesForExercise(sessions, exerciseId)) {
    const best = bestSetEstimate(entry.sets);
    if (best) {
      if (!maxWeight || best.weight > maxWeight.value) maxWeight = { value: best.weight, date };
      if (!maxE1rm || best.e1rm > maxE1rm.value) {
        maxE1rm = { value: best.e1rm, date, reliable: best.reliable };
      }
    }
    const volume = bestSetVolume(entry);
    if (volume !== null && (!maxSetVolume || volume > maxSetVolume.value)) {
      maxSetVolume = { value: volume, date };
    }
  }

  return { maxWeight, maxE1rm, maxSetVolume };
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
export type RecordKind = 'weight' | 'e1rm' | 'setVolume';

export interface NewRecords {
  weight: boolean;
  e1rm: boolean;
  setVolume: boolean;
}

/** `NewRecords` as a list of the kinds that hit, for callers that want to iterate rather than field-check. */
export function newRecordKinds(records: NewRecords): RecordKind[] {
  return (['weight', 'e1rm', 'setVolume'] as const).filter((kind) => records[kind]);
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
  };
}
