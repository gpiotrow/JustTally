import { describe, it, expect } from 'vitest';
import {
  bestPaceSecPerKm,
  bestSetDistance,
  bestSetDuration,
  bestSetReps,
  bestSetVolume,
  bestSetWeight,
  entryVolume,
  entryWorkload,
} from './volume';
import type { WorkoutEntry, WorkoutSet } from '../types';

const entry = (sets: WorkoutSet[]): Pick<WorkoutEntry, 'sets'> => ({ sets });

describe('entryVolume', () => {
  it('sums reps × weight over working and drop sets', () => {
    const e = entry([
      { reps: 10, weight: 40, type: 'warmup', done: true },
      { reps: 8, weight: 80, type: 'working', done: true },
      { reps: 6, weight: 60, type: 'drop', done: true },
    ]);
    // warmup excluded: 8*80 + 6*60 = 640 + 360 = 1000
    expect(entryVolume(e)).toBe(1000);
  });

  it('excludes sets that were not done', () => {
    const e = entry([{ reps: 8, weight: 80, type: 'working', done: false }]);
    expect(entryVolume(e)).toBe(0);
  });

  it('treats a set with no weight as contributing zero, not throwing', () => {
    const e = entry([{ reps: 8, type: 'working', done: true }]);
    expect(entryVolume(e)).toBe(0);
  });

  it('returns 0 for an entry with no sets', () => {
    expect(entryVolume(entry([]))).toBe(0);
  });
});

describe('bestSetVolume', () => {
  it('returns the single heaviest-volume countable set', () => {
    const e = entry([
      { reps: 10, weight: 40, type: 'warmup', done: true }, // excluded
      { reps: 8, weight: 80, type: 'working', done: true }, // 640
      { reps: 6, weight: 60, type: 'drop', done: true }, // 360
    ]);
    expect(bestSetVolume(e)).toBe(640);
  });

  it('returns null when nothing qualifies', () => {
    expect(bestSetVolume(entry([{ reps: 10, weight: 40, type: 'warmup', done: true }]))).toBeNull();
    expect(bestSetVolume(entry([]))).toBeNull();
  });

  it('returns null rather than 0 when the only countable set has no weight', () => {
    expect(bestSetVolume(entry([{ reps: 10, type: 'working', done: true }]))).toBeNull();
  });
});

describe('entryWorkload', () => {
  it('reps_weight: sums reps × weight, same as entryVolume', () => {
    const sets: WorkoutSet[] = [
      { reps: 10, weight: 40, type: 'warmup', done: true },
      { reps: 8, weight: 80, type: 'working', done: true },
    ];
    expect(entryWorkload(sets, 'reps_weight')).toEqual({ kind: 'load', value: 640 });
  });

  it('time_weight: sums duration × weight, ignoring the always-zero reps field', () => {
    const sets: WorkoutSet[] = [
      { reps: 0, weight: 20, durationSec: 30, type: 'working', done: true },
      { reps: 0, weight: 20, durationSec: 45, type: 'working', done: true },
    ];
    expect(entryWorkload(sets, 'time_weight')).toEqual({ kind: 'load', value: 20 * 30 + 20 * 45 });
  });

  it('reps: sums reps alone', () => {
    const sets: WorkoutSet[] = [
      { reps: 12, type: 'working', done: true },
      { reps: 8, type: 'working', done: true },
    ];
    expect(entryWorkload(sets, 'reps')).toEqual({ kind: 'reps', value: 20 });
  });

  it('time: sums duration alone', () => {
    const sets: WorkoutSet[] = [{ reps: 0, durationSec: 60, type: 'working', done: true }];
    expect(entryWorkload(sets, 'time')).toEqual({ kind: 'time', value: 60 });
  });

  it('distance_time: sums distance alone', () => {
    const sets: WorkoutSet[] = [{ reps: 0, distanceM: 1000, durationSec: 300, type: 'working', done: true }];
    expect(entryWorkload(sets, 'distance_time')).toEqual({ kind: 'distance', value: 1000 });
  });

  it('excludes warm-ups and sets not done, regardless of mode', () => {
    const sets: WorkoutSet[] = [
      { reps: 10, type: 'working', done: false },
      { reps: 10, type: 'warmup', done: true },
    ];
    expect(entryWorkload(sets, 'reps')).toEqual({ kind: 'reps', value: 0 });
  });
});

