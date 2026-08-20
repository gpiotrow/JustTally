import { useDraggable } from '@dnd-kit/core';
import type { Exercise } from '../../lib/types';
import type { PickerGroup } from '../../lib/exercisePicker';
import { GROUP_LABEL } from '../../lib/pickerGroupLabels';
import { useExercisePicker } from '../../hooks/useExercisePicker';
import { ExerciseFilterBar } from '../../components/ExerciseFilterBar';
import { MuscleGrid } from '../../components/MuscleGrid';
import { CategoryBadge, EmptyState } from '../../components/ui';
import { ChevronLeftIcon } from '../../components/icons';
import { useLanguage, type TKey } from '../../i18n';

function CatalogItem({ exercise, name }: { exercise: Exercise; name: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `catalog-${exercise.id}`,
    data: { type: 'catalog', exercise },
  });

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-fg transition active:cursor-grabbing ${
        isDragging ? 'opacity-40' : 'hover:bg-border'
      }`}
    >
      <span className="min-w-0 truncate">{name}</span>
      <CategoryBadge category={exercise.category} />
    </li>
  );
}

function CatalogGroup({ group, heading }: { group: PickerGroup<Exercise>; heading?: string }) {
  return (
    <section className="space-y-1.5">
      {heading && (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{heading}</h3>
      )}
      <ul className="space-y-1.5">
        {group.items.map(({ exercise, name }) => (
          <CatalogItem key={exercise.id} exercise={exercise} name={name} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Left column: the exercise catalog, each row a drag source. Dropped onto a
 * day it becomes a new routine exercise; dropped onto an existing one it
 * becomes an alternative for it.
 *
 * Filtering and grouping run through the same `useExercisePicker` hook and
 * `ExerciseFilterBar` the mobile picker modal uses — this used to be a bare
 * name search with none of the picker's favorites/recent/muscle/filter
 * apparatus, which meant planning a routine on desktop couldn't ask "beginner
 * dumbbell exercises" the way adding one on the phone could.
 */
export function PlanCatalog({ exercises }: { exercises: Exercise[] }) {
  const { t } = useLanguage();
  const picker = useExercisePicker(exercises);

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
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
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {picker.showingMuscleGrid ? (
          <MuscleGrid onPick={picker.setMuscle} label={(m) => t(`muscle.${m}` as TKey)} />
        ) : (
          <>
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
              <EmptyState title={t('exercises.emptyTitle')} hint={t('exercises.emptyHint')} />
            ) : (
              picker.groups.map((group) => (
                <CatalogGroup
                  key={group.kind}
                  group={group}
                  heading={GROUP_LABEL[group.kind] ? t(GROUP_LABEL[group.kind]!) : undefined}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
