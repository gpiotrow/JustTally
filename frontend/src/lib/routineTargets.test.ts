import { describe, it, expect } from 'vitest';
import { targetSummary } from './routineTargets';
import type { RoutineExercise } from './types';

const baseExercise: RoutineExercise = {
  exerciseId: 'ex-1',
  exerciseName: 'Bench Press',
  alternatives: [],
  targetSets: 3,
};

describe('targetSummary', () => {
  it('reps_weight: shows the target reps text', () => {
    expect(targetSummary({ ...baseExercise, targetReps: '8-12' }, 'reps_weight')).toBe('8-12');
  });

  it('reps: shows the target reps text, same as reps_weight', () => {
    expect(targetSummary({ ...baseExercise, targetReps: 'AMRAP' }, 'reps')).toBe('AMRAP');
  });

  it('reps_weight: falls back to a dash when no target reps were set', () => {
    expect(targetSummary(baseExercise, 'reps_weight')).toBe('–');
  });

  it('time: shows the target duration formatted as m:ss', () => {
    expect(targetSummary({ ...baseExercise, targetDurationSec: 90 }, 'time')).toBe('1:30');
  });

  it('time_weight: shows the target duration too, not weight', () => {
    expect(
      targetSummary({ ...baseExercise, targetDurationSec: 45, targetWeight: 20 }, 'time_weight')
    ).toBe('0:45');
  });

  it('time: falls back to a dash when no target duration was set', () => {
    expect(targetSummary(baseExercise, 'time')).toBe('–');
  });

  it('distance_time: shows both distance and duration when both are set', () => {
    const summary = targetSummary(
      { ...baseExercise, targetDistanceM: 5000, targetDurationSec: 1500 },
      'distance_time'
    );
    expect(summary).toBe('5 km · 25:00');
  });

  it('distance_time: shows only distance when duration is unset', () => {
    expect(targetSummary({ ...baseExercise, targetDistanceM: 400 }, 'distance_time')).toBe('400 m');
  });

  it('distance_time: shows only duration when distance is unset', () => {
    expect(targetSummary({ ...baseExercise, targetDurationSec: 300 }, 'distance_time')).toBe('5:00');
  });

  it('distance_time: falls back to a dash when neither was set', () => {
    expect(targetSummary(baseExercise, 'distance_time')).toBe('–');
  });
});
