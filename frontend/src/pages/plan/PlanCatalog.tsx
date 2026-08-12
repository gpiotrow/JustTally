import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Exercise } from '../../lib/types';
import { localizedExercise } from '../../lib/exerciseText';
import { matchesQuery } from '../../lib/exerciseSearch';
import { CategoryBadge } from '../../components/ui';
import { useLanguage } from '../../i18n';

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

/**
 * Left column: the exercise catalog, each row a drag source. Dropped onto a
 * day it becomes a new routine exercise; dropped onto an existing one it
 * becomes an alternative for it.
 */
export function PlanCatalog({ exercises }: { exercises: Exercise[] }) {
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState('');

  const localized = useMemo(
    () => exercises.map((ex) => ({ ex, name: localizedExercise(ex, lang).name })),
    [exercises, lang]
  );

  const filtered = useMemo(
    () => localized.filter(({ name }) => matchesQuery(name, query)),
    [localized, query]
  );

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="shrink-0 border-b border-border p-3">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('exercises.searchPlaceholder')}
        />
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {filtered.map(({ ex, name }) => (
          <CatalogItem key={ex.id} exercise={ex} name={name} />
        ))}
      </ul>
    </div>
  );
}
