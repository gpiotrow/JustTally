import type { PickerGroupKind } from './exercisePicker';
import type { TKey } from '../i18n';

/**
 * Heading per group block; `results` and `all` are the unlabelled flat lists.
 * Shared between `ExercisePicker` (the modal) and `PlanCatalog` (the desktop
 * planner's drag source column) so the two surfaces never end up with two
 * different names for the same block.
 */
export const GROUP_LABEL: Partial<Record<PickerGroupKind, TKey>> = {
  favorites: 'picker.favorites',
  recent: 'picker.recent',
  primary: 'picker.primary',
  secondary: 'picker.secondary',
};
