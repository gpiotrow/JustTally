import { setType, isSetDone, type WorkoutEntry, type WorkoutSet } from '../types';
import type { TrackingMode } from '../tracking';

/** Reps × weight for one set; a set with no logged weight contributes nothing. */
function setVolume(set: WorkoutSet): number {
  return set.weight ? set.reps * set.weight : 0;
}

/**
 * Σ (reps × weight) over the working and drop sets of one entry — warm-ups
 * never count toward load volume (§ 2.1), and a set that wasn't done wasn't lifted.
 *
 * Kept strictly to this meaning even outside `reps_weight`: a `time_weight`
 * set always logs `reps: 0` (§ tracking modes), so it naturally contributes
 * nothing here — `entryWorkload` below is the mode-general figure.
 */
export function entryVolume(entry: Pick<WorkoutEntry, 'sets'>): number {
  return entry.sets
    .filter((s) => isSetDone(s) && setType(s) !== 'warmup')
    .reduce((sum, s) => sum + setVolume(s), 0);
}

/** The heaviest single set's volume within an entry, or `null` if none qualify. */
export function bestSetVolume(entry: Pick<WorkoutEntry, 'sets'>): number | null {
  const countable = entry.sets.filter((s) => isSetDone(s) && setType(s) !== 'warmup');
  if (countable.length === 0) return null;
  const volumes = countable.map(setVolume);
  const max = Math.max(...volumes);
  return max > 0 ? max : null;
}

/** Done, non-warm-up sets — the "actually happened" filter shared by every aggregate below. */
function countableWorkingSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.filter((s) => isSetDone(s) && setType(s) !== 'warmup');
}

export type WorkloadKind = 'load' | 'reps' | 'time' | 'distance';

export interface Workload {
  kind: WorkloadKind;
  value: number;
}

/**
 * The mode-appropriate "how much was done" figure for one entry — what
 * `entryVolume` means for `reps_weight` alone, generalised across every
 * tracking mode. `time_weight`'s own volume is time under load (Σ seconds ×
 * kg), not reps × kg — its sets log `reps: 0`, so `entryVolume` would read
 * as empty for them even though real work happened.
 */
export function entryWorkload(sets: WorkoutSet[], mode: TrackingMode): Workload {
  const countable = countableWorkingSets(sets);
  switch (mode) {
    case 'time_weight':
      return {
        kind: 'load',
        value: countable.reduce(
          (sum, s) => sum + (s.weight && s.durationSec ? s.durationSec * s.weight : 0),
          0
        ),
      };
    case 'reps':
      return { kind: 'reps', value: countable.reduce((sum, s) => sum + s.reps, 0) };
    case 'time':
      return { kind: 'time', value: countable.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) };
    case 'distance_time':
      return { kind: 'distance', value: countable.reduce((sum, s) => sum + (s.distanceM ?? 0), 0) };
    case 'reps_weight':
    default:
      return { kind: 'load', value: countable.reduce((sum, s) => sum + setVolume(s), 0) };
  }
}

/**
 * The heaviest logged weight among a set of sets, regardless of reps — a
 * `time_weight` set logs `reps: 0` but still carries a real weight (a
 * farmer's-walk hold, a weighted plank), so this must not require reps>0 the
 * way `oneRepMax.ts`'s `countableSets` does for its e1RM estimate.
 */
export function bestSetWeight(sets: WorkoutSet[]): number | null {
  const weights = countableWorkingSets(sets)
    .map((s) => s.weight)
    .filter((w): w is number => w !== undefined && w > 0);
  return weights.length > 0 ? Math.max(...weights) : null;
}

/** The most reps logged in a single set. */
export function bestSetReps(sets: WorkoutSet[]): number | null {
  const reps = countableWorkingSets(sets)
    .map((s) => s.reps)
    .filter((r) => r > 0);
  return reps.length > 0 ? Math.max(...reps) : null;
}

/** The longest single logged duration, in seconds. */
export function bestSetDuration(sets: WorkoutSet[]): number | null {
  const durations = countableWorkingSets(sets)
    .map((s) => s.durationSec)
    .filter((d): d is number => d !== undefined && d > 0);
  return durations.length > 0 ? Math.max(...durations) : null;
}

/** The longest single logged distance, in meters. */
export function bestSetDistance(sets: WorkoutSet[]): number | null {
  const distances = countableWorkingSets(sets)
    .map((s) => s.distanceM)
    .filter((d): d is number => d !== undefined && d > 0);
  return distances.length > 0 ? Math.max(...distances) : null;
}

/**
 * The best (lowest) pace among sets carrying both a duration and a distance,
 * in seconds per kilometer — lower is faster, so unlike every other "best"
 * figure here this one is a minimum, not a maximum.
 */
export function bestPaceSecPerKm(sets: WorkoutSet[]): number | null {
  const paces = countableWorkingSets(sets)
    .filter(
      (s): s is WorkoutSet & { durationSec: number; distanceM: number } =>
        s.durationSec !== undefined && s.durationSec > 0 && s.distanceM !== undefined && s.distanceM > 0
    )
    .map((s) => (s.durationSec / s.distanceM) * 1000);
  return paces.length > 0 ? Math.min(...paces) : null;
}
