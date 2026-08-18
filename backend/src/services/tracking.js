/**
 * The fixed tracking-mode taxonomy, mirroring `frontend/src/lib/tracking.ts` —
 * same shape as `equipment.js`/`goals.js` (allow-list + validator shared
 * across route validation and CSV import).
 */
export const TRACKING_MODES = [
  'reps_weight',
  'reps',
  'time',
  'time_weight',
  'distance_time',
];

const TRACKING_MODE_SET = new Set(TRACKING_MODES);

export function isTrackingMode(value) {
  return typeof value === 'string' && TRACKING_MODE_SET.has(value);
}
