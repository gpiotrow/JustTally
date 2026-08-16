/**
 * The fixed equipment taxonomy, mirroring `frontend/src/lib/equipment.ts` —
 * same shape as `muscles.js` (allow-list + validators shared across route
 * validation and CSV import so a code accepted in one path can't be rejected
 * in another).
 */
export const EQUIPMENT_ITEMS = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'ez_bar',
  'bench',
  'incline_bench',
  'cable_machine',
  'machine',
  'smith_machine',
  'pull_up_bar',
  'resistance_band',
  'mat',
  'swiss_ball',
  'bodyweight',
];

const EQUIPMENT_SET = new Set(EQUIPMENT_ITEMS);

export function isEquipmentItem(value) {
  return typeof value === 'string' && EQUIPMENT_SET.has(value);
}

/**
 * An equipment list is valid when it is an array of known codes with no
 * duplicates — same rule as `isValidMuscleList`.
 */
export function isValidEquipmentList(value) {
  if (!Array.isArray(value)) return false;
  if (!value.every(isEquipmentItem)) return false;
  return new Set(value).size === value.length;
}

/**
 * Normalize whatever a row holds into a plain array of codes. jsonb comes
 * back parsed, but a row written before this column existed reads as `null`.
 */
export function readEquipmentList(value) {
  return Array.isArray(value) ? value : [];
}
