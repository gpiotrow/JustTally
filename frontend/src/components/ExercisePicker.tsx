import { useState } from 'react';
import { Modal, EmptyState, CategoryBadge } from './ui';
import { ExerciseFilterBar } from './ExerciseFilterBar';
import { FavoriteButton } from './FavoriteButton';
import { CheckIcon, ChevronLeftIcon } from './icons';
import { useExercisePicker } from '../hooks/useExercisePicker';
import { type Exercise } from '../lib/types';
import { type MuscleGroup } from '../lib/muscles';
import { type ExerciseRecency } from '../lib/exerciseRecency';
import { formatWeightWithUnit, type Unit } from '../lib/units';
import { type PickerGroup, type PickerMode } from '../lib/exercisePicker';
import { GROUP_LABEL } from '../lib/pickerGroupLabels';
import { MuscleGrid } from './MuscleGrid';
import { useLanguage, type TKey } from '../i18n';

/**
 * How a pick is committed.
 *
 * `'add'` collects several exercises and commits them with one tap on the
 * footer — adding three exercises to a workout is one intent, not three trips
 * through the dialog. `'single'` commits on the first tap and closes: replacing
 * an exercise or choosing an alternative has exactly one answer, and a footer
 * would only ask for a confirmation nobody needs.
 */
export type ExercisePickerMode = 'add' | 'single';

export interface ExercisePickerProps {
  /**
   * The catalog to choose from. A prop rather than an own `useExercises()`
   * call: every caller already holds the list, and refetching it on open would
   * buy nothing.
   */
  exercises: Exercise[];
  mode: ExercisePickerMode;
  /**
   * Always at least one exercise, in the order they were tapped. `'single'`
   * always passes exactly one.
   */
  onSelect: (picked: Exercise[]) => void;
  onClose: () => void;
  /** Defaults to the shared "choose exercise" title. */
  title?: string;
}

/**
 * Choosing an exercise, from every place the app asks for one.
 *
 * Four ways in, because at the gym there is no single right one: what you
 * already marked or trained ("for you", the default and zero taps), the muscle
 * you came here to train, the whole catalog, and search — which beats whichever
 * mode is active, so there is never a question about what is being searched.
 * Category/difficulty/equipment are filters that cut across all four rather
 * than a fifth mode — narrowing "for you" to "dumbbell" is a real question
 * someone at the gym asks, not just narrowing "all".
 *
 * The search field deliberately does not autofocus: the keyboard would cover
 * half the list on a phone, and the fast path is a tap on "for you" rather than
 * typing anything at all.
 *
 * State and grouping logic live in `useExercisePicker` — the same hook backs
 * the desktop planner's catalog column (`pages/plan/PlanCatalog.tsx`), so the
 * two surfaces can't drift into different rules for what "for you" or a
 * filter means.
 */
