/**
 * The fixed muscle-group taxonomy (§ 2.4), mirroring
 * `frontend/src/lib/muscles.ts`.
 *
 * Shared rather than redeclared per file — unlike `VALID_DIFFICULTY`, which
 * is three values and duplicated between the route and the CSV importer,
 * this is sixteen codes needed in three places (route validation, CSV import,
 * backfill script). A silent divergence between copies would let a code
 * through in one path and reject it in another, and the symptom would be a
 * muscle that never lights up on the heatmap.
 */
export const MUSCLE_GROUPS = [
  'chest',
  'lats',
  'traps',
  'lower_back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
];

const MUSCLE_SET = new Set(MUSCLE_GROUPS);

export function isMuscleGroup(value) {
  return typeof value === 'string' && MUSCLE_SET.has(value);
}

/**
 * A muscle list is valid when it is an array of known codes with no
 * duplicates. Duplicates are rejected rather than silently deduplicated:
 * they mean the caller built the list wrong, and volume would otherwise be
 * charged to the same muscle twice.
 */
export function isValidMuscleList(value) {
  if (!Array.isArray(value)) return false;
  if (!value.every(isMuscleGroup)) return false;
  return new Set(value).size === value.length;
}

/**
 * Normalize whatever a row holds into a plain array of codes. jsonb comes
 * back parsed, but a row written before these columns existed reads as
 * `null`.
 */
export function readMuscleList(value) {
  return Array.isArray(value) ? value : [];
}
