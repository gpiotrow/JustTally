import { describe, it, expect } from 'vitest';
import {
  buildPickerGroups,
  DEFAULT_RECENT_LIMIT,
  EMPTY_FILTERS,
  activeFilterCount,
  type PickableExercise,
  type PickerInput,
  type PickerItem,
} from './exercisePicker';
import type { ExerciseRecency } from './exerciseRecency';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function candidate(
  id: string,
  name: string,
  extras: Partial<PickableExercise> = {}
): PickerItem<PickableExercise> {
  return {
    name,
    exercise: {
      id,
      category: extras.category ?? 'other',
      difficulty: extras.difficulty ?? 'beginner',
      equipment: extras.equipment ?? [],
      musclesPrimary: extras.musclesPrimary ?? [],
      musclesSecondary: extras.musclesSecondary ?? [],
    },
  };
}

const bench = candidate('bench', 'Bankdrücken', {
  category: 'chest',
  difficulty: 'intermediate',
  equipment: ['barbell', 'bench'],
  musclesPrimary: ['chest'],
  musclesSecondary: ['triceps'],
});
const flies = candidate('flies', 'Fliegende', {
  category: 'chest',
  difficulty: 'beginner',
  equipment: ['dumbbell'],
  musclesPrimary: ['chest'],
});
const dips = candidate('dips', 'Dips', {
  category: 'chest',
  difficulty: 'advanced',
  equipment: ['bodyweight'],
  musclesPrimary: ['triceps'],
  musclesSecondary: ['chest'],
});
const squat = candidate('squat', 'Kniebeuge', {
  category: 'legs',
  difficulty: 'intermediate',
  equipment: ['barbell'],
  musclesPrimary: ['quads'],
});
const unclassified = candidate('curl', 'Bíceps Curl', { category: 'arms' });

const ALL = [bench, flies, dips, squat, unclassified];

const recencyEntry = (lastUsedAt: number, count = 1): ExerciseRecency => ({
  lastUsedAt,
  count,
  lastSets: [],
});

function input(overrides: Partial<PickerInput<PickableExercise>> = {}): PickerInput<PickableExercise> {
  return {
    candidates: ALL,
    query: '',
    mode: 'all',
    muscle: null,
    filters: { category: 'all', difficulty: 'all', equipment: 'all' },
    favoriteIds: new Set(),
    recency: new Map(),
    ...overrides,
  };
}

const ids = (items: PickerItem<PickableExercise>[]) => items.map((i) => i.exercise.id);

describe('buildPickerGroups — search', () => {
  it('beats the mode: a query searches the whole catalog', () => {
    const groups = buildPickerGroups(input({ mode: 'forYou', query: 'kniebeuge' }));
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('results');
    expect(ids(groups[0].items)).toEqual(['squat']);
  });

  it('still applies the category filter while searching, unlike the mode', () => {
    // 'kniebeuge' alone would find squat, but squat is 'legs' — filtered out.
    const groups = buildPickerGroups(
      input({ mode: 'all', filters: { ...EMPTY_FILTERS, category: 'chest' }, query: 'kniebeuge' })
    );
    expect(groups).toEqual([]);
  });

  it('ignores the selected muscle while searching', () => {
    const groups = buildPickerGroups(input({ mode: 'muscle', muscle: 'chest', query: 'kniebeuge' }));
    expect(ids(groups[0].items)).toEqual(['squat']);
  });

  it('folds diacritics, so an umlaut-free query still finds the exercise', () => {
    const groups = buildPickerGroups(input({ query: 'bankdrucken' }));
    expect(ids(groups[0].items)).toEqual(['bench']);
  });

  it('returns no group at all when nothing matches', () => {
    expect(buildPickerGroups(input({ query: 'zzz' }))).toEqual([]);
  });

  it('treats a whitespace-only query as no query', () => {
    const groups = buildPickerGroups(input({ mode: 'all', query: '   ' }));
    expect(groups[0].kind).toBe('all');
  });
});

