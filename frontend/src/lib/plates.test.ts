import { describe, it, expect } from 'vitest';
import { computePlates, DEFAULT_PLATES } from './plates';

describe('computePlates', () => {
  it('splits an exactly loadable weight evenly across both sides', () => {
    // 82.5 kg on a 20 kg bar: 62.5 kg to load, 31.25 kg per side.
    const result = computePlates(82.5, 20);
    expect(result).toEqual({
      status: 'ok',
      perSide: [
        { weightKg: 25, count: 1 },
        { weightKg: 5, count: 1 },
        { weightKg: 1.25, count: 1 },
      ],
      remainderKg: 0,
      achievedKg: 82.5,
    });
  });

  it('reports the leftover when the target cannot be hit exactly', () => {
    // 61 kg on a 20 kg bar: 20.5 kg per side, but the smallest plate is 1.25 kg
    // — 0.5 kg per side (1 kg total) is unreachable and must show as remainder,
    // not silently rounded onto the bar.
    const result = computePlates(61, 20);
    expect(result).toEqual({
      status: 'ok',
      perSide: [{ weightKg: 20, count: 1 }],
      remainderKg: 1,
      achievedKg: 60,
    });
  });

  it('returns below-bar when the target is lighter than the bar itself', () => {
    expect(computePlates(15, 20)).toEqual({ status: 'below-bar' });
  });

  it('treats a target equal to the bar as loadable with no plates', () => {
    const result = computePlates(20, 20);
    expect(result).toEqual({
      status: 'ok',
      perSide: [],
      remainderKg: 0,
      achievedKg: 20,
    });
  });

  it('prefers larger plates over smaller ones (greedy is optimal for this set)', () => {
    // 100 kg on a 20 kg bar: 40 kg per side = 25 + 15, not e.g. four 10s.
    const result = computePlates(100, 20);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.perSide).toEqual([
      { weightKg: 25, count: 1 },
      { weightKg: 15, count: 1 },
    ]);
    expect(result.achievedKg).toBe(100);
  });

  it('works with no bar at all (machines, loading pins)', () => {
    const result = computePlates(20, 0);
    expect(result).toEqual({
      status: 'ok',
      perSide: [{ weightKg: 10, count: 1 }],
      remainderKg: 0,
      achievedKg: 20,
    });
  });

  it('reports the full load as remainder when no plates are available', () => {
    const result = computePlates(50, 20, []);
    expect(result).toEqual({
      status: 'ok',
      perSide: [],
      remainderKg: 30,
      achievedKg: 20,
    });
  });

  it('does not accumulate floating-point drift across repeated 1.25/2.5 plates', () => {
    // A target built from many small plates is where naive float subtraction
    // (0.1 + 0.2 !== 0.3 territory) would show up first.
    const result = computePlates(43.75, 20);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    // 11.875 kg per side: not exactly reachable (smallest unit is 1.25 kg),
    // but the achieved + remainder must still add back up to the target with
    // no residual float noise.
    expect(result.achievedKg + result.remainderKg).toBeCloseTo(43.75, 10);
  });

  it('ignores a zero or negative denomination in a custom plate set', () => {
    const result = computePlates(30, 20, [0, -5, 5]);
    expect(result).toEqual({
      status: 'ok',
      perSide: [{ weightKg: 5, count: 1 }],
      remainderKg: 0,
      achievedKg: 30,
    });
  });

  it('supports a custom (e.g. imperial) plate set independent of DEFAULT_PLATES', () => {
    const imperial = [45, 25, 10, 5, 2.5];
    const result = computePlates(135, 45, imperial);
    expect(result).toEqual({
      status: 'ok',
      perSide: [{ weightKg: 45, count: 1 }],
      remainderKg: 0,
      achievedKg: 135,
    });
    expect(DEFAULT_PLATES).not.toContain(45); // sanity: the two sets are distinct
  });

  it('surfaces a sub-integer remainder instead of dropping it', () => {
    // An odd number of centi-kilos can't be split evenly between two sides;
    // that leftover half-step must still show up in remainderKg.
    const result = computePlates(0.01, 0);
    expect(result).toEqual({
      status: 'ok',
      perSide: [],
      remainderKg: 0.01,
      achievedKg: 0,
    });
  });
});
