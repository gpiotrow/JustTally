import type { RoutineWeek } from './types';

/** Avoids float artifacts like 61.499999999999995 from a plain percentage multiply. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Duplicate a week, bumping every target weight by `percent` — the
 * mechanical part of periodization ("all target weights +2.5%"), so an
 * 8-week block does not have to be built by hand eight times over.
 *
 * Fresh ids throughout (week and every day) so the duplicate is a genuinely
 * separate week from the start, not a shared reference that would edit the
 * original if touched. Exercises without a target weight are carried
 * through unchanged — there is nothing to bump.
 */
export function duplicateWeekWithBump(week: RoutineWeek, percent: number): RoutineWeek {
  const factor = 1 + percent / 100;
  return {
    ...week,
    id: crypto.randomUUID(),
    days: week.days.map((day) => ({
      ...day,
      id: crypto.randomUUID(),
      exercises: day.exercises.map((ex) => ({
        ...ex,
        ...(ex.targetWeight !== undefined ? { targetWeight: round2(ex.targetWeight * factor) } : {}),
      })),
    })),
  };
}
