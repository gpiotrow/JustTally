import { isSetDone, setType, type WorkoutSession } from '../types';
import { bestSetEstimate } from './oneRepMax';
import { bestPaceSecPerKm, bestSetWeight, entryVolume } from './volume';

export interface ExerciseHistoryPoint {
  date: number;
  /** Total working+drop-set load volume (reps × kg) for this exercise in this session — `reps_weight` only, by construction (see `entryVolume`). */
  volume: number;
  /** Best estimated 1RM this session, or `null` if no set qualified (e.g. only warm-ups logged, or the mode never carries real reps). */
  e1rm: number | null;
  e1rmReliable: boolean;
  /** Σ reps across countable sets this session — meaningful for the `reps` mode. */
  totalReps: number;
  /** Σ logged seconds across countable sets this session — meaningful for `time` and `time_weight`. */
  totalDuration: number;
  /** Σ logged meters across countable sets this session — meaningful for `distance_time`. */
  totalDistance: number;
  /** This session's heaviest countable set, regardless of reps — meaningful for `time_weight`. */
  bestWeight: number | null;
  /** This session's best (lowest) pace in seconds per kilometer — meaningful for `distance_time`. */
  bestPace: number | null;
}

/**
 * One point per session that logs `exerciseId`, oldest first — the series a
 * chart draws. Multiple entries of the same exercise within one session
 * (rare, but the model allows it) are merged into a single point: sums add,
 * the better single-set figures win.
 *
 * Every field is computed unconditionally, the same reasoning
 * `computeExerciseRecords` uses: `totalReps`/`totalDuration`/`totalDistance`
 * simply read 0 (nothing to sum) outside the mode they belong to, since a
 * `reps_weight` set never carries a `durationSec`, a `time` set always logs
 * `reps: 0`, and so on. The caller picks which fields to chart based on the
 * exercise's own tracking mode.
 */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExerciseHistoryPoint[] {
  const ordered = [...sessions].sort((a, b) => (a.startedAt ?? a.date) - (b.startedAt ?? b.date));
  const points: ExerciseHistoryPoint[] = [];

  for (const session of ordered) {
    const matching = session.entries.filter((e) => e.exerciseId === exerciseId);
    if (matching.length === 0) continue;

    let volume = 0;
    let totalReps = 0;
    let totalDuration = 0;
    let totalDistance = 0;
    let best: ReturnType<typeof bestSetEstimate> = null;
    let bestWeight: number | null = null;
    let bestPace: number | null = null;

    for (const entry of matching) {
      volume += entryVolume(entry);
      const candidate = bestSetEstimate(entry.sets);
      if (candidate && (!best || candidate.e1rm > best.e1rm)) best = candidate;

      for (const set of entry.sets) {
        if (!isSetDone(set) || setType(set) === 'warmup') continue;
        totalReps += set.reps;
        totalDuration += set.durationSec ?? 0;
        totalDistance += set.distanceM ?? 0;
      }

      const weight = bestSetWeight(entry.sets);
      if (weight !== null && (bestWeight === null || weight > bestWeight)) bestWeight = weight;

      const pace = bestPaceSecPerKm(entry.sets);
      if (pace !== null && (bestPace === null || pace < bestPace)) bestPace = pace;
    }

    points.push({
      date: session.startedAt ?? session.date,
      volume,
      e1rm: best ? best.e1rm : null,
      e1rmReliable: best ? best.reliable : true,
      totalReps,
      totalDuration,
      totalDistance,
      bestWeight,
      bestPace,
    });
  }

  return points;
}
