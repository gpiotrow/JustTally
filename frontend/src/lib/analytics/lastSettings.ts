import type { WorkoutSession } from '../types';

export interface LastSettingsOptions {
  /**
   * The session currently being edited. Its own entries are not history yet —
   * same exclusion `exerciseRecency` uses, for the same reason: comparing a
   * workout against itself would offer today's own values back as "last time".
   */
  excludeSessionId?: string;
}

/**
 * The machine-setting values logged the last time this exercise was trained,
 * or `undefined` if it never has been (or that most recent entry carried
 * none). Shown as the placeholder in the workout's settings row — the values
 * to beat are where the eyes already are, without pre-filling anything that
 * could be saved unread.
 *
 * "Last time" is the newest entry by session date; a strictly-newer-wins
 * comparison, same as `exerciseRecency`, so a second entry for this exercise
 * within the same session leaves the first one's values in place.
 */
export function lastSettingsFor(
  sessions: WorkoutSession[],
  exerciseId: string,
  options: LastSettingsOptions = {}
): Record<string, string> | undefined {
  let bestAt = -Infinity;
  let bestSettings: Record<string, string> | undefined;

  for (const session of sessions) {
    if (options.excludeSessionId !== undefined && session.id === options.excludeSessionId) continue;
    const date = session.startedAt ?? session.date;
    for (const entry of session.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      if (date > bestAt) {
        bestAt = date;
        bestSettings = entry.settings;
      }
    }
  }

  return bestSettings;
}
