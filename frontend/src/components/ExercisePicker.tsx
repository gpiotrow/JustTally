import { useMemo, useState, type ReactNode } from 'react';
import { Modal, EmptyState, CategoryBadge } from './ui';
import { FavoriteButton } from './FavoriteButton';
import { CheckIcon, ChevronLeftIcon } from './icons';
import { useFavorites } from '../hooks/useFavorites';
import { useWorkouts } from '../hooks/useWorkouts';
import { useAuth } from '../hooks/useAuth';
import { CATEGORIES, type Exercise } from '../lib/types';
import { MUSCLE_GROUPS, type MuscleGroup } from '../lib/muscles';
import { localizedExercise } from '../lib/exerciseText';
import { exerciseRecency, type ExerciseRecency } from '../lib/exerciseRecency';
import { formatWeightWithUnit, type Unit } from '../lib/units';
import {
  buildPickerGroups,
  type PickerGroup,
  type PickerGroupKind,
  type PickerItem,
  type PickerMode,
} from '../lib/exercisePicker';
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

/** Heading per block; `results` and `all` are the unlabelled flat lists. */
const GROUP_LABEL: Partial<Record<PickerGroupKind, TKey>> = {
  favorites: 'picker.favorites',
  recent: 'picker.recent',
  primary: 'picker.primary',
  secondary: 'picker.secondary',
};

/**
 * Choosing an exercise, from every place the app asks for one.
 *
 * Four ways in, because at the gym there is no single right one: what you
 * already marked or trained ("for you", the default and zero taps), the muscle
 * you came here to train, the whole catalog, and search — which beats whichever
 * mode is active, so there is never a question about what is being searched.
 *
 * The search field deliberately does not autofocus: the keyboard would cover
 * half the list on a phone, and the fast path is a tap on "for you" rather than
 * typing anything at all.
 */
export function ExercisePicker({
  exercises,
  mode,
  onSelect,
  onClose,
  title,
}: ExercisePickerProps) {
  const { lang, t } = useLanguage();
  // Read straight from their own hooks rather than passed in: none of them has
  // a context, and threading them through every caller would put the picker's
  // data needs into pages that do not otherwise care about them.
  const { favoriteIds, isFavorite, toggle, canToggle, isPending } = useFavorites();
  const { sessions } = useWorkouts();
  const { unit } = useAuth();
  const recency = useMemo(() => exerciseRecency(sessions), [sessions]);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PickerMode>('forYou');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [category, setCategory] = useState('all');
  /** Tap order is commit order, so this is a list rather than a set. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const candidates = useMemo<PickerItem<Exercise>[]>(
    () => exercises.map((exercise) => ({ exercise, name: localizedExercise(exercise, lang).name })),
    [exercises, lang]
  );

  const groups = useMemo(
    () =>
      buildPickerGroups({ candidates, query, mode: tab, muscle, category, favoriteIds, recency }),
    [candidates, query, tab, muscle, category, favoriteIds, recency]
  );

  const searching = query.trim() !== '';
  /** The muscle grid stands in for the list until a group is picked. */
  const showingMuscleGrid = tab === 'muscle' && muscle === null && !searching;

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

  /**
   * Switching mode clears the search, because a query overrides the mode: the
   * button would otherwise change a state nothing on screen reflects.
   */
  function switchTab(next: PickerMode) {
    setTab(next);
    setQuery('');
    if (next !== 'muscle') setMuscle(null);
  }

  const toolbar = (
    <div className="space-y-2">
      <input
        className="input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('exercises.searchPlaceholder')}
        aria-label={t('exercises.searchPlaceholder')}
      />
      {/* Dimmed while searching: the mode is still there, it just does not
          decide the list right now. Tapping one brings it back. */}
      <div
        className={`flex gap-1 rounded-xl bg-surface-2 p-1 transition-opacity ${
          searching ? 'opacity-60' : ''
        }`}
      >
        <TabButton active={!searching && tab === 'forYou'} onClick={() => switchTab('forYou')}>
          {t('picker.forYou')}
        </TabButton>
        <TabButton active={!searching && tab === 'muscle'} onClick={() => switchTab('muscle')}>
          {t('picker.muscle')}
        </TabButton>
        <TabButton active={!searching && tab === 'all'} onClick={() => switchTab('all')}>
          {t('exercises.all')}
        </TabButton>
      </div>
      {tab === 'all' && !searching && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <CategoryChip
            active={category === 'all'}
            onClick={() => setCategory('all')}
            label={t('exercises.all')}
          />
          {CATEGORIES.map((c) => (
            <CategoryChip
              key={c}
              active={category === c}
              onClick={() => setCategory(c)}
              label={t(`category.${c}` as TKey)}
            />
          ))}
        </div>
      )}
    </div>
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
      {showingMuscleGrid ? (
        <MuscleGrid onPick={setMuscle} label={(m) => t(`muscle.${m}` as TKey)} />
      ) : (
        <div className="space-y-4">
          {tab === 'muscle' && muscle !== null && !searching && (
            <button
              onClick={() => setMuscle(null)}
              className="flex min-h-11 items-center gap-1 text-sm font-semibold text-accent"
            >
              <ChevronLeftIcon width={16} height={16} />
              {t('picker.allMuscles')}
            </button>
          )}

          {groups.length === 0 ? (
            <PickerEmpty
              tab={tab}
              searching={searching}
              muscle={muscle}
              onShowAll={() => switchTab('all')}
            />
          ) : (
            groups.map((group) => (
              <GroupBlock
                key={group.kind}
                group={group}
                heading={GROUP_LABEL[group.kind] ? t(GROUP_LABEL[group.kind]!) : undefined}
                selectable={mode === 'add'}
                selectedIds={selectedIds}
                onPick={pick}
                recency={recency}
                unit={unit}
                isFavorite={isFavorite}
                onToggleFavorite={toggle}
                canToggleFavorite={canToggle}
                isFavoritePending={isPending}
              />
            ))
          )}
        </div>
      )}
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold transition ${
        active ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The category filter. `.chip` is a label, not a touch target (`py-0.5`), so
 * this is a real button at 44 px rather than the chip class reused.
 */
function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-xs font-medium capitalize transition ${
        active ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * All sixteen groups, including the ones nothing is recorded for — an empty
 * group says something true about the catalog, and hiding it would just move
 * the confusion one step further away.
 *
 * Two columns at 320 px rather than four: four would clear the 44 px target but
 * leave about 64 px of width for labels like "Seitliche Bauchmuskeln".
 */
function MuscleGrid({
  onPick,
  label,
}: {
  onPick: (muscle: MuscleGroup) => void;
  label: (muscle: MuscleGroup) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {MUSCLE_GROUPS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onPick(m)}
          className="min-h-14 rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold text-fg transition hover:bg-border"
        >
          {label(m)}
        </button>
      ))}
    </div>
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
                  className="min-h-11 min-w-11"
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