describe('buildPickerGroups — for you', () => {
  it('puts favorites before recently trained exercises', () => {
    const groups = buildPickerGroups(
      input({
        mode: 'forYou',
        favoriteIds: new Set(['squat']),
        recency: new Map([['bench', recencyEntry(NOW)]]),
      })
    );
    expect(groups.map((g) => g.kind)).toEqual(['favorites', 'recent']);
    expect(ids(groups[0].items)).toEqual(['squat']);
    expect(ids(groups[1].items)).toEqual(['bench']);
  });

  it('never lists a favorite twice, even when it was just trained', () => {
    const groups = buildPickerGroups(
      input({
        mode: 'forYou',
        favoriteIds: new Set(['bench']),
        recency: new Map([
          ['bench', recencyEntry(NOW)],
          ['squat', recencyEntry(NOW - DAY)],
        ]),
      })
    );
    expect(ids(groups[0].items)).toEqual(['bench']);
    expect(ids(groups[1].items)).toEqual(['squat']);
  });

  it('sorts both blocks newest first', () => {
    const groups = buildPickerGroups(
      input({
        mode: 'forYou',
        favoriteIds: new Set(['bench', 'squat']),
        recency: new Map([
          ['bench', recencyEntry(NOW - 5 * DAY)],
          ['squat', recencyEntry(NOW)],
          ['dips', recencyEntry(NOW - DAY)],
          ['flies', recencyEntry(NOW - 9 * DAY)],
        ]),
      })
    );
    expect(ids(groups[0].items)).toEqual(['squat', 'bench']);
    expect(ids(groups[1].items)).toEqual(['dips', 'flies']);
  });

  it('sorts a never-trained favorite after the trained ones, by name', () => {
    const groups = buildPickerGroups(
      input({
        mode: 'forYou',
        favoriteIds: new Set(['bench', 'squat', 'flies']),
        recency: new Map([['bench', recencyEntry(NOW)]]),
      })
    );
    expect(ids(groups[0].items)).toEqual(['bench', 'flies', 'squat']);
  });

  it('caps the recent block', () => {
    const many = Array.from({ length: DEFAULT_RECENT_LIMIT + 5 }, (_, i) =>
      candidate(`ex-${i}`, `Übung ${i}`)
    );
    const recency = new Map(many.map((c, i) => [c.exercise.id, recencyEntry(NOW - i * DAY)]));
    const groups = buildPickerGroups(input({ candidates: many, mode: 'forYou', recency }));
    expect(groups[0].items).toHaveLength(DEFAULT_RECENT_LIMIT);
    expect(ids(groups[0].items)[0]).toBe('ex-0');
  });

  it('drops an empty block instead of showing an empty heading', () => {
    const groups = buildPickerGroups(
      input({ mode: 'forYou', recency: new Map([['bench', recencyEntry(NOW)]]) })
    );
    expect(groups.map((g) => g.kind)).toEqual(['recent']);
  });

  it('is empty for someone with no favorites and no history', () => {
    expect(buildPickerGroups(input({ mode: 'forYou' }))).toEqual([]);
  });

  it('ignores history for exercises that are no longer in the catalog', () => {
    const groups = buildPickerGroups(
      input({ mode: 'forYou', recency: new Map([['deleted-exercise', recencyEntry(NOW)]]) })
    );
    expect(groups).toEqual([]);
  });
});

describe('buildPickerGroups — muscle', () => {
  it('lists primary movers before secondary ones', () => {
    const groups = buildPickerGroups(input({ mode: 'muscle', muscle: 'chest' }));
    expect(groups.map((g) => g.kind)).toEqual(['primary', 'secondary']);
    expect(ids(groups[0].items)).toEqual(['bench', 'flies']);
    expect(ids(groups[1].items)).toEqual(['dips']);
  });

  it('never repeats an exercise that is listed on both sides', () => {
    const both = candidate('both', 'Beides', {
      musclesPrimary: ['chest'],
      musclesSecondary: ['chest'],
    });
    const groups = buildPickerGroups(input({ candidates: [both], mode: 'muscle', muscle: 'chest' }));
    expect(groups.map((g) => g.kind)).toEqual(['primary']);
    expect(ids(groups[0].items)).toEqual(['both']);
  });

  it('leaves out exercises whose muscles nobody has maintained', () => {
    const groups = buildPickerGroups(input({ mode: 'muscle', muscle: 'chest' }));
    const listed = groups.flatMap((g) => ids(g.items));
    expect(listed).not.toContain('curl');
  });

  it('is empty for a muscle group nothing trains', () => {
    expect(buildPickerGroups(input({ mode: 'muscle', muscle: 'calves' }))).toEqual([]);
  });

  it('is empty until a muscle is chosen', () => {
    expect(buildPickerGroups(input({ mode: 'muscle', muscle: null }))).toEqual([]);
  });

  it('sorts within a block by name', () => {
    const groups = buildPickerGroups(input({ mode: 'muscle', muscle: 'quads' }));
    expect(ids(groups[0].items)).toEqual(['squat']);
  });
});

