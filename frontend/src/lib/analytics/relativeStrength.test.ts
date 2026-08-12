import { describe, it, expect } from 'vitest';
import {
  dotsCoefficient,
  dotsScore,
  nearestBodyWeight,
  wilksCoefficient,
  wilksScore,
} from './relativeStrength';
import type { BodyWeight } from '../types';

/**
 * Reference values computed independently from the same published
 * coefficients (Wilks 1994 / DOTS 2020) that `relativeStrength.ts` uses —
 * this is a transcription check on the polynomial, not a claim that these
 * exact numbers were cross-verified against a third-party calculator.
 */
describe('wilksCoefficient', () => {
  it.each([
    ['male', 60, 0.8529],
    ['male', 75, 0.7126],
    ['male', 90, 0.6384],
    ['male', 100, 0.6086],
    ['male', 120, 0.5749],
    ['female', 60, 1.1149],
    ['female', 75, 0.9506],
    ['female', 90, 0.8641],
    ['female', 100, 0.8326],
    ['female', 120, 0.7997],
  ] as const)('%s at %ikg bodyweight ≈ %f', (sex, bw, expected) => {
    expect(wilksCoefficient(bw, sex)).toBeCloseTo(expected, 3);
  });

  it('decreases as bodyweight increases across the typical adult range', () => {
    const values = [60, 75, 90, 100, 120].map((bw) => wilksCoefficient(bw, 'male'));
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeLessThan(values[i - 1]);
  });
});

describe('dotsCoefficient', () => {
  it.each([
    ['male', 60, 0.844],
    ['male', 75, 0.7174],
    ['male', 90, 0.6466],
    ['male', 100, 0.6155],
    ['male', 120, 0.5743],
    ['female', 60, 1.1085],
    ['female', 75, 0.974],
    ['female', 90, 0.8915],
    ['female', 100, 0.8533],
    ['female', 120, 0.8024],
  ] as const)('%s at %ikg bodyweight ≈ %f', (sex, bw, expected) => {
    expect(dotsCoefficient(bw, sex)).toBeCloseTo(expected, 3);
  });
});

describe('wilksScore / dotsScore', () => {
  it('is simply total × coefficient', () => {
    expect(wilksScore(300, 90, 'male')).toBeCloseTo(300 * wilksCoefficient(90, 'male'), 10);
    expect(dotsScore(300, 90, 'male')).toBeCloseTo(300 * dotsCoefficient(90, 'male'), 10);
  });
});

describe('nearestBodyWeight', () => {
  const entries: BodyWeight[] = [
    { id: 'a', date: 1000, kg: 80, updatedAt: 1000 },
    { id: 'b', date: 5000, kg: 82, updatedAt: 5000 },
    { id: 'c', date: 10_000, kg: 83, updatedAt: 10_000 },
  ];

  it('returns null for an empty list', () => {
    expect(nearestBodyWeight([], 5000)).toBeNull();
  });

  it('picks the entry closest in time, not the most recent', () => {
    // 1200 is much closer to entry "a" (date 1000) than to "b" (date 5000).
    expect(nearestBodyWeight(entries, 1200)?.id).toBe('a');
  });

  it('picks an exact match', () => {
    expect(nearestBodyWeight(entries, 5000)?.id).toBe('b');
  });

  it('picks the nearest even when the target date is after every entry', () => {
    expect(nearestBodyWeight(entries, 100_000)?.id).toBe('c');
  });
});
