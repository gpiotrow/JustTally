import { describe, it, expect } from 'vitest';
import {
  addExerciseToDay,
  addAlternativeToSlot,
  removeExerciseFromDay,
  removeAlternativeFromSlot,
  updateSlot,
  renameDay,
  removeDay,
  moveSlot,
} from './planGrid';
import type { RoutineDay, RoutineExercise } from './types';

const ex = (id: string): RoutineExercise => ({
  exerciseId: id,
  exerciseName: id,
  alternatives: [],
  targetSets: 3,
});

const days = (): RoutineDay[] => [
  { id: 'd1', name: 'Day 1', exercises: [ex('a'), ex('b'), ex('c')] },
  { id: 'd2', name: 'Day 2', exercises: [ex('x'), ex('y')] },
];

describe('addExerciseToDay', () => {
  it('appends to the named day and leaves others untouched', () => {
    const result = addExerciseToDay(days(), 'd1', ex('new'));
    expect(result[0].exercises.map((e) => e.exerciseId)).toEqual(['a', 'b', 'c', 'new']);
    expect(result[1].exercises).toHaveLength(2);
  });
});

describe('addAlternativeToSlot', () => {
  it('adds an alternative to the targeted exercise', () => {
    const result = addAlternativeToSlot(days(), 'd1', 1, { exerciseId: 'alt1', exerciseName: 'Alt' });
    expect(result[0].exercises[1].alternatives).toEqual([{ exerciseId: 'alt1', exerciseName: 'Alt' }]);
  });

  it('does not add itself as its own alternative', () => {
    const result = addAlternativeToSlot(days(), 'd1', 1, { exerciseId: 'b', exerciseName: 'b' });
    expect(result[0].exercises[1].alternatives).toEqual([]);
  });

  it('does not add a duplicate alternative', () => {
    const withAlt = addAlternativeToSlot(days(), 'd1', 1, { exerciseId: 'alt1', exerciseName: 'Alt' });
    const again = addAlternativeToSlot(withAlt, 'd1', 1, { exerciseId: 'alt1', exerciseName: 'Alt' });
    expect(again[0].exercises[1].alternatives).toHaveLength(1);
  });
});

describe('removeExerciseFromDay', () => {
  it('removes only the targeted exercise', () => {
    const result = removeExerciseFromDay(days(), 'd1', 1);
    expect(result[0].exercises.map((e) => e.exerciseId)).toEqual(['a', 'c']);
  });
});

describe('removeAlternativeFromSlot', () => {
  it('removes only the targeted alternative', () => {
    const withAlts = addAlternativeToSlot(
      addAlternativeToSlot(days(), 'd1', 0, { exerciseId: 'alt1', exerciseName: 'Alt1' }),
      'd1',
      0,
      { exerciseId: 'alt2', exerciseName: 'Alt2' }
    );
    const result = removeAlternativeFromSlot(withAlts, 'd1', 0, 0);
    expect(result[0].exercises[0].alternatives).toEqual([{ exerciseId: 'alt2', exerciseName: 'Alt2' }]);
  });
});

describe('updateSlot', () => {
  it('patches only the targeted exercise', () => {
    const result = updateSlot(days(), 'd1', 2, { targetSets: 5, targetReps: '5-8' });
    expect(result[0].exercises[2]).toMatchObject({ targetSets: 5, targetReps: '5-8' });
    expect(result[0].exercises[0].targetSets).toBe(3);
  });
});

describe('renameDay / removeDay', () => {
  it('renames only the targeted day', () => {
    const result = renameDay(days(), 'd2', 'Renamed');
    expect(result[1].name).toBe('Renamed');
    expect(result[0].name).toBe('Day 1');
  });

  it('removes only the targeted day', () => {
    const result = removeDay(days(), 'd1');
    expect(result.map((d) => d.id)).toEqual(['d2']);
  });
});

describe('moveSlot', () => {
  it('reorders forward within the same day', () => {
    // Move 'a' (index 0) to before what is currently index 2 ('c').
    const result = moveSlot(days(), 'd1', 0, 'd1', 2);
    expect(result[0].exercises.map((e) => e.exerciseId)).toEqual(['b', 'a', 'c']);
  });

  it('reorders backward within the same day', () => {
    // Move 'c' (index 2) to before what is currently index 0 ('a').
    const result = moveSlot(days(), 'd1', 2, 'd1', 0);
    expect(result[0].exercises.map((e) => e.exerciseId)).toEqual(['c', 'a', 'b']);
  });

  it('moves to the end of the same day when toIndex is null', () => {
    const result = moveSlot(days(), 'd1', 0, 'd1', null);
    expect(result[0].exercises.map((e) => e.exerciseId)).toEqual(['b', 'c', 'a']);
  });

  it('is a no-op moving a slot onto its own position', () => {
    const result = moveSlot(days(), 'd1', 1, 'd1', 1);
    expect(result[0].exercises.map((e) => e.exerciseId)).toEqual(['a', 'b', 'c']);
  });

  it('moves across days to a specific index', () => {
    const result = moveSlot(days(), 'd1', 1, 'd2', 0);
    expect(result[0].exercises.map((e) => e.exerciseId)).toEqual(['a', 'c']);
    expect(result[1].exercises.map((e) => e.exerciseId)).toEqual(['b', 'x', 'y']);
  });

  it('appends across days when toIndex is null', () => {
    const result = moveSlot(days(), 'd1', 1, 'd2', null);
    expect(result[1].exercises.map((e) => e.exerciseId)).toEqual(['x', 'y', 'b']);
  });

  it('leaves days unchanged when the source slot does not exist', () => {
    const original = days();
    const result = moveSlot(original, 'd1', 99, 'd2', 0);
    expect(result).toBe(original);
  });
});
