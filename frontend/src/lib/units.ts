/**
 * Weight units. Kilograms are canonical: every stored, synced and exported
 * number is kg, and pounds exist only at the edge where a value is shown or
 * typed. A preference that can change must never be able to reinterpret data
 * that was already written.
 */

export type Unit = 'kg' | 'lb';

export const UNITS: readonly Unit[] = ['kg', 'lb'];

/** Exact by definition (international avoirdupois pound), not an approximation. */
const KG_PER_LB = 0.45359237;

export function isUnit(value: unknown): value is Unit {
  return value === 'kg' || value === 'lb';
}

export function kgToUnit(kg: number, unit: Unit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function unitToKg(value: number, unit: Unit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

/**
 * What one tap of a stepper changes. 2.5 kg is the smallest jump a standard
 * metric pair of plates makes; 5 lb is its imperial counterpart.
 */
export function weightStep(unit: Unit): number {
  return unit === 'kg' ? 2.5 : 5;
}

/**
 * Trailing zeros removed — "62.5", not "62.50", and "60", not "60.00". Weights
 * are read at a glance between sets, so every character that carries no
 * information is one the eye has to discard.
 */
export function formatNumber(value: number, maxDecimals = 2): string {
  return String(Number(value.toFixed(maxDecimals)));
}

/**
 * Accepts what people actually type: a comma as the decimal separator (every
 * German keyboard offers it on the numeric pad) and surrounding whitespace.
 * Returns undefined for blank or unparseable input rather than 0, because
 * "nothing entered" and "zero" mean different things on a set.
 *
 * Only the first comma is substituted, so "1,2,3" stays unparseable instead of
 * quietly becoming 1.2.
 */
export function parseDecimalInput(raw: string): number | undefined {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '') return undefined;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Reps as typed: a non-negative integer, or undefined when blank/invalid. */
export function parseRepsInput(raw: string): number | undefined {
  const value = parseDecimalInput(raw);
  if (value === undefined || value < 0 || !Number.isInteger(value)) return undefined;
  return value;
}

/** A typed weight in display units → canonical kg. Negative input is rejected. */
export function weightInputToKg(raw: string, unit: Unit): number | undefined {
  const value = parseDecimalInput(raw);
  if (value === undefined || value < 0) return undefined;
  return unitToKg(value, unit);
}

/** Canonical kg → the string that belongs in an input field for `unit`. */
export function formatWeightInput(kg: number | undefined, unit: Unit): string {
  if (kg === undefined) return '';
  return formatNumber(kgToUnit(kg, unit));
}

/** Canonical kg → a labelled weight for read-only display. */
export function formatWeightWithUnit(kg: number, unit: Unit): string {
  return `${formatNumber(kgToUnit(kg, unit))} ${unit}`;
}

/**
 * Re-express an in-progress input when the user switches units mid-session.
 *
 * Text that is not a finished number is handed back untouched. That includes a
 * trailing separator: `Number("6.")` is a perfectly good 6, which is what we
 * want when *saving* a set, but here it means someone is one keystroke away
 * from 6.5 — converting it to "13.23" would throw that intent away.
 */
export function convertWeightInput(raw: string, from: Unit, to: Unit): string {
  if (from === to) return raw;
  if (/[.,]\s*$/.test(raw)) return raw;
  const kg = weightInputToKg(raw, from);
  if (kg === undefined) return raw;
  return formatWeightInput(kg, to);
}
