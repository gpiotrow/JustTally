import { setType, isSetDone, type WorkoutSession } from './types';
import { MUSCLE_GROUPS, RECOVERY_WINDOW_HOURS, type MuscleGroup } from './muscles';

/**
 * How much of an exercise's volume is charged to a muscle depending on how
 * it is listed on that exercise. A secondary mover does real work, just less
 * of it — 0.5 is a convention, not a measurement.
 */
const PRIMARY_WEIGHT = 1.0;
const SECONDARY_WEIGHT = 0.5;

const HOUR_MS = 3_600_000;

/** The muscle lists an exercise carries; both default to empty for unmaintained rows. */
export interface ExerciseMuscles {
  musclesPrimary?: string[];
  musclesSecondary?: string[];
}

export interface MuscleLoad {
  /** 0 (fully recovered) … 1 (most recently and heavily loaded of all groups). */
  value: number;
  /** Decay-weighted volume in kg — the raw figure behind `value`. */
  weightedVolume: number;
  /** When this muscle was last trained at all, or `null` if never. */
  lastTrainedAt: number | null;
}

export type RecoveryMap = Record<MuscleGroup, MuscleLoad>;

/** Volume of one entry: Σ reps × weight over done, non-warm-up sets (same rule as § 10). */
function entryVolume(sets: WorkoutSession['entries'][number]['sets']): number {
  return sets
    .filter((s) => isSetDone(s) && setType(s) !== 'warmup')
    .reduce((sum, s) => sum + (s.weight ? s.reps * s.weight : 0), 0);
}

/**
 * Linear decay from 1 at the moment of training to 0 at the end of that
 * muscle's recovery window. Linear rather than exponential on purpose: an
 * exponential tail never quite reaches zero, so a muscle trained a month ago
 * would still register a sliver of load — which reads as noise on a heatmap
 * whose whole job is "what is ready today".
 */
export function decayFactor(ageMs: number, windowHours: number): number {
  if (ageMs < 0) return 1; // a session dated in the future: treat as just now
  const windowMs = windowHours * HOUR_MS;
  if (ageMs >= windowMs) return 0;
  return 1 - ageMs / windowMs;
}

function emptyMap(): RecoveryMap {
  return Object.fromEntries(
    MUSCLE_GROUPS.map((m) => [m, { value: 0, weightedVolume: 0, lastTrainedAt: null }])
  ) as RecoveryMap;
}

/**
 * Per-muscle load from recent training, as a 0…1 figure per group.
 *
 * This is **volume bookkeeping, not physiology** (§ 11.4): it adds up the
 * decayed working-set volume charged to each muscle and normalises against
 * the busiest group. A muscle only ever appears here if some exercise the
 * user actually logged lists it — an unmaintained catalog produces an empty
 * map, which is the honest answer rather than a guessed one.
 *
 * @param musclesByExerciseId Muscle lists per exercise id; exercises absent
 *   from the map (or with empty lists) contribute nothing.
 * @param now Reference time; injected so the decay is testable.
 */
export function computeRecovery(
  sessions: WorkoutSession[],
  musclesByExerciseId: Map<string, ExerciseMuscles>,
  now: number = Date.now()
): RecoveryMap {
  const map = emptyMap();

  for (const session of sessions) {
    const date = session.startedAt ?? session.date;
    const ageMs = now - date;

    for (const entry of session.entries) {
      const muscles = musclesByExerciseId.get(entry.exerciseId);
      if (!muscles) continue;

      const volume = entryVolume(entry.sets);
      if (volume <= 0) continue;

      const charged: [string[], number][] = [
        [muscles.musclesPrimary ?? [], PRIMARY_WEIGHT],
        [muscles.musclesSecondary ?? [], SECONDARY_WEIGHT],
      ];

      for (const [groups, share] of charged) {
        for (const group of groups) {
          if (!(group in map)) continue; // unknown code: ignore rather than crash
          const muscle = group as MuscleGroup;
          const decay = decayFactor(ageMs, RECOVERY_WINDOW_HOURS[muscle]);
          // Outside the window the volume no longer counts — but the session
          // still happened, so it can still be the answer to "last trained".
          map[muscle].weightedVolume += volume * share * decay;
          if (map[muscle].lastTrainedAt === null || date > map[muscle].lastTrainedAt!) {
            map[muscle].lastTrainedAt = date;
          }
        }
      }
    }
  }

  // Normalised against the busiest group rather than an absolute kg figure:
  // "hard for you, lately" is the only scale that means anything across
  // people who train at wildly different loads.
  const peak = Math.max(...MUSCLE_GROUPS.map((m) => map[m].weightedVolume));
  if (peak > 0) {
    for (const m of MUSCLE_GROUPS) map[m].value = map[m].weightedVolume / peak;
  }

  return map;
}
