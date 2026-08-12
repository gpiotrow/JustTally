import { describe, it, expect } from 'vitest';
import { bestSetEstimate, countableSets, epley1RM, isE1rmReliable } from './oneRepMax';
import type { WorkoutSet } from '../types';

describe('epley1RM', () => {
  it('matches the textbook formula w × (1 + r/30)', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 10);
    expect(epley1RM(80, 1)).toBeCloseTo(80 * (1 + 1 / 30), 10);
  });

  it('a single-rep set estimates to just over the lifted weight', () => {
    expect(epley1RM(100, 1)).toBeCloseTo(103.333, 2);
  });
});

describe('isE1rmReliable', () => {
  it('is reliable at and below 12 reps', () => {
    expect(isE1rmReliable(1)).toBe(true);
    expect(isE1rmReliable(12)).toBe(true);
  });

  it('is unreliable above 12 reps', () => {
    expect(isE1rmReliable(13)).toBe(false);
    expect(isE1rmReliable(20)).toBe(false);
  });
});

describe('countableSets', () => {
  const base: WorkoutSet = { reps: 8, weight: 60, type: 'working', done: true };

  it('excludes warm-up sets', () => {
    expect(countableSets([{ ...base, type: 'warmup' }])).toEqual([]);
  });

  it('excludes sets not done', () => {
    expect(countableSets([{ ...base, done: false }])).toEqual([]);
  });

  it('excludes sets with no logged weight', () => {
    expect(countableSets([{ reps: 12, type: 'working', done: true }])).toEqual([]);
  });

  it('excludes a zero-weight set', () => {
    expect(countableSets([{ ...base, weight: 0 }])).toEqual([]);
  });

  it('includes working and drop sets that were done and carry a weight', () => {
    const drop: WorkoutSet = { reps: 6, weight: 50, type: 'drop', done: true };
    expect(countableSets([base, drop])).toEqual([base, drop]);
  });

  it('treats a set with no type as working (read-default)', () => {
    const legacy: WorkoutSet = { reps: 8, weight: 60, done: true };
    expect(countableSets([legacy])).toEqual([legacy]);
  });

  it('treats a set with no done flag as done (read-default)', () => {
    const legacy: WorkoutSet = { reps: 8, weight: 60, type: 'working' };
    expect(countableSets([legacy])).toEqual([legacy]);
  });
});

describe('bestSetEstimate', () => {
  it('returns null when no set qualifies', () => {
    expect(bestSetEstimate([{ reps: 10, weight: 20, type: 'warmup', done: true }])).toBeNull();
    expect(bestSetEstimate([])).toBeNull();
  });

  it('picks the set with the highest estimated 1RM, not the heaviest weight', () => {
    // 100kg x 1 -> e1RM 103.3; 90kg x 5 -> e1RM 105 — the second wins despite less weight.
    const sets: WorkoutSet[] = [
      { reps: 1, weight: 100, type: 'working', done: true },
      { reps: 5, weight: 90, type: 'working', done: true },
    ];
    const best = bestSetEstimate(sets);
    expect(best?.weight).toBe(90);
    expect(best?.reps).toBe(5);
    expect(best?.e1rm).toBeCloseTo(105, 5);
  });

  it('flags a high-rep best set as unreliable', () => {
    const sets: WorkoutSet[] = [{ reps: 20, weight: 40, type: 'working', done: true }];
    expect(bestSetEstimate(sets)?.reliable).toBe(false);
  });

  it('ignores warm-ups even when they would otherwise win', () => {
    const sets: WorkoutSet[] = [
      { reps: 5, weight: 200, type: 'warmup', done: true },
      { reps: 5, weight: 80, type: 'working', done: true },
    ];
    expect(bestSetEstimate(sets)?.weight).toBe(80);
  });
});
