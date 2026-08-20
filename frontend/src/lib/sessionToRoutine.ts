import {
  entryTracking,
  setType,
  type Routine,
  type RoutineDay,
  type RoutineExercise,
  type WorkoutEntry,
  type WorkoutSession,
  type WorkoutSet,
} from './types';
import type { TrackingMode } from './tracking';

/**
 * Turning a logged workout into a routine day — the inverse of
 * `routineInstantiate.ts`'s "Routine → Training". Reused nowhere else the
 * way `routineInstantiate` is (there is only one entry point, "Als Routine"
 * in the history), but kept pure and separate from it anyway: it is its own
 * set of rules about which sets count and which target to derive from them,
 * not markup, so it is tested the same way.
 *
 * The result is a starting point, not a finished plan — the caller opens it
 * in the routine editor rather than saving it outright, so every field here
 * stays freely editable before anything is written.
 */

const MISSING = -Infinity;

/** The set with the largest value for a numeric field, ignoring sets where it's unset. Ties keep the first. */
function maxByField(sets: readonly WorkoutSet[], field: 'weight' | 'durationSec' | 'distanceM'): WorkoutSet | undefined {
  let best: WorkoutSet | undefined;
  let bestValue = MISSING;
  for (const set of sets) {
    const value = set[field];
    if (value == null || value <= bestValue) continue;
    best = set;
    bestValue = value;
  }
  return best;
}

/**
 * "10" when every working set used the same rep count, "8-12" across a range
 * — the same shorthand real plans use, and what `RoutineExercise.targetReps`
 * is documented to hold (`lib/types.ts`).
 */
function repRangeText(reps: readonly number[]): string | undefined {
  if (reps.length === 0) return undefined;
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  return min === max ? String(min) : `${min}-${max}`;
}

/**
 * Target fields for one exercise's working sets, chosen by the tracking mode
 * *frozen on the entry* — never the catalog exercise's current mode, so an
 * old entry logged under a mode the exercise no longer uses isn't reinterpreted.
 */
function targetsFor(
  mode: TrackingMode,
  sets: readonly WorkoutSet[]
): Pick<RoutineExercise, 'targetReps' | 'targetWeight' | 'targetDurationSec' | 'targetDistanceM'> {
  switch (mode) {
    case 'reps':
      return { targetReps: repRangeText(sets.map((s) => s.reps)) };
    case 'reps_weight':
      return {
        targetReps: repRangeText(sets.map((s) => s.reps)),
        targetWeight: maxByField(sets, 'weight')?.weight,
      };
    case 'time': {
      const longest = maxByField(sets, 'durationSec');
      return { targetDurationSec: longest?.durationSec };
    }
    case 'time_weight': {
      const longest = maxByField(sets, 'durationSec');
      return { targetDurationSec: longest?.durationSec, targetWeight: longest?.weight };
    }
    case 'distance_time': {
      const farthest = maxByField(sets, 'distanceM');
      return { targetDistanceM: farthest?.distanceM, targetDurationSec: farthest?.durationSec };
    }
  }
}

/**
 * One entry → one routine exercise, or `null` when there is nothing to base
 * a target on. Warm-up sets are excluded before anything else — the same
 * rule `History.tsx` uses for its set count — so a warm-up-only entry (or one
 * with no sets at all) contributes no exercise rather than a target of zero.
 * Drop sets count as work and stay in.
 */
function entryToRoutineExercise(entry: WorkoutEntry): RoutineExercise | null {
  const workingSets = entry.sets.filter((set) => setType(set) !== 'warmup');
  if (workingSets.length === 0) return null;

  return {
    exerciseId: entry.exerciseId,
    exerciseRef: entry.exerciseRef,
    exerciseName: entry.exerciseName,
    // A fresh vote on alternatives, not carried over: the picker for
    // alternatives means something different in a template than a "what did
    // I actually do" record, and this session has no alternatives of its own.
    alternatives: [],
    targetSets: Math.max(1, workingSets.length),
    // Supersets already grouped in the workout stay grouped in the template.
    groupId: entry.groupId,
    ...targetsFor(entryTracking(entry), workingSets),
  };
}

/** One session, as a routine day. Entries with nothing but warm-ups drop out entirely. */
export function routineDayFromSession(session: WorkoutSession): RoutineDay {
  return {
    id: crypto.randomUUID(),
    name: session.title?.trim() ?? '',
    exercises: session.entries
      .map(entryToRoutineExercise)
      .filter((ex): ex is RoutineExercise => ex !== null),
  };
}

/** A whole new routine — one week, one day — seeded from a logged session. */
export function routineFromSession(session: WorkoutSession, name: string): Routine {
  return {
    id: crypto.randomUUID(),
    name,
    weeks: [{ id: crypto.randomUUID(), days: [routineDayFromSession(session)] }],
    updatedAt: Date.now(),
  };
}
