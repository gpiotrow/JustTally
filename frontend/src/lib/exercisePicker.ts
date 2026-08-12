import { matchesQuery } from './exerciseSearch';
import type { ExerciseRecency } from './exerciseRecency';
import type { MuscleGroup } from './muscles';

/**
 * What the exercise picker shows, as data.
 *
 * The three entry points ("for you", by muscle, everything) and the search that
 * cuts across them are one decision each, and every one of them is a rule about
 * ordering and deduplication rather than about markup — so they live here,
 * where they can be tested without a DOM.
 */

/** The three entry points. Search overrides whichever one is active. */
export type PickerMode = 'forYou' | 'muscle' | 'all';

/**
 * Why a block of rows is on screen. The component turns this into a heading;
 * keeping it a code rather than a string keeps translations out of `lib/`.
 */
export type PickerGroupKind = 'favorites' | 'recent' | 'primary' | 'secondary' | 'results' | 'all';

/** The little an exercise has to expose to be grouped — `Exercise` satisfies it. */
export interface PickableExercise {
  id: string;
  category: string;
  musclesPrimary: readonly string[];
  musclesSecondary: readonly string[];
}

/**
 * One row: the exercise plus its name in the active language.
 *
 * The name is resolved by the caller, once per exercise, rather than in here
 * per comparison — and it keeps `lib/` free of a language parameter.
 */
export interface PickerItem<T extends PickableExercise> {
  exercise: T;
  name: string;
}

export interface PickerGroup<T extends PickableExercise> {
  kind: PickerGroupKind;
  items: PickerItem<T>[];
}

export interface PickerInput<T extends PickableExercise> {
  /** The whole catalog, in the order it should appear when nothing reorders it. */
  candidates: PickerItem<T>[];
  query: string;
  mode: PickerMode;
  /** Which muscle group is open in `'muscle'` mode; `null` means none yet. */
  muscle: MuscleGroup | null;
  /** Category filter in `'all'` mode: a category code, or `'all'`. */
  category: string;
  favoriteIds: ReadonlySet<string>;
  recency: ReadonlyMap<string, ExerciseRecency>;
  recentLimit?: number;
}

/**
 * How many recently trained exercises "for you" offers.
 *
 * Ten covers the usual repertoire without turning the fast path back into a
 * scrolling job; anything older is a search or a muscle group away.
 */
export const DEFAULT_RECENT_LIMIT = 10;

const byName = <T extends PickableExercise>(a: PickerItem<T>, b: PickerItem<T>) =>
  a.name.localeCompare(b.name);

/**
 * Newest first, never-trained last, ties broken by name so the order is stable
 * from one open to the next.
 */
function byRecency<T extends PickableExercise>(recency: PickerInput<T>['recency']) {
  return (a: PickerItem<T>, b: PickerItem<T>) => {
    const aAt = recency.get(a.exercise.id)?.lastUsedAt;
    const bAt = recency.get(b.exercise.id)?.lastUsedAt;
    if (aAt !== bAt) {
      if (aAt === undefined) return 1;
      if (bAt === undefined) return -1;
      return bAt - aAt;
    }
    return byName(a, b);
  };
}

/** Drops the blocks that would render as a heading over nothing. */
function nonEmpty<T extends PickableExercise>(groups: PickerGroup<T>[]): PickerGroup<T>[] {
  return groups.filter((group) => group.items.length > 0);
}

/**
 * The labelled blocks to render, in display order.
 *
 * Rules, in the order they apply:
 *
 * - **Search beats the mode.** A non-blank query searches the entire catalog and
 *   returns one flat block — no category, no muscle, no favorites split. Anything
 *   else means guessing which subset was searched.
 * - **"For you"** is favorites first, then recently trained, deduplicated
 *   against the favorites: an exercise appears once, in the block that says the
 *   most about it.
 * - **By muscle** lists the primary movers, then the secondaries below them.
 *   Exercises with no muscles recorded do not appear at all — an unmaintained
 *   row is honestly absent rather than quietly guessed at.
 * - **Everything** is the plain catalog, narrowed by the category chips.
 */
export function buildPickerGroups<T extends PickableExercise>(
  input: PickerInput<T>
): PickerGroup<T>[] {
  const { candidates, mode, muscle, category, favoriteIds, recency } = input;
  const query = input.query.trim();

  if (query !== '') {
    return nonEmpty([
      { kind: 'results', items: candidates.filter((item) => matchesQuery(item.name, query)) },
    ]);
  }

  if (mode === 'forYou') {
    const favorites = candidates
      .filter((item) => favoriteIds.has(item.exercise.id))
      .sort(byRecency(recency));
    const recent = candidates
      .filter((item) => recency.has(item.exercise.id) && !favoriteIds.has(item.exercise.id))
      .sort(byRecency(recency))
      .slice(0, input.recentLimit ?? DEFAULT_RECENT_LIMIT);
    return nonEmpty([
      { kind: 'favorites', items: favorites },
      { kind: 'recent', items: recent },
    ]);
  }

  if (mode === 'muscle') {
    if (!muscle) return [];
    const primary = candidates
      .filter((item) => item.exercise.musclesPrimary.includes(muscle))
      .sort(byName);
    const primaryIds = new Set(primary.map((item) => item.exercise.id));
    const secondary = candidates
      .filter(
        (item) =>
          item.exercise.musclesSecondary.includes(muscle) && !primaryIds.has(item.exercise.id)
      )
      .sort(byName);
    return nonEmpty([
      { kind: 'primary', items: primary },
      { kind: 'secondary', items: secondary },
    ]);
  }

  const items =
    category === 'all'
      ? [...candidates]
      : candidates.filter((item) => item.exercise.category === category);
  return nonEmpty([{ kind: 'all', items }]);
}
