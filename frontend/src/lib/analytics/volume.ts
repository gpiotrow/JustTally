import { setType, isSetDone, type WorkoutEntry, type WorkoutSet } from '../types';

/** Reps × weight for one set; a set with no logged weight contributes nothing. */
function setVolume(set: WorkoutSet): number {
  return set.weight ? set.reps * set.weight : 0;
}

/**
 * Σ (reps × weight) over the working and drop sets of one entry — warm-ups
 * never count toward load volume (§ 2.1), and a set that wasn't done wasn't lifted.
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