export function ExercisePicker({
  exercises,
  mode,
  onSelect,
  onClose,
  title,
}: ExercisePickerProps) {
  const { t } = useLanguage();
  const picker = useExercisePicker(exercises);
  const { favorites } = picker;

  /** Tap order is commit order, so this is a list rather than a set. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function commit(picked: Exercise[]) {
    if (picked.length === 0) return;
    onSelect(picked);
    onClose();
  }

  function pick(exercise: Exercise) {
    if (mode === 'single') {
      commit([exercise]);
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(exercise.id) ? prev.filter((id) => id !== exercise.id) : [...prev, exercise.id]
    );
  }

  function commitSelection() {
    const byId = new Map(exercises.map((ex) => [ex.id, ex]));
    commit(selectedIds.map((id) => byId.get(id)).filter((ex): ex is Exercise => ex !== undefined));
  }

  const toolbar = (
    <ExerciseFilterBar
      query={picker.query}
      onQueryChange={picker.setQuery}
      tab={picker.tab}
      onTabChange={picker.switchTab}
      searching={picker.searching}
      filters={picker.filters}
      onFilterChange={picker.setFilter}
      onResetFilters={picker.resetFilters}
      activeFilters={picker.activeFilters}
      filterCount={picker.filterCount}
      resultCount={picker.resultCount}
    />
  );

  const footer =
    mode === 'add' && selectedIds.length > 0 ? (
      <button onClick={commitSelection} className="btn-primary w-full">
        {t('picker.add', { count: selectedIds.length })}
      </button>
    ) : undefined;

  return (
    <Modal
      title={title ?? t('workout.pickTitle')}
      onClose={onClose}
      toolbar={toolbar}
      footer={footer}
    >
      {picker.showingMuscleGrid ? (
        <MuscleGrid onPick={picker.setMuscle} label={(m) => t(`muscle.${m}` as TKey)} />
      ) : (
        <div className="space-y-4">
          {picker.tab === 'muscle' && picker.muscle !== null && !picker.searching && (
            <button
              onClick={() => picker.setMuscle(null)}
              className="flex min-h-11 items-center gap-1 text-sm font-semibold text-accent"
            >
              <ChevronLeftIcon width={16} height={16} />
              {t('picker.allMuscles')}
            </button>
          )}

          {picker.groups.length === 0 ? (
            <PickerEmpty
              tab={picker.tab}
              searching={picker.searching}
              muscle={picker.muscle}
              onShowAll={() => picker.switchTab('all')}
            />
          ) : (
            picker.groups.map((group) => (
              <GroupBlock
                key={group.kind}
                group={group}
                heading={GROUP_LABEL[group.kind] ? t(GROUP_LABEL[group.kind]!) : undefined}
                selectable={mode === 'add'}
                selectedIds={selectedIds}
                onPick={pick}
                recency={picker.recency}
                unit={picker.unit}
                isFavorite={favorites.isFavorite}
                onToggleFavorite={favorites.toggle}
                canToggleFavorite={favorites.canToggle}
                isFavoritePending={favorites.isPending}
              />
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * "3×8 · 80 kg" — set count plus the last set's reps and weight, not every set
 * spelled out. This is a glance on the way to picking the exercise, not the
 * full history that `History.tsx` already shows in detail.
 */
function formatLastSetsHint(recency: ExerciseRecency | undefined, unit: Unit): string | null {
  if (!recency || recency.lastSets.length === 0) return null;
  const last = recency.lastSets[recency.lastSets.length - 1];
  const reps = `${recency.lastSets.length}×${last.reps}`;
  return last.weight != null ? `${reps} · ${formatWeightWithUnit(last.weight, unit)}` : reps;
}

function GroupBlock({
  group,
  heading,
  selectable,
  selectedIds,
  onPick,
  recency,
  unit,
  isFavorite,
  onToggleFavorite,
  canToggleFavorite,
  isFavoritePending,
}: {
  group: PickerGroup<Exercise>;
  heading?: string;
  selectable: boolean;
  selectedIds: string[];
  onPick: (exercise: Exercise) => void;
  recency: ReadonlyMap<string, ExerciseRecency>;
  unit: Unit;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  canToggleFavorite: boolean;
  isFavoritePending: (id: string) => boolean;
}) {
  const { t } = useLanguage();
  return (
    <section className="space-y-2">
      {heading && (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{heading}</h3>
      )}
      <ul className="space-y-2">
        {group.items.map(({ exercise, name }) => {
          const selected = selectedIds.includes(exercise.id);
          const hint = formatLastSetsHint(recency.get(exercise.id), unit);
          const favorite = isFavorite(exercise.id);
          return (
            <li key={exercise.id}>
              <div
                className={`flex min-h-14 items-center gap-1 rounded-xl border pr-2 transition ${
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-transparent bg-surface-2 hover:bg-border'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPick(exercise)}
                  {...(selectable ? { 'aria-pressed': selected } : {})}
                  className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left text-fg"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{name}</span>
                    {hint && <span className="block truncate text-xs text-fg-subtle">{hint}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <CategoryBadge category={exercise.category} />
                    {selectable && selected && (
                      <CheckIcon width={18} height={18} className="text-accent" />
                    )}
                  </span>
                </button>
                <FavoriteButton
                  favorite={favorite}
                  disabled={!canToggleFavorite || isFavoritePending(exercise.id)}
                  title={!canToggleFavorite ? t('favorites.offlineHint') : undefined}
                  label={favorite ? t('favorites.remove') : t('favorites.add')}
                  onClick={() => onToggleFavorite(exercise.id)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Nothing to show — which of the three reasons it is decides what helps. */
function PickerEmpty({
  tab,
  searching,
  muscle,
  onShowAll,
}: {
  tab: PickerMode;
  searching: boolean;
  muscle: MuscleGroup | null;
  onShowAll: () => void;
}) {
  const { t } = useLanguage();

  if (searching) {
    return <EmptyState title={t('picker.noResults')} hint={t('picker.noResultsHint')} />;
  }
  if (tab === 'muscle' && muscle !== null) {
    return <EmptyState title={t('picker.muscleEmpty')} />;
  }
  if (tab === 'forYou') {
    return (
      <div className="space-y-3">
        <EmptyState title={t('picker.forYouEmptyTitle')} hint={t('picker.forYouEmptyHint')} />
        <button onClick={onShowAll} className="btn-ghost w-full text-sm">
          {t('picker.showAll')}
        </button>
      </div>
    );
  }
  return <EmptyState title={t('exercises.emptyTitle')} hint={t('exercises.emptyHint')} />;
}
