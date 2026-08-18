import { describe, it, expect } from 'vitest';
import {
  computeExerciseRecords,
  findNewRecords,
  newRecordKinds,
  RECORD_KINDS_BY_TRACKING,
  type ExerciseRecords,
  type NewRecords,
} from './records';
import type { WorkoutSession } from '../types';

const session = (
  id: string,
  date: number,
  exerciseId: string,
  sets: WorkoutSession['entries'][number]['sets'],
  tracking?: WorkoutSession['entries'][number]['tracking']
): WorkoutSession => ({
  id,
  date,
  updatedAt: date,
  entries: [{ exerciseId, exerciseName: 'Bench Press', tracking, sets }],
});

const EMPTY_RECORDS: ExerciseRecords = {
  maxWeight: null,
  maxE1rm: null,
  maxSetVolume: null,
  maxReps: null,
  maxDuration: null,
  maxDistance: null,
  bestPace: null,
};

const NO_NEW_RECORDS: NewRecords = {
  weight: false,
  e1rm: false,
  setVolume: false,
  reps: false,
  duration: false,
  distance: false,
  pace: false,
};

describe('computeExerciseRecords', () => {
  it('returns null for every field when the exercise was never logged', () => {
    expect(computeExerciseRecords([], 'ex-1')).toEqual(EMPTY_RECORDS);
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
    expect(computeExerciseRecords(sessions, 'ex-1')).toEqual(EMPTY_RECORDS);
  });

  it('marks the e1RM record unreliable when it came from a high-rep set', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, 'ex-1', [{ reps: 20, weight: 40, type: 'working', done: true }]),
    ];
    expect(computeExerciseRecords(sessions, 'ex-1').maxE1rm?.reliable).toBe(false);
  });

  it('credits a time_weight set (reps: 0) toward maxWeight but never toward e1RM', () => {
    const sessions: WorkoutSession[] = [
      session(
        's1',
        1000,
        'ex-1',
        [{ reps: 0, weight: 40, durationSec: 45, type: 'working', done: true }],
        'time_weight'
      ),
    ];
    const records = computeExerciseRecords(sessions, 'ex-1');
    expect(records.maxWeight).toEqual({ value: 40, date: 1000 });
    expect(records.maxE1rm).toBeNull();
    // reps × weight is 0 × 40 = 0, which is not a real volume figure either.
    expect(records.maxSetVolume).toBeNull();
  });

  it('finds the most reps in a single set for the reps mode', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, 'ex-1', [{ reps: 8, type: 'working', done: true }], 'reps'),
      session('s2', 2000, 'ex-1', [{ reps: 12, type: 'working', done: true }], 'reps'),
    ];
    expect(computeExerciseRecords(sessions, 'ex-1').maxReps).toEqual({ value: 12, date: 2000 });
  });

  it('finds the longest duration for the time mode', () => {
    const sessions: WorkoutSession[] = [
      session('s1', 1000, 'ex-1', [{ reps: 0, durationSec: 30, type: 'working', done: true }], 'time'),
      session('s2', 2000, 'ex-1', [{ reps: 0, durationSec: 60, type: 'working', done: true }], 'time'),
    ];
    expect(computeExerciseRecords(sessions, 'ex-1').maxDuration).toEqual({ value: 60, date: 2000 });
  });

  it('finds the longest distance and the best (lowest) pace for the distance_time mode', () => {
    const sessions: WorkoutSession[] = [
      // 1000m in 300s -> 300 sec/km
      session(
        's1',
        1000,
        'ex-1',
        [{ reps: 0, distanceM: 1000, durationSec: 300, type: 'working', done: true }],
        'distance_time'
      ),
      // 5000m in 1200s -> 240 sec/km: farther, and faster.
      session(
        's2',
        2000,
        'ex-1',
        [{ reps: 0, distanceM: 5000, durationSec: 1200, type: 'working', done: true }],
        'distance_time'
      ),
    ];
    const records = computeExerciseRecords(sessions, 'ex-1');
    expect(records.maxDistance).toEqual({ value: 5000, date: 2000 });
    expect(records.bestPace).toEqual({ value: 240, date: 2000 });
  });

  it('a slower second run does not overwrite a faster earlier pace record', () => {
    const sessions: WorkoutSession[] = [
      // 240 sec/km
      session(
        's1',
        1000,
        'ex-1',
        [{ reps: 0, distanceM: 5000, durationSec: 1200, type: 'working', done: true }],
        'distance_time'
      ),
      // 300 sec/km — slower.
      session(
        's2',
        2000,
        'ex-1',
        [{ reps: 0, distanceM: 1000, durationSec: 300, type: 'working', done: true }],
        'distance_time'
      ),
    ];
    expect(computeExerciseRecords(sessions, 'ex-1').bestPace).toEqual({ value: 240, date: 1000 });
  });
});

describe('findNewRecords', () => {
  it('reports no records on the very first time an exercise is logged', () => {
    const first = session('s1', 1000, 'ex-1', [{ reps: 5, weight: 100, type: 'working', done: true }]);
    expect(findNewRecords([], first, 'ex-1')).toEqual(NO_NEW_RECORDS);
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
    // Lighter than the prior weight record, but far higher reps: beats e1RM and
    // set-volume, not weight. Every record kind is computed unconditionally
    // (see `computeExerciseRecords`), so a plain reps_weight set with more
    // reps than before also beats `maxReps` — a real fact this data layer
    // reports regardless of mode; the exercise's own tracking mode is what
    // decides which kinds `ExerciseStats.tsx` actually shows.
    const next = session('s2', 2000, 'ex-1', [{ reps: 10, weight: 90, type: 'working', done: true }]);
    expect(findNewRecords(prior, next, 'ex-1')).toEqual({
      ...NO_NEW_RECORDS,
      e1rm: true,
      setVolume: true,
      reps: true,
    });
  });

  it('flags a new pace record for a strictly faster run, not merely a longer one', () => {
    const prior = [
      session(
        's1',
        1000,
        'ex-1',
        [{ reps: 0, distanceM: 5000, durationSec: 1200, type: 'working', done: true }],
        'distance_time'
      ),
    ];
    // Farther, but slower (300 sec/km vs the prior 240): distance record, not a pace record.
    const next = session(
      's2',
      2000,
      'ex-1',
      [{ reps: 0, distanceM: 10000, durationSec: 3000, type: 'working', done: true }],
      'distance_time'
    );
    const result = findNewRecords(prior, next, 'ex-1');
    expect(result.distance).toBe(true);
    expect(result.pace).toBe(false);
  });
});

describe('RECORD_KINDS_BY_TRACKING', () => {
  it('matches the plan table exactly, per mode', () => {
    expect(RECORD_KINDS_BY_TRACKING).toEqual({
      reps_weight: ['weight', 'e1rm', 'setVolume'],
      reps: ['reps'],
      time: ['duration'],
      time_weight: ['weight', 'duration'],
      distance_time: ['distance', 'pace'],
    });
  });
});

describe('newRecordKinds', () => {
  it('lists only the kinds that are true', () => {
    expect(newRecordKinds({ ...NO_NEW_RECORDS, weight: true, setVolume: true })).toEqual([
      'weight',
      'setVolume',
    ]);
  });

  it('returns an empty list when nothing hit', () => {
    expect(newRecordKinds(NO_NEW_RECORDS)).toEqual([]);
  });
});
