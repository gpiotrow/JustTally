/**
 * The fixed machine-setting taxonomy, mirroring
 * `frontend/src/lib/machineSettings.ts` — same shape as `equipment.js`/
 * `goals.js` (allow-list + validators shared across route validation and CSV
 * import so a code accepted in one path can't be rejected in another).
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
];

const MACHINE_SETTING_SET = new Set(MACHINE_SETTINGS);

export function isMachineSetting(value) {
  return typeof value === 'string' && MACHINE_SETTING_SET.has(value);
}

/**
 * A settings list is valid when it is an array of known codes with no
 * duplicates — same rule as `isValidEquipmentList`.
 */
export function isValidMachineSettingList(value) {
  if (!Array.isArray(value)) return false;
  if (!value.every(isMachineSetting)) return false;
  return new Set(value).size === value.length;
}

/**
 * Normalize whatever a row holds into a plain array of codes. jsonb comes
 * back parsed, but a row written before this column existed reads as `null`.
 */
export function readMachineSettingList(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * A settings *values* object (`WorkoutEntry.settings` / a CSV `settings`
 * cell once parsed) is valid when every key is a known code and every value
 * is a string — unknown keys are dropped rather than rejected wholesale,
 * the same "reject the row, not the file" latitude `filterValid` uses
 * elsewhere, since a value object travels inside a larger entry/session.
 */
export function isValidSettingsValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([k, v]) => isMachineSetting(k) && typeof v === 'string');
}
