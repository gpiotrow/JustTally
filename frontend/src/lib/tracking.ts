/**
 * The fixed tracking-mode taxonomy. Determines which fields a set of this
 * exercise records — most exercises log reps and weight, but a plank logs
 * only duration and a run logs distance and duration.
 *
 * These codes are stored on `Exercise.tracking` (the catalog default) and
 * denormalized onto `WorkoutEntry.tracking` at logging time (§ types.ts),
 * validated against this list on the server the same way `equipment`/`goals`
 * are.
 */
export const TRACKING_MODES = [
  'reps_weight',
  'reps',
  'time',
  'time_weight',
  'distance_time',
] as const;

export type TrackingMode = (typeof TRACKING_MODES)[number];

const TRACKING_MODE_SET: ReadonlySet<string> = new Set(TRACKING_MODES);

export function isTrackingMode(value: unknown): value is TrackingMode {
  return typeof value === 'string' && TRACKING_MODE_SET.has(value);
}

/** One of the four measurable quantities a tracking mode can be built from. */
export type TrackingField = 'reps' | 'weight' | 'duration' | 'distance';

/**
 * Which fields a tracking mode's set rows show, in display order — shared by
 * the workout set-row layout (`Workout.tsx`) and the routine target editors
 * (`PlanDetailPanel.tsx`, `Routines.tsx`), so a mode means the same fields
 * wherever it is edited.
 */
export const TRACKING_FIELDS: Record<TrackingMode, readonly TrackingField[]> = {
  reps_weight: ['reps', 'weight'],
  reps: ['reps'],
  time: ['duration'],
  time_weight: ['duration', 'weight'],
  distance_time: ['distance', 'duration'],
};
