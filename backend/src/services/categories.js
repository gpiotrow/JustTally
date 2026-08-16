/**
 * The fixed category taxonomy, mirroring `frontend/src/lib/types.ts`'s
 * `CATEGORIES`. Unlike `equipment`/`muscles`/`goals`, a category is a single
 * scalar per exercise, not a list — so only a single-value validator is
 * needed here.
 */
export const CATEGORIES = [
  'chest',
  'back',
  'legs',
  'calves',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'other',
];

const CATEGORY_SET = new Set(CATEGORIES);

export function isValidCategory(value) {
  return typeof value === 'string' && CATEGORY_SET.has(value);
}
