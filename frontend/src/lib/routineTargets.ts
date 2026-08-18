import type { RoutineExercise } from './types';
import type { TrackingMode } from './tracking';
import { formatDistanceWithUnit } from './units';
import { formatDuration } from './restTimer';

/**
 * A routine exercise's own target, formatted for the mode it belongs to —
 * shared by the desktop week grid (`PlanWeekGrid.tsx`) and the mobile editor
 * (`Routines.tsx`), so a slot reads the same target regardless of which
 * editor last touched it. `'–'` when the mode-appropriate field was never
 * set, the same "nothing to show" convention `ExerciseStats.tsx` uses.
 */
export function targetSummary(exercise: RoutineExercise, mode: TrackingMode): string {
  switch (mode) {
    case 'time':
    case 'time_weight':
      return exercise.targetDurationSec != null ? formatDuration(exercise.targetDurationSec) : '–';
    case 'distance_time': {
      const distance =
        exercise.targetDistanceM != null ? formatDistanceWithUnit(exercise.targetDistanceM) : null;
      const duration =
        exercise.targetDurationSec != null ? formatDuration(exercise.targetDurationSec) : null;
      if (distance && duration) return `${distance} · ${duration}`;
      return distance ?? duration ?? '–';
    }
    case 'reps':
    case 'reps_weight':
    default:
      return exercise.targetReps ?? '–';
  }
}