describe('bestSetWeight', () => {
  it('finds the heaviest logged weight', () => {
    const sets: WorkoutSet[] = [
      { reps: 8, weight: 60, type: 'working', done: true },
      { reps: 6, weight: 80, type: 'drop', done: true },
    ];
    expect(bestSetWeight(sets)).toBe(80);
  });

  it('counts a zero-rep set — a held weight logs no reps but a real weight', () => {
    expect(bestSetWeight([{ reps: 0, weight: 40, type: 'working', done: true }])).toBe(40);
  });

  it('returns null when nothing carries a weight', () => {
    expect(bestSetWeight([{ reps: 10, type: 'working', done: true }])).toBeNull();
  });
});

describe('bestSetReps', () => {
  it('finds the most reps in a single set', () => {
    const sets: WorkoutSet[] = [
      { reps: 8, type: 'working', done: true },
      { reps: 12, type: 'working', done: true },
    ];
    expect(bestSetReps(sets)).toBe(12);
  });

  it('returns null when every set has zero reps', () => {
    expect(bestSetReps([{ reps: 0, durationSec: 60, type: 'working', done: true }])).toBeNull();
  });
});

describe('bestSetDuration', () => {
  it('finds the longest logged duration', () => {
    const sets: WorkoutSet[] = [
      { reps: 0, durationSec: 30, type: 'working', done: true },
      { reps: 0, durationSec: 60, type: 'working', done: true },
    ];
    expect(bestSetDuration(sets)).toBe(60);
  });

  it('returns null when nothing carries a duration', () => {
    expect(bestSetDuration([{ reps: 8, weight: 60, type: 'working', done: true }])).toBeNull();
  });
});

describe('bestSetDistance', () => {
  it('finds the longest logged distance', () => {
    const sets: WorkoutSet[] = [
      { reps: 0, distanceM: 1000, type: 'working', done: true },
      { reps: 0, distanceM: 5000, type: 'working', done: true },
    ];
    expect(bestSetDistance(sets)).toBe(5000);
  });

  it('returns null when nothing carries a distance', () => {
    expect(bestSetDistance([{ reps: 8, weight: 60, type: 'working', done: true }])).toBeNull();
  });
});

describe('bestPaceSecPerKm', () => {
  it('computes seconds per kilometer', () => {
    // 1000m in 300s -> 300 sec/km
    const sets: WorkoutSet[] = [{ reps: 0, distanceM: 1000, durationSec: 300, type: 'working', done: true }];
    expect(bestPaceSecPerKm(sets)).toBe(300);
  });

  it('picks the lowest (fastest) pace among several sets', () => {
    const sets: WorkoutSet[] = [
      { reps: 0, distanceM: 1000, durationSec: 300, type: 'working', done: true }, // 300 sec/km
      { reps: 0, distanceM: 5000, durationSec: 1200, type: 'working', done: true }, // 240 sec/km
    ];
    expect(bestPaceSecPerKm(sets)).toBe(240);
  });

  it('ignores a set missing either duration or distance', () => {
    const sets: WorkoutSet[] = [{ reps: 0, distanceM: 1000, type: 'working', done: true }];
    expect(bestPaceSecPerKm(sets)).toBeNull();
  });

  it('returns null when nothing qualifies', () => {
    expect(bestPaceSecPerKm([{ reps: 8, weight: 60, type: 'working', done: true }])).toBeNull();
  });
});
