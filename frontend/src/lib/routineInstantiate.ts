import type { Routine, RoutineAlternative } from './types';

/**
 * What "Training starten" needs to seed a new workout entry — not a
 * `WorkoutEntry` itself, because a routine exercise has no logged sets yet,
 * only a target count. Turning `setCount` into actual blank rows is the
 * editor's job (`Workout.tsx` already knows how to add a blank set); this
 * stays pure and free of that shape.
 */
export interface RoutineInstantiationEntry {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
  /** Superset grouping already baked into the plan, carried onto the session. */
  groupId?: string;
  /** Always the routine exercise's own id — a swap to an alternative changes `exerciseId`, never this. */
  plannedExerciseId: string;
  /** Plan B, Plan C for the swipe/tap swap gesture. */
  alternatives: RoutineAlternative[];
  setCount: number;
  targetReps?: string;
  targetWeight?: number;
  targetDurationSec?: number;
  targetDistanceM?: number;
  targetRpe?: number;
  restSeconds?: number;
}

export interface RoutineInstantiation {
  routineId: string;
  weekIndex: number;
  dayId: string;
  /** The day's name, offered as the new session's title. */
  title: string;
  entries: RoutineInstantiationEntry[];
}

/**
 * Resolve one day of a routine into what a new workout session should start
 * with. `null` when the week or day no longer exists — a routine edited or
 * shortened on another device between the link being shown and being tapped.
 */
export function instantiateRoutineDay(
  routine: Routine,
  weekIndex: number,
  dayId: string
): RoutineInstantiation | null {
  const week = routine.weeks[weekIndex];
  if (!week) return null;
  const day = week.days.find((d) => d.id === dayId);
  if (!day) return null;

  return {
    routineId: routine.id,
    weekIndex,
    dayId: day.id,
    title: day.name,
    entries: day.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      exerciseRef: ex.exerciseRef,
      exerciseName: ex.exerciseName,
      groupId: ex.groupId,
      plannedExerciseId: ex.exerciseId,
      alternatives: ex.alternatives,
      // A plan with a nonsensical target still starts one blank set rather
      // than none — an empty exercise card would look like a bug, not a plan.
      setCount: Math.max(ex.targetSets, 1),
      targetReps: ex.targetReps,
      targetWeight: ex.targetWeight,
      targetDurationSec: ex.targetDurationSec,
      targetDistanceM: ex.targetDistanceM,
      targetRpe: ex.targetRpe,
      restSeconds: ex.restSeconds,
    })),
  };
}
