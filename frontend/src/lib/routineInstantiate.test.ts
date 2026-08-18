import { describe, it, expect } from 'vitest';
import { instantiateRoutineDay } from './routineInstantiate';
import type { Routine } from './types';

const routine: Routine = {
  id: 'r1',
  name: 'Push/Pull',
  updatedAt: 1,
  weeks: [
    {
      id: 'w1',
      days: [
        {
          id: 'd1',
          name: 'Push A',
          exercises: [
            {
              exerciseId: 'ex-bench',
              exerciseRef: 1,
              exerciseName: 'Bench Press',
              alternatives: [{ exerciseId: 'ex-incline', exerciseName: 'Incline Press' }],
              targetSets: 3,
              targetReps: '8-12',
              targetWeight: 60,
              targetRpe: 8,
              restSeconds: 120,
              groupId: 'sg1',
            },
            {
              exerciseId: 'ex-fly',
              exerciseName: 'Dumbbell Fly',
              alternatives: [],
              targetSets: 2,
              groupId: 'sg1',
            },
          ],
        },
      ],
    },
    {
      id: 'w2',
      name: 'Deload',
      days: [{ id: 'd2', name: 'Push B', exercises: [] }],
    },
  ],
};

describe('instantiateRoutineDay', () => {
  it('resolves the requested week and day into entries', () => {
    const result = instantiateRoutineDay(routine, 0, 'd1');
    expect(result).not.toBeNull();
    expect(result!.routineId).toBe('r1');
    expect(result!.weekIndex).toBe(0);
    expect(result!.dayId).toBe('d1');
    expect(result!.title).toBe('Push A');
    expect(result!.entries).toHaveLength(2);
  });

  it('carries the routine exercise identity into plannedExerciseId', () => {
    const result = instantiateRoutineDay(routine, 0, 'd1')!;
    expect(result.entries[0].exerciseId).toBe('ex-bench');
    expect(result.entries[0].plannedExerciseId).toBe('ex-bench');
  });

  it('carries the routine exercise alternatives through for the swap gesture', () => {
    const result = instantiateRoutineDay(routine, 0, 'd1')!;
    expect(result.entries[0].alternatives).toEqual([
      { exerciseId: 'ex-incline', exerciseName: 'Incline Press' },
    ]);
    expect(result.entries[1].alternatives).toEqual([]);
  });

  it('carries targets and superset grouping through unchanged', () => {
    const [bench, fly] = instantiateRoutineDay(routine, 0, 'd1')!.entries;
    expect(bench).toMatchObject({
      setCount: 3,
      targetReps: '8-12',
      targetWeight: 60,
      targetRpe: 8,
      restSeconds: 120,
      groupId: 'sg1',
    });
    expect(fly).toMatchObject({ setCount: 2, groupId: 'sg1' });
  });

  it('carries target duration and distance through for time/distance-tracked exercises', () => {
    const timed: Routine = {
      id: 'r2',
      name: 'Conditioning',
      updatedAt: 1,
      weeks: [
        {
          id: 'w1',
          days: [
            {
              id: 'd1',
              name: 'Cardio',
              exercises: [
                {
                  exerciseId: 'ex-run',
                  exerciseName: '5k Run',
                  alternatives: [],
                  targetSets: 1,
                  targetDurationSec: 1500,
                  targetDistanceM: 5000,
                },
              ],
            },
          ],
        },
      ],
    };
    const [entry] = instantiateRoutineDay(timed, 0, 'd1')!.entries;
    expect(entry.targetDurationSec).toBe(1500);
    expect(entry.targetDistanceM).toBe(5000);
  });

  it('finds a day in a later week by its own index, not the day array position', () => {
    const result = instantiateRoutineDay(routine, 1, 'd2');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Push B');
    expect(result!.entries).toEqual([]);
  });

  it('returns null for a week index past the end', () => {
    expect(instantiateRoutineDay(routine, 5, 'd1')).toBeNull();
  });

  it('returns null for a day id that does not exist in that week', () => {
    expect(instantiateRoutineDay(routine, 0, 'not-a-day')).toBeNull();
  });

  it('floors an implausible target of zero sets to one blank set', () => {
    const zeroSetRoutine: Routine = {
      ...routine,
      weeks: [
        {
          id: 'w1',
          days: [
            {
              id: 'd1',
              name: 'Push A',
              exercises: [
                {
                  exerciseId: 'ex-bench',
                  exerciseName: 'Bench Press',
                  alternatives: [],
                  targetSets: 0,
                },
              ],
            },
          ],
        },
      ],
    };
    const result = instantiateRoutineDay(zeroSetRoutine, 0, 'd1')!;
    expect(result.entries[0].setCount).toBe(1);
  });
});
