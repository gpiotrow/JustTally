/**
 * The fixed training-goal taxonomy, mirroring `frontend/src/lib/goals.ts` —
 * same shape as `equipment.js`/`muscles.js` (allow-list + validators shared
 * across route validation and CSV import so a code accepted in one path
 * can't be rejected in another).
 *
 * Distinct from `purpose_de/en/es`, which remain free-text elaboration —
 * this is the closed tag vocabulary a training goal is picked from.
 */
export const GOAL_ITEMS = [
  'weight_loss',
  'mobility',
  'posture',
  'coordination',
  'strength',
  'muscle_gain',
  'rehab_prevention',
];

const GOAL_SET = new Set(GOAL_ITEMS);

export function isGoalItem(value) {
  return typeof value === 'string' && GOAL_SET.has(value);
}

/**
 * A goal list is valid when it is an array of known codes with no
 * duplicates — same rule as `isValidEquipmentList`.
 */
export function isValidGoalList(value) {
  if (!Array.isArray(value)) return false;
  if (!value.every(isGoalItem)) return false;
  return new Set(value).size === value.length;
}

/**
 * Normalize whatever a row holds into a plain array of codes. jsonb comes
 * back parsed, but a row written before this column existed reads as `null`.
 */
export function readGoalList(value) {
  return Array.isArray(value) ? value : [];
}
