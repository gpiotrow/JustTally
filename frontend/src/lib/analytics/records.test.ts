import { describe, it, expect } from 'vitest';
import { computeExerciseRecords, findNewRecords, newRecordKinds } from './records';
import type { WorkoutSession } from '../types';

const session = (
  id: string,
  date: number,
  exerciseId: string,
  sets: WorkoutSession['entries'][number]['sets']
): WorkoutSession => ({
  id,
  date,
  updatedAt: date,
  entries: [{ exerciseId, exerciseName: 'Bench Press', sets }],
});

describe('computeExerciseRecords', () => {
  it('returns null for every field when the exercise was never logged', () => {
    expect(computeExerciseRecords([], 'ex-1')).toEqual({
      maxWeight: null,
      maxE1rm: null,
      maxSetVolume: null,
    });
  });

  it('finds the heaviest weight, best e1RM and best set volume independently', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, 'ex-1', [{ reps: 1, weight: 100, type: 'working', done: true }]),
      // Lower weight, but higher reps -> higher e1RM (105) and higher set volume (450).
      session('s2', 2000, 'ex-1', [{ reps: 5, weight: 90, type: 'working', done: true }]),
    ];
    const records = computeExerciseRecords(sessions, 'ex-1');
    expect(records.maxWeight).toEqual({ value: 100, date: 1000 });
    expect(records.maxE1rm?.value).toBeCloseTo(105, 5);
    expect(records.maxE1rm?.date).toBe(2000);
    expect(records.maxSetVolume).toEqual({ value: 450, date: 2000 });
  });

  it('ignores warm-up sets and sets from other exercises', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, 'ex-1', [{ reps: 10, weight: 200, type: 'warmup', done: true }]),
      session('s2', 2000, 'ex-2', [{ reps: 5, weight: 150, type: 'working', done: true }]),
    ];
    expect(computeExerciseRecords(sessions, 'ex-1')).toEqual({
      maxWeight: null,
      maxE1rm: null,
      maxSetVolume: null,
    });
  });

  it('marks the e1RM record unreliable when it came from a high-rep set', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, 'ex-1', [{ reps: 20, weight: 40, type: 'working', done: true }]),
    ];
    expect(computeExerciseRecords(sessions, 'ex-1').maxE1rm?.reliable).toBe(false);
  });
});

describe('findNewRecords', () => {
  it('reports no records on the very first time an exercise is logged', () => {
    const first = session('s1', 1000, 'ex-1', [{ reps: 5, weight: 100, type: 'working', done: true }]);
    expect(findNewRecords([], first, 'ex-1')).toEqual({ weight: false, e1rm: false, setVolume: false });
  });

  it('flags a heavier weight than every prior session as a new record', () => {
    const prior = [session('s1', 1000, 'ex-1', [{ reps: 5, weight: 80, type: 'working', done: true }])];
    const next = session('s2', 2000, 'ex-1', [{ reps: 5, weight: 85, type: 'working', done: true }]);
    const result = findNewRecords(prior, next, 'ex-1');
    expect(result.weight).toBe(true);
  });

  it('does not flag a session that merely matches, not beats, the prior best', () => {
    const prior = [session('s1', 1000, 'ex-1', [{ reps: 5, weight: 80, type: 'working', done: true }])];
    const next = session('s2', 2000, 'ex-1', [{ reps: 5, weight: 80, type: 'working', done: true }]);
    expect(findNewRecords(prior, next, 'ex-1').weight).toBe(false);
  });

  it('evaluates weight, e1RM and set-volume records independently', () => {
    const prior = [session('s1', 1000, 'ex-1', [{ reps: 1, weight: 100, type: 'working', done: true }])];
    // Lighter than the prior weight record, but far higher reps: beats e1RM and set-volume, not weight.
    const next = session('s2', 2000, 'ex-1', [{ reps: 10, weight: 90, type: 'working', done: true }]);
    expect(findNewRecords(prior, next, 'ex-1')).toEqual({ weight: false, e1rm: true, setVolume: true });
  });
});

describe('newRecordKinds', () => {
  it('lists only the kinds that are true', () => {
    expect(newRecordKinds({ weight: true, e1rm: false, setVolume: true })).toEqual(['weight', 'setVolume']);
  });

  it('returns an empty list when nothing hit', () => {
    expect(newRecordKinds({ weight: false, e1rm: false, setVolume: false })).toEqual([]);
  });
});
