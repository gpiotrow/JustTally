import { useMemo, useState } from 'react';
import { useFavorites } from './useFavorites';
import { useWorkouts } from './useWorkouts';
import { useAuth } from './useAuth';
import type { Exercise } from '../lib/types';
import { localizedExercise } from '../lib/exerciseText';
import { exerciseRecency } from '../lib/exerciseRecency';
import {
  buildPickerGroups,
  EMPTY_FILTERS,
  activeFilterCount,
  type PickerFilters,
  type PickerGroup,
  type PickerItem,
  type PickerMode,
} from '../lib/exercisePicker';
import { MuscleGroup } from '../lib/muscles';
import { useLanguage, type TKey } from '../i18n';

/** One active filter, ready to render as a removable chip. */
export interface ActiveFilterChip {
  axis: keyof PickerFilters;
  label: string;
  onRemove: () => void;
}

/**
 * The exercise-selection state every caller (the workout/routine picker
 * modal, the desktop planner's catalog column) needs — pulled out of
 * `ExercisePicker.tsx` so the modal and the drag-and-drop column can share it
 * instead of drifting into two rulesets for the same filters and groups.
 *
 * Query, tab, muscle, and the three filter axes all live here; `filters`
 * intentionally survives a tab switch or a search — only `switchTab` still
 * clears `query` and (leaving `'muscle'`) `muscle`, exactly as the modal did
 * before filters existed.
 */
export function useExercisePicker(exercises: Exercise[]) {
  const { lang, t } = useLanguage();
  // Read straight from their own hooks rather than passed in: none of them
  // has a context, and threading them through every caller would put the
  // picker's data needs into pages that do not otherwise care about them.
  const favorites = useFavorites();
  const { sessions } = useWorkouts();
  const { unit } = useAuth();
  const recency = useMemo(() => exerciseRecency(sessions), [sessions]);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PickerMode>('forYou');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [filters, setFilters] = useState<PickerFilters>(EMPTY_FILTERS);

  const candidates = useMemo<PickerItem<Exercise>[]>(
    () => exercises.map((exercise) => ({ exercise, name: localizedExercise(exercise, lang).name })),
    [exercises, lang]
  );

  const groups = useMemo<PickerGroup<Exercise>[]>(
    () =>
      buildPickerGroups({
        candidates,
        query,
        mode: tab,
        muscle,
        filters,
        favoriteIds: favorites.favoriteIds,
        recency,
      }),
    [candidates, query, tab, muscle, filters, favorites.favoriteIds, recency]
  );

  const searching = query.trim() !== '';
  /** The muscle grid stands in for the list until a group is picked. */
  const showingMuscleGrid = tab === 'muscle' && muscle === null && !searching;
  const resultCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  /**
   * Switching tab clears the search, because a query overrides the tab: the
   * button would otherwise change a state nothing on screen reflects. Filters
   * are unaffected — they narrow every tab, so there is nothing to reset.
   */
  function switchTab(next: PickerMode) {
    setTab(next);
    setQuery('');
    if (next !== 'muscle') setMuscle(null);
  }

  function setFilter<K extends keyof PickerFilters>(axis: K, value: PickerFilters[K]) {
    setFilters((prev) => ({ ...prev, [axis]: value }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const activeFilters: ActiveFilterChip[] = (
    [
      ['category', `category.${filters.category}` as TKey],
      ['difficulty', `difficulty.${filters.difficulty}` as TKey],
      ['equipment', `equipment.${filters.equipment}` as TKey],
    ] as const
  )
    .filter(([axis]) => filters[axis] !== 'all')
    .map(([axis, key]) => ({
      axis,
      label: t(key),
      onRemove: () => setFilter(axis, 'all'),
    }));

  return {
    query,
    setQuery,
    tab,
    switchTab,
    muscle,
    setMuscle,
    filters,
    setFilter,
    resetFilters,
    activeFilters,
    filterCount: activeFilterCount(filters),
    groups,
    searching,
    showingMuscleGrid,
    resultCount,
    recency,
    unit,
    favorites,
  };
}

export type ExercisePickerState = ReturnType<typeof useExercisePicker>;
