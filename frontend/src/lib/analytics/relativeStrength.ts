import type { BodyWeight, Sex } from '../types';

/**
 * Original Wilks coefficients (Wilks, 1994) — still the most widely
 * recognised relative-strength formula, one polynomial per sex, in bodyweight
 * kilograms.
 */
const WILKS_MALE = [-216.0475144, 16.2606339, -0.002388645, -0.00113732, 7.01863e-6, -1.291e-8];
const WILKS_FEMALE = [594.31747775582, -27.23842536447, 0.82112226871, -0.00930733913, 4.731582e-5, -9.054e-8];

/**
 * DOTS coefficients (2020) — the newer formula several federations have
 * since adopted in place of Wilks; corrects some of Wilks' known skew at the
 * bodyweight extremes.
 */
const DOTS_MALE = [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093];
const DOTS_FEMALE = [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706];

function polynomial(coeffs: number[], x: number): number {
  return coeffs.reduce((sum, c, i) => sum + c * x ** i, 0);
}

/**
 * Wilks coefficient for a bodyweight (kg) — multiply by a total lifted (kg)
 * for the Wilks score. Both formulas here are designed for a competition
 * total (the sum of three lifts); applied to a single exercise, as this app
 * does, the result is a self-comparison over time, not a league-table value —
 * the UI must say so wherever this is shown (§ 15.3 / § 10).
 */
export function wilksCoefficient(bodyweightKg: number, sex: Sex): number {
  return 500 / polynomial(sex === 'male' ? WILKS_MALE : WILKS_FEMALE, bodyweightKg);
}

/** DOTS coefficient for a bodyweight (kg) — same caveat as {@link wilksCoefficient}. */
export function dotsCoefficient(bodyweightKg: number, sex: Sex): number {
  return 500 / polynomial(sex === 'male' ? DOTS_MALE : DOTS_FEMALE, bodyweightKg);
}

export function wilksScore(totalKg: number, bodyweightKg: number, sex: Sex): number {
  return totalKg * wilksCoefficient(bodyweightKg, sex);
}

export function dotsScore(totalKg: number, bodyweightKg: number, sex: Sex): number {
  return totalKg * dotsCoefficient(bodyweightKg, sex);
}

/**
 * The logged bodyweight closest in time to `date` — there is rarely a
 * same-day entry, so "closest" (not "most recent") is what makes the score
 * meaningful for an older session too.
 */
export function nearestBodyWeight(bodyWeights: BodyWeight[], date: number): BodyWeight | null {
  if (bodyWeights.length === 0) return null;
  return bodyWeights.reduce((closest, bw) =>
    Math.abs(bw.date - date) < Math.abs(closest.date - date) ? bw : closest
  );
}
