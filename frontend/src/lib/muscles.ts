/**
 * The fixed muscle-group taxonomy (§ 2.4). Sixteen groups, chosen to match
 * what the body map can actually draw as separate paths — a finer taxonomy
 * would be data nobody can maintain and a picture nobody can read.
 *
 * These codes are stored in `exercises.muscles_primary` / `muscles_secondary`
 * and are validated against this list on the server. Adding one means adding
 * a label in all three languages and a path on the body map.
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
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

const MUSCLE_SET: ReadonlySet<string> = new Set(MUSCLE_GROUPS);

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === 'string' && MUSCLE_SET.has(value);
}

/**
 * Which side of the body map a group is drawn on. `rear_delts` and `traps`
 * are visible from behind; everything else follows the obvious anatomy.
 */
export const MUSCLE_VIEW: Record<MuscleGroup, 'front' | 'back'> = {
  chest: 'front',
  lats: 'back',
  traps: 'back',
  lower_back: 'back',
  front_delts: 'front',
  side_delts: 'front',
  rear_delts: 'back',
  biceps: 'front',
  triceps: 'back',
  forearms: 'front',
  abs: 'front',
  obliques: 'front',
  glutes: 'back',
  quads: 'front',
  hamstrings: 'back',
  calves: 'back',
};

/**
 * How long a group is modelled as still recovering, in hours.
 *
 * Large groups get 72 h, small ones 48 h — the usual training-frequency rule
 * of thumb, not a physiological measurement. The whole model is volume
 * bookkeeping (§ 11.4), and this constant is the crudest part of it.
 */
export const RECOVERY_WINDOW_HOURS: Record<MuscleGroup, number> = {
  chest: 72,
  lats: 72,
  traps: 48,
  lower_back: 72,
  front_delts: 48,
  side_delts: 48,
  rear_delts: 48,
  biceps: 48,
  triceps: 48,
  forearms: 48,
  abs: 48,
  obliques: 48,
  glutes: 72,
  quads: 72,
  hamstrings: 72,
  calves: 48,
};
