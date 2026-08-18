/**
 * The fixed machine-setting taxonomy. One code per adjustable a machine
 * exercise might expose — an exercise picks which of these it has via
 * `Exercise.settings`, and a logged entry records the value for each via
 * `WorkoutEntry.settings` (a `Record<string, string>`, kept free-text because
 * real machines label their dials "4", "B", or "12 cm" — a numeric type would
 * fail on half of them).
 *
 * These codes are stored in `exercises.settings` and validated against this
 * list on the server, same shape as `equipment`/`goals`.
 */
export const MACHINE_SETTINGS = [
  'seat_height',
  'seat_depth',
  'back_pad',
  'chest_pad',
  'leg_pad',
  'thigh_pad',
  'lever_arm',
  'range_limiter',
  'foot_plate',
  'handle_position',
  'cable_height',
  'bench_angle',
  'safety_pins',
  'resistance_level',
] as const;

export type MachineSetting = (typeof MACHINE_SETTINGS)[number];

const MACHINE_SETTING_SET: ReadonlySet<string> = new Set(MACHINE_SETTINGS);

export function isMachineSetting(value: unknown): value is MachineSetting {
  return typeof value === 'string' && MACHINE_SETTING_SET.has(value);
}
