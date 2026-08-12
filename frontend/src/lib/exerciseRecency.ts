import type { WorkoutSession, WorkoutSet } from './types';

/** What the history knows about one exercise. */
export interface ExerciseRecency {
  /** Start of the most recent session this exercise appears in (epoch ms). */
  lastUsedAt: number;
  /** How many sessions it appears in — twice in one session still counts once. */
  count: number;
  /** The sets logged for it in that most recent session. */
  lastSets: WorkoutSet[];
}

export interface RecencyOptions {
  /**
   * The session currently being edited. Its own entries are not history yet —
   * comparing a workout against itself would show today's numbers as "last
   * time" and count today's exercises as habits.
   */
  excludeSessionId?: string;
}

/**
 * Per-exercise history summary: when it was last trained, how often, and with
 * what.
 *
 * Generalises the `previousSets` memo in `Workout.tsx`, which resolved the same
 * "newest session wins" question but threw the timestamp and the count away —
 * the two things the exercise picker needs to answer "what do you actually
 * train?".
 *
 * Sessions may arrive in any order; the newest wins on merit, not on position.
 */
export function exerciseRecency(
  sessions: WorkoutSession[],
  options: RecencyOptions = {}
): Map<string, ExerciseRecency> {
  const byExercise = new Map<string, ExerciseRecency>();

  for (const session of sessions) {
    if (options.excludeSessionId !== undefined && session.id === options.excludeSessionId) continue;
    const date = session.startedAt ?? session.date;
    /** Exercises already counted for this session, so a repeat entry adds no count. */
    const countedHere = new Set<string>();

    for (const entry of session.entries) {
      const existing = byExercise.get(entry.exerciseId);
      const firstHere = !countedHere.has(entry.exerciseId);
      countedHere.add(entry.exerciseId);

      if (!existing) {
        byExercise.set(entry.exerciseId, { lastUsedAt: date, count: 1, lastSets: entry.sets });
        continue;
      }

      if (firstHere) existing.count += 1;
      // Only a strictly newer session replaces the sets, so a second entry in
      // the same session leaves the first one's numbers in place — the same
      // "first one wins within a session" rule `Workout.tsx` already used.
      if (date > existing.lastUsedAt) {
        existing.lastUsedAt = date;
        existing.lastSets = entry.sets;
      }
    }
  }

  return byExercise;
}
