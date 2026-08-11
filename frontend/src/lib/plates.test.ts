import { describe, it, expect } from 'vitest';
import { computePlates, PLATE_SETS } from './plates';

const KG = PLATE_SETS.kg;
const LB = PLATE_SETS.lb;

describe('computePlates (metric)', () => {
  it('splits an exactly loadable weight evenly across both sides', () => {
    // 82.5 kg on a 20 kg bar: 62.5 kg to load, 31.25 kg per side.
    expect(computePlates(82.5, 20, KG)).toEqual({
      status: 'ok',
      perSide: [
        { weight: 25, count: 1 },
        { weight: 5, count: 1 },
        { weight: 1.25, count: 1 },
      ],
      remainder: 0,
      achieved: 82.5,
    });
  });

  it('reports the leftover when the target cannot be hit exactly', () => {
    // 61 kg on a 20 kg bar: 20.5 kg per side, but the smallest plate is 1.25 kg
    // — 0.5 kg per side (1 kg total) is unreachable and must show as remainder,
    // not silently rounded onto the bar.
    expect(computePlates(61, 20, KG)).toEqual({
      status: 'ok',
      perSide: [{ weight: 20, count: 1 }],
      remainder: 1,
      achieved: 60,
    });
  });

  it('returns below-bar when the target is lighter than the bar itself', () => {
    expect(computePlates(15, 20, KG)).toEqual({ status: 'below-bar' });
  });

  it('treats a target equal to the bar as loadable with no plates', () => {
    expect(computePlates(20, 20, KG)).toEqual({
      status: 'ok',
      perSide: [],
      remainder: 0,
      achieved: 20,
    });
  });

  it('prefers larger plates over smaller ones (greedy is optimal for this set)', () => {
    // 100 kg on a 20 kg bar: 40 kg per side = 25 + 15, not e.g. four 10s.
    const result = computePlates(100, 20, KG);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.perSide).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
    ]);
    expect(result.achieved).toBe(100);
  });

  it('works with no bar at all (machines, loading pins)', () => {
    expect(computePlates(20, 0, KG)).toEqual({
      status: 'ok',
      perSide: [{ weight: 10, count: 1 }],
      remainder: 0,
      achieved: 20,
    });
  });

  it('does not accumulate floating-point drift across repeated fractional plates', () => {
    // A target built from small plates is where naive float subtraction
    // (0.1 + 0.2 !== 0.3 territory) would show up first.
    const result = computePlates(43.75, 20, KG);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.achieved + result.remainder).toBeCloseTo(43.75, 10);
  });

  it('surfaces a sub-integer remainder instead of dropping it', () => {
    // An odd number of hundredths cannot be split evenly between two sides;
    // that leftover half-step must still show up in the remainder.
    expect(computePlates(0.01, 0, KG)).toEqual({
      status: 'ok',
      perSide: [],
      remainder: 0.01,
      achieved: 0,
    });
  });
});

describe('computePlates (imperial)', () => {
  it('loads a classic 135 lb from a 45 lb bar', () => {
    expect(computePlates(135, 45, LB)).toEqual({
      status: 'ok',
      perSide: [{ weight: 45, count: 1 }],
      remainder: 0,
      achieved: 135,
    });
  });

  it('stacks plates for 225 lb', () => {
    // 180 lb to load, 90 lb per side = two 45s.
    expect(computePlates(225, 45, LB)).toEqual({
      status: 'ok',
      perSide: [{ weight: 45, count: 2 }],
      remainder: 0,
      achieved: 225,
    });
  });

  it('computes natively rather than through a kilogram round-trip', () => {
    // 100 lb on a 45 lb bar is 27.5 lb per side — reachable exactly as
    // 25 + 2.5. Converting a metric answer would never produce those plates.
    expect(computePlates(100, 45, LB)).toEqual({
      status: 'ok',
      perSide: [
        { weight: 25, count: 1 },
        { weight: 2.5, count: 1 },
      ],
      remainder: 0,
      achieved: 100,
    });
  });

  it('reports the leftover a 2.5 lb smallest plate cannot cover', () => {
    // 49 lb to load, 24.5 lb per side: 10+10+2.5 leaves 2 lb per side unplaced.
    const result = computePlates(94, 45, LB);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.remainder).toBe(4);
    expect(result.achieved).toBe(90);
  });
});

describe('plate sets', () => {
  it('keeps the two sets distinct — a bar is not the same weight in both', () => {
    expect(KG).not.toContain(45);
    expect(LB).not.toContain(20);
  });

  it('reports the full load as remainder when no plates are available', () => {
    expect(computePlates(50, 20, [])).toEqual({
      status: 'ok',
      perSide: [],
      remainder: 30,
      achieved: 20,
    });
  });

  it('ignores a zero or negative denomination in a custom plate set', () => {
    expect(computePlates(30, 20, [0, -5, 5])).toEqual({
      status: 'ok',
      perSide: [{ weight: 5, count: 1 }],
      remainder: 0,
      achieved: 30,
    });
  });
});
