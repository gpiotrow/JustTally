/**
 * The fixed training-goal taxonomy. Seven tags describing what an exercise
 * is for (strength, mobility, weight loss, ...).
 *
 * These codes are stored in `exercises.goals` and are validated against this
 * list on the server. Adding one means adding a label in all three languages
 * (`goal.<code>` in `i18n/{de,en,es}.ts`).
 *
 * Distinct from `purposeDe/En/Es` on `Exercise`, which remain free-text
 * elaboration — this is the closed tag vocabulary a goal is picked from.
 */
export const GOAL_ITEMS = [
  'weight_loss',
  'mobility',
  'posture',
  'coordination',
  'strength',
  'muscle_gain',
  'rehab_prevention',
] as const;

export type GoalItem = (typeof GOAL_ITEMS)[number];

const GOAL_SET: ReadonlySet<string> = new Set(GOAL_ITEMS);

export function isGoalItem(value: unknown): value is GoalItem {
  return typeof value === 'string' && GOAL_SET.has(value);
}
