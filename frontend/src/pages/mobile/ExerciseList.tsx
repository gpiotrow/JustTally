import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { CATEGORIES } from '../../lib/types';
import { CategoryBadge, DifficultyBadge, EmptyState, ErrorBanner, Spinner } from '../../components/ui';

export function ExerciseList() {
  const { exercises, loading, error, fromCache } = useExercises();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesQuery = ex.name.toLowerCase().includes(query.toLowerCase());
      const matchesCat = category === 'all' || ex.category === category;
      return matchesQuery && matchesCat;
    });
  }, [exercises, query, category]);

  if (loading) return <Spinner label="Übungen laden…" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Übungen</h1>
        {fromCache && (
          <p className="mt-1 text-xs text-amber-300">Offline — zwischengespeicherte Daten</p>
        )}
      </div>

      <input
        className="input"
        placeholder="Übung suchen…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={category === 'all'} onClick={() => setCategory('all')} label="Alle" />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
            label={c}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Keine Übungen gefunden" hint="Passe Suche oder Filter an." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((ex) => {
            const cover = ex.media.find((m) => m.mediaType === 'image');
            return (
              <li key={ex.id}>
                <Link
                  to={`/exercise/${ex.id}`}
                  className="card flex items-center gap-3 overflow-hidden p-3 active:bg-ink-700/60"
                >
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-ink-700">
                    {cover ? (
                      <img
                        src={cover.thumbnailUrl ?? cover.url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">
                        🏋️
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-100">{ex.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <CategoryBadge category={ex.category} />
                      <DifficultyBadge difficulty={ex.difficulty} />
                    </div>
                  </div>
                  <span className="text-slate-500">›</span>
                </Link>
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
    <button
      onClick={onClick}
      className={`chip shrink-0 capitalize ${
        active ? 'bg-accent text-white' : 'bg-ink-800 text-slate-300'
      }`}
    >
      {label}
    </button>
  );
}
