import type { Unit } from './units';

/**
 * Barbell plate math: which plates go on each side to reach a target weight.
 *
 * Computed in the unit the user is looking at, never by converting a kilogram
 * answer into pounds — the result has to land on plates that physically exist
 * on the rack, and 20 kg is not 45 lb.
 *
 * Everything is worked out in hundredths (integers) because both plate sets
 * contain fractions: repeatedly subtracting 1.25 or 2.5 as floats accumulates
 * error and turns an exactly loadable weight into a phantom remainder.
 */

/** Heaviest first. Assumed available in unlimited quantity. */
export const PLATE_SETS: Record<Unit, readonly number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

/** Common bar weights; `0` covers machines and loading pins with no bar. */
export const BAR_OPTIONS: Record<Unit, readonly number[]> = {
  kg: [20, 15, 10, 0],
  lb: [45, 35, 15, 0],
};

export interface PlateCount {
  weight: number;
  count: number;
}

export type PlateResult =
  | {
      status: 'ok';
      /** Plates for ONE side, heaviest first. */
      perSide: PlateCount[];
      /** What the smallest plate cannot cover, counting both sides. */
      remainder: number;
      /** Weight actually on the bar, bar included. */
      achieved: number;
    }
  /** The target is lighter than the bar itself — nothing to load. */
  | { status: 'below-bar' };

const toHundredths = (value: number) => Math.round(value * 100);
const fromHundredths = (value: number) => value / 100;

/**
 * Greedy from the heaviest plate down, which is optimal for both sets: every
 * denomination is reachable from the smaller ones, so taking the largest that
 * fits never strands weight that a different combination could have placed.
 *
 * `target` and `bar` must be finite and non-negative — callers guard on empty
 * input rather than passing NaN.
 */
export function computePlates(
  target: number,
  bar: number,
  plates: readonly number[]
): PlateResult {
  const targetUnits = toHundredths(target);
  const barUnits = toHundredths(bar);
  if (targetUnits < barUnits) return { status: 'below-bar' };

  // Odd total weights cannot be split evenly; the leftover half-step is part
  // of the remainder rather than silently rounded onto one side of the bar.
  const load = targetUnits - barUnits;
  let side = Math.floor(load / 2);
  const odd = load - side * 2;

  const perSide: PlateCount[] = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    const plateUnits = toHundredths(plate);
    if (plateUnits <= 0) continue;
    const count = Math.floor(side / plateUnits);
    if (count > 0) {
      perSide.push({ weight: plate, count });
      side -= count * plateUnits;
    }
  }

  const loaded = load - side * 2 - odd;
  return {
    status: 'ok',
    perSide,
    remainder: fromHundredths(side * 2 + odd),
    achieved: fromHundredths(barUnits + loaded),
  };
}
