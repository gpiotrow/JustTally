import { setType, isSetDone, type WorkoutSet } from '../types';

/** Epley formula: `w × (1 + r/30)` — the most common estimator, and the one this app uses. */
export function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/**
 * Above this rep count Epley's error grows fast enough that the number stops
 * being a usable estimate. Shown with a caveat above this line, never as a
 * plain figure — the app must not pretend a guess is a measurement.
 */
export const E1RM_RELIABLE_MAX_REPS = 12;

export function isE1rmReliable(reps: number): boolean {
  return reps <= E1RM_RELIABLE_MAX_REPS;
}

/**
 * Sets that count toward any estimate or record: actually performed, not a
 * warm-up (§ 2.1 — warm-ups must stay out of 1RM estimates), carrying a
 * logged weight, and carrying real reps. A bodyweight-only set (no weight
 * typed) has nothing for the formula to work with — and neither does a
 * `time_weight` set, which always logs `reps: 0` (§ tracking modes): the
 * Epley formula is meaningless at zero reps, so without this a held weight
 * would silently estimate an e1RM equal to just the weight itself.
 */
export function countableSets(sets: WorkoutSet[]): (WorkoutSet & { weight: number })[] {
  return sets.filter(
    (s): s is WorkoutSet & { weight: number } =>
      isSetDone(s) && setType(s) !== 'warmup' && s.weight !== undefined && s.weight > 0 && s.reps > 0
  );
}

export interface BestSetEstimate {
  weight: number;
  reps: number;
  e1rm: number;
  reliable: boolean;
}

/** The set with the highest estimated 1RM among a list, or `null` if none qualify. */
export function bestSetEstimate(sets: WorkoutSet[]): BestSetEstimate | null {
  let best: BestSetEstimate | null = null;
  for (const set of countableSets(sets)) {
    const e1rm = epley1RM(set.weight, set.reps);
    if (!best || e1rm > best.e1rm) {
      best = { weight: set.weight, reps: set.reps, e1rm, reliable: isE1rmReliable(set.reps) };
    }
  }
  return best;
}
