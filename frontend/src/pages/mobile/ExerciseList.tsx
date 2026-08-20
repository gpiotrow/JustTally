import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useFavorites } from '../../hooks/useFavorites';
import { CATEGORIES, DIFFICULTIES } from '../../lib/types';
import { EQUIPMENT_ITEMS } from '../../lib/equipment';
import { CategoryBadge, DifficultyBadge, EmptyState, ErrorBanner, Spinner } from '../../components/ui';
import { DumbbellIcon, HeartIcon } from '../../components/icons';
import { FavoriteButton } from '../../components/FavoriteButton';
import { useLanguage, type TKey } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';
import { buildPickerGroups, EMPTY_FILTERS } from '../../lib/exercisePicker';

export function ExerciseList() {
  const { exercises, loading, error, fromCache } = useExercises();
  const { isFavorite, toggle, canToggle, isPending, error: favoriteError } = useFavorites();
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [difficulty, setDifficulty] = useState<string>('all');
  const [equipment, setEquipment] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const candidates = useMemo(
    () => exercises.map((ex) => ({ exercise: ex, name: localizedExercise(ex, lang).name })),
    [exercises, lang]
  );

  // A non-blank query searches the whole catalog; the chips are hidden while
  // searching (below) rather than staying lit for filters this list keeps
  // applying underneath — so the query is passed the empty filter set here,
  // same as it always effectively saw before `buildPickerGroups` grew a
  // filters-during-search rule for the picker's own use.
  const searching = query.trim() !== '';

  // Category/difficulty/equipment/search share the exact matching rules the
  // exercise picker uses — `buildPickerGroups` in 'all' mode is that shared
  // rule set, so this list can't quietly drift from what the picker shows.
  // Favorites-only is applied after: it's a toggle over the result, not one
  // more filter axis the picker's grouping logic needs to know about.
  const filtered = useMemo(() => {
    const groups = buildPickerGroups({
      candidates,
      query,
      mode: 'all',
      muscle: null,
      filters: searching ? EMPTY_FILTERS : { category, difficulty, equipment },
      favoriteIds: new Set<string>(),
      recency: new Map(),
    });
    const items = groups[0]?.items ?? [];
    return favoritesOnly ? items.filter(({ exercise }) => isFavorite(exercise.id)) : items;
  }, [candidates, query, searching, category, difficulty, equipment, favoritesOnly, isFavorite]);

  if (loading) return <Spinner label={t('exercises.loading')} />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('exercises.title')}</h1>
        {fromCache && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {t('exercises.offlineCache')}
          </p>
        )}
      </div>

      {favoriteError && <ErrorBanner message={favoriteError} />}

      <input
        className="input"
        placeholder={t('exercises.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
        {/* Orthogonal to the category chips: favorites narrows whatever category is selected. */}
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
          className={`chip-btn ${favoritesOnly ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted'}`}
        >
          <HeartIcon width={14} height={14} filled={favoritesOnly} />
          {t('favorites.filter')}
        </button>
        {!searching && (
          <>
            <span className="my-1 w-px shrink-0 bg-border" aria-hidden />
            <FilterChip
              active={category === 'all'}
              onClick={() => setCategory('all')}
              label={t('exercises.all')}
            />
            {CATEGORIES.map((c) => (
              <FilterChip
                key={c}
                active={category === c}
                onClick={() => setCategory(c)}
                label={t(`category.${c}` as TKey)}
              />
            ))}
          </>
        )}
      </div>

      {!searching && (
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          <FilterChip
            active={difficulty === 'all'}
            onClick={() => setDifficulty('all')}
            label={t('exercises.allDifficulties')}
          />
          {DIFFICULTIES.map((d) => (
            <FilterChip
              key={d}
              active={difficulty === d}
              onClick={() => setDifficulty(d)}
              label={t(`difficulty.${d}` as TKey)}
            />
          ))}
        </div>
      )}

      {!searching && (
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          <FilterChip
            active={equipment === 'all'}
            onClick={() => setEquipment('all')}
            label={t('exercises.allEquipment')}
          />
          {EQUIPMENT_ITEMS.map((eq) => (
            <FilterChip
              key={eq}
              active={equipment === eq}
              onClick={() => setEquipment(eq)}
              label={t(`equipment.${eq}` as TKey)}
            />
          ))}
        </div>
      )}

      {/* Feedback while scanning three filter rows, not just after: how many
          exercises are left to look through before scrolling to find out. */}
      <p className="text-xs text-fg-subtle">{t('exercises.resultCount', { count: filtered.length })}</p>

      {filtered.length === 0 ? (
        <EmptyState
          title={favoritesOnly ? t('favorites.emptyTitle') : t('exercises.emptyTitle')}
          hint={favoritesOnly ? t('favorites.emptyHint') : t('exercises.emptyHint')}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map(({ exercise, name }) => {
            const cover = exercise.media.find((m) => m.mediaType === 'image');
            const favorite = isFavorite(exercise.id);
            return (
              /*
               * The heart sits beside the Link, not inside it. A <button> nested
               * in an <a> is invalid HTML and reaches the wrong target for
               * keyboard and screen-reader users; keeping them siblings makes
               * the click boundary real rather than something the handler has
               * to undo with preventDefault.
               */
              <li
                key={exercise.id}
                className="card flex items-center gap-1 overflow-hidden pr-2 transition hover:border-fg-subtle/40"
              >
                <Link
                  to={`/exercise/${exercise.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3 transition active:scale-[0.99]"
                >
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    {cover ? (
                      <img
                        src={cover.thumbnailUrl ?? cover.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                        <DumbbellIcon width={24} height={24} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg">{name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <CategoryBadge category={exercise.category} />
                      <DifficultyBadge difficulty={exercise.difficulty} />
                    </div>
                  </div>
                </Link>
                <FavoriteButton
                  favorite={favorite}
                  disabled={!canToggle || isPending(exercise.id)}
                  title={!canToggle ? t('favorites.offlineHint') : undefined}
                  label={favorite ? t('favorites.remove') : t('favorites.add')}
                  onClick={() => toggle(exercise.id)}
                />
                <span className="text-fg-subtle" aria-hidden>
                  ›
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button onClick={onClick} className={`chip-btn ${active ? 'bg-fg text-bg' : 'bg-surface-2 text-fg-muted'}`}>
      {label}
    </button>
  );
}
