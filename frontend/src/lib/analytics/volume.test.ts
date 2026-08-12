import { describe, it, expect } from 'vitest';
import { bestSetVolume, entryVolume } from './volume';
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