describe('buildPickerGroups — all', () => {
  it('returns the whole catalog in catalog order', () => {
    const groups = buildPickerGroups(input({ mode: 'all' }));
    expect(groups.map((g) => g.kind)).toEqual(['all']);
    expect(ids(groups[0].items)).toEqual(['bench', 'flies', 'dips', 'squat', 'curl']);
  });

  it('narrows to one category', () => {
    const groups = buildPickerGroups(input({ mode: 'all', filters: { ...EMPTY_FILTERS, category: 'chest' } }));
    expect(ids(groups[0].items)).toEqual(['bench', 'flies', 'dips']);
  });

  it('returns no group for a category with nothing in it', () => {
    expect(buildPickerGroups(input({ mode: 'all', filters: { ...EMPTY_FILTERS, category: 'cardio' } }))).toEqual([]);
  });

  it('narrows to one difficulty', () => {
    const groups = buildPickerGroups(input({ mode: 'all', filters: { ...EMPTY_FILTERS, difficulty: 'advanced' } }));
    expect(ids(groups[0].items)).toEqual(['dips']);
  });

  it('narrows to one equipment item', () => {
    const groups = buildPickerGroups(input({ mode: 'all', filters: { ...EMPTY_FILTERS, equipment: 'barbell' } }));
    expect(ids(groups[0].items)).toEqual(['bench', 'squat']);
  });

  it('combines category, difficulty, and equipment as independent filters', () => {
    const groups = buildPickerGroups(
      input({
        mode: 'all',
        filters: { category: 'chest', difficulty: 'beginner', equipment: 'dumbbell' },
      })
    );
    expect(ids(groups[0].items)).toEqual(['flies']);
  });

  it('returns no group when the difficulty/equipment combination matches nothing', () => {
    expect(
      buildPickerGroups(input({ mode: 'all', filters: { category: 'all', difficulty: 'beginner', equipment: 'barbell' } }))
    ).toEqual([]);
  });

  it('does not mutate the candidates it was given', () => {
    const candidates = [...ALL];
    buildPickerGroups(input({ candidates, mode: 'muscle', muscle: 'chest' }));
    expect(ids(candidates)).toEqual(['bench', 'flies', 'dips', 'squat', 'curl']);
  });
});

describe('buildPickerGroups — filters apply in every mode', () => {
  it('narrows "for you" by equipment', () => {
    const groups = buildPickerGroups(
      input({
        mode: 'forYou',
        filters: { ...EMPTY_FILTERS, equipment: 'dumbbell' },
        favoriteIds: new Set(['bench', 'flies']),
      })
    );
    // bench takes a barbell, not a dumbbell — filtered out even though favorited.
    expect(groups.map((g) => g.kind)).toEqual(['favorites']);
    expect(ids(groups[0].items)).toEqual(['flies']);
  });

  it('narrows "by muscle" on both the primary and secondary block', () => {
    const groups = buildPickerGroups(
      input({
        mode: 'muscle',
        muscle: 'chest',
        filters: { ...EMPTY_FILTERS, equipment: 'bodyweight' },
      })
    );
    // Only dips (secondary chest mover) is bodyweight; bench/flies (primary) are filtered out.
    expect(groups.map((g) => g.kind)).toEqual(['secondary']);
    expect(ids(groups[0].items)).toEqual(['dips']);
  });

  it('narrows search results too', () => {
    // 'i' alone matches flies, dips, squat and curl — the difficulty filter
    // narrows that down to the one advanced exercise among them.
    const groups = buildPickerGroups(
      input({
        query: 'i',
        filters: { ...EMPTY_FILTERS, difficulty: 'advanced' },
      })
    );
    expect(ids(groups[0].items)).toEqual(['dips']);
  });
});

describe('activeFilterCount', () => {
  it('is zero when nothing is filtered', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each non-"all" axis', () => {
    expect(activeFilterCount({ category: 'chest', difficulty: 'all', equipment: 'all' })).toBe(1);
    expect(activeFilterCount({ category: 'chest', difficulty: 'beginner', equipment: 'barbell' })).toBe(3);
  });
});
