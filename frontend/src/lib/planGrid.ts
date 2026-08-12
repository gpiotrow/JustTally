import type { RoutineAlternative, RoutineDay, RoutineExercise } from './types';

/**
 * Pure mutations over a week's days, shared by every drag-and-drop and
 * button-driven edit in the desktop planner (`pages/plan/Plan.tsx`). Kept
 * out of the component so the index arithmetic in `moveSlot` — the one part
 * of this that is easy to get subtly wrong — can be tested directly instead
 * of only through a simulated drag.
 */

export function addExerciseToDay(
  days: RoutineDay[],
  dayId: string,
  exercise: RoutineExercise
): RoutineDay[] {
  return days.map((d) => (d.id !== dayId ? d : { ...d, exercises: [...d.exercises, exercise] }));
}

/** No-op if `alternative` is already the slot's primary exercise or already offered. */
export function addAlternativeToSlot(
  days: RoutineDay[],
  dayId: string,
  index: number,
  alternative: RoutineAlternative
): RoutineDay[] {
  return days.map((d) => {
    if (d.id !== dayId) return d;
    return {
      ...d,
      exercises: d.exercises.map((ex, i) => {
        if (i !== index) return ex;
        const alreadyOffered =
          ex.exerciseId === alternative.exerciseId ||
          ex.alternatives.some((a) => a.exerciseId === alternative.exerciseId);
        if (alreadyOffered) return ex;
        return { ...ex, alternatives: [...ex.alternatives, alternative] };
      }),
    };
  });
}

export function removeExerciseFromDay(days: RoutineDay[], dayId: string, index: number): RoutineDay[] {
  return days.map((d) => (d.id !== dayId ? d : { ...d, exercises: d.exercises.filter((_, i) => i !== index) }));
}

export function removeAlternativeFromSlot(
  days: RoutineDay[],
  dayId: string,
  index: number,
  altIndex: number
): RoutineDay[] {
  return days.map((d) =>
    d.id !== dayId
      ? d
      : {
          ...d,
          exercises: d.exercises.map((ex, i) =>
            i !== index ? ex : { ...ex, alternatives: ex.alternatives.filter((_, ai) => ai !== altIndex) }
          ),
        }
  );
}

export function updateSlot(
  days: RoutineDay[],
  dayId: string,
  index: number,
  patch: Partial<RoutineExercise>
): RoutineDay[] {
  return days.map((d) =>
    d.id !== dayId
      ? d
      : { ...d, exercises: d.exercises.map((ex, i) => (i !== index ? ex : { ...ex, ...patch })) }
  );
}

export function renameDay(days: RoutineDay[], dayId: string, name: string): RoutineDay[] {
  return days.map((d) => (d.id !== dayId ? d : { ...d, name }));
}

export function removeDay(days: RoutineDay[], dayId: string): RoutineDay[] {
  return days.filter((d) => d.id !== dayId);
}

/**
 * Move the exercise at `fromDayId[fromIndex]` to `toDayId`, inserted before
 * `toIndex` — or appended, when `toIndex` is `null` (dropped on the day
 * itself rather than on a specific slot).
 *
 * Same-day moves need one extra correction: removing the source item first
 * shifts every later index down by one, so a `toIndex` that was computed
 * against the original array has to be adjusted before it is used as the
 * insertion point — otherwise dragging a card one slot down lands it two
 * slots down instead.
 */
export function moveSlot(
  days: RoutineDay[],
  fromDayId: string,
  fromIndex: number,
  toDayId: string,
  toIndex: number | null
): RoutineDay[] {
  const fromDay = days.find((d) => d.id === fromDayId);
  const moving = fromDay?.exercises[fromIndex];
  if (!moving) return days;

  if (fromDayId === toDayId) {
    const withoutMoving = fromDay!.exercises.filter((_, i) => i !== fromIndex);
    const insertAt =
      toIndex === null ? withoutMoving.length : toIndex > fromIndex ? toIndex - 1 : toIndex;
    const next = [...withoutMoving];
    next.splice(insertAt, 0, moving);
    return days.map((d) => (d.id !== fromDayId ? d : { ...d, exercises: next }));
  }

  return days.map((d) => {
    if (d.id === fromDayId) return { ...d, exercises: d.exercises.filter((_, i) => i !== fromIndex) };
    if (d.id === toDayId) {
      const next = [...d.exercises];
      next.splice(toIndex === null ? next.length : toIndex, 0, moving);
      return { ...d, exercises: next };
    }
    return d;
  });
}
