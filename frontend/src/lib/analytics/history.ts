import type { WorkoutSession } from '../types';
import { bestSetEstimate } from './oneRepMax';
import { entryVolume } from './volume';

export interface ExerciseHistoryPoint {
  date: number;
  /** Total working+drop-set volume for this exercise in this session. */
  volume: number;
  /** Best estimated 1RM this session, or `null` if no set qualified (e.g. only warm-ups logged). */
  e1rm: number | null;
  e1rmReliable: boolean;
}

/**
 * One point per session that logs `exerciseId`, oldest first — the series a
 * chart draws. Multiple entries of the same exercise within one session
 * (rare, but the model allows it) are merged into a single point: volumes
 * add, the higher e1RM wins.
 */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExerciseHistoryPoint[] {
  const ordered = [...sessions].sort((a, b) => (a.startedAt ?? a.date) - (b.startedAt ?? b.date));
  const points: ExerciseHistoryPoint[] = [];

  for (const session of ordered) {
    const matching = session.entries.filter((e) => e.exerciseId === exerciseId);
    if (matching.length === 0) continue;

    let volume = 0;
    let best: ReturnType<typeof bestSetEstimate> = null;
    for (const entry of matching) {
      volume += entryVolume(entry);
      const candidate = bestSetEstimate(entry.sets);
      if (candidate && (!best || candidate.e1rm > best.e1rm)) best = candidate;
    }

    points.push({
      date: session.startedAt ?? session.date,
      volume,
      e1rm: best ? best.e1rm : null,
      e1rmReliable: best ? best.reliable : true,
    });
  }

  return points;
}
