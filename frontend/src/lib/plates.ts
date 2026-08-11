/**
 * Barbell plate math: which plates go on each side to reach a target weight.
 *
 * Everything is computed in centi-kilograms (integers) because the plate set
 * contains 1.25 and 2.5 — repeatedly subtracting those as floats accumulates
 * error and turns an exactly loadable weight into a phantom remainder.
 */

/** Standard kg gym set, heaviest first. Assumed available in unlimited quantity. */
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

/** Common bar weights; `0` covers machines and loading pins with no bar. */
export const BAR_OPTIONS = [20, 15, 10, 0] as const;

export interface PlateCount {
  weightKg: number;
  count: number;
}

export type PlateResult =
  | {
      status: 'ok';
      /** Plates for ONE side, heaviest first. */
      perSide: PlateCount[];
      /** What the smallest plate cannot cover, counting both sides. */
      remainderKg: number;
      /** Weight actually on the bar, bar included. */
      achievedKg: number;
    }
  /** The target is lighter than the bar itself — nothing to load. */
  | { status: 'below-bar' };

const toCenti = (kg: number) => Math.round(kg * 100);
const toKg = (centi: number) => centi / 100;

/**
 * Greedy from the heaviest plate down, which is optimal for this set: every
 * denomination is reachable from the smaller ones, so taking the largest that
 * fits never strands weight that a different combination could have placed.
 *
 * `targetKg` and `barKg` must be finite and non-negative — callers guard on
 * empty input rather than passing NaN.
 */
export function computePlates(
  targetKg: number,
  barKg: number,
  plates: readonly number[] = DEFAULT_PLATES
): PlateResult {
  const targetCenti = toCenti(targetKg);
  const barCenti = toCenti(barKg);
  if (targetCenti < barCenti) return { status: 'below-bar' };

  // Odd total weights cannot be split evenly; the leftover half-step is part
  // of the remainder rather than silently rounded onto one side of the bar.
  const loadCenti = targetCenti - barCenti;
  let sideCenti = Math.floor(loadCenti / 2);
  const oddCenti = loadCenti - sideCenti * 2;

  const perSide: PlateCount[] = [];
  for (const plate of [...plates].sort((a, b) => b - a)) {
    const plateCenti = toCenti(plate);
    if (plateCenti <= 0) continue;
    const count = Math.floor(sideCenti / plateCenti);
    if (count > 0) {
      perSide.push({ weightKg: plate, count });
      sideCenti -= count * plateCenti;
    }
  }

  const loadedCenti = loadCenti - sideCenti * 2 - oddCenti;
  return {
    status: 'ok',
    perSide,
    remainderKg: toKg(sideCenti * 2 + oddCenti),
    achievedKg: toKg(barCenti + loadedCenti),
  };
}
