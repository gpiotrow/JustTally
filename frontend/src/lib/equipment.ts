/**
 * The fixed equipment taxonomy. Fourteen items, one code per piece of gear
 * an exercise requires (or `bodyweight` for none).
 *
 * These codes are stored in `exercises.equipment` and are validated against
 * this list on the server. Adding one means adding a label in all three
 * languages (`equipment.<code>` in `i18n/{de,en,es}.ts`).
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
] as const;

export type EquipmentItem = (typeof EQUIPMENT_ITEMS)[number];

const EQUIPMENT_SET: ReadonlySet<string> = new Set(EQUIPMENT_ITEMS);

export function isEquipmentItem(value: unknown): value is EquipmentItem {
  return typeof value === 'string' && EQUIPMENT_SET.has(value);
}
