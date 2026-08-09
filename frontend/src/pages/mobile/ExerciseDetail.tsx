import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { getExercise } from '../../api/exercises';
import { CategoryBadge, DifficultyBadge, Spinner, EmptyState } from '../../components/ui';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';
import type { Exercise } from '../../lib/types';

export function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const { exercises, loading } = useExercises();
  const { lang, t } = useLanguage();
  const fromList = useMemo(() => exercises.find((e) => e.id === id), [exercises, id]);

  // Archived exercises are absent from the catalog listing, but history still
  // links to them — fetch by id so those links keep resolving.
  const [fetched, setFetched] = useState<Exercise | null>(null);
  const [fetching, setFetching] = useState(false);
  useEffect(() => {
    if (loading || fromList || !id) return;
    let cancelled = false;
    setFetching(true);
    getExercise(id)
      .then((res) => {
        if (!cancelled) setFetched(res.exercise);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, loading, fromList]);

  const exercise = fromList ?? fetched;

  if (loading || fetching) return <Spinner label={t('common.loading')} />;
  if (!exercise) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title={t('detail.notFound')} />
      </div>
    );
  }

  const { name, instructions, purpose } = localizedExercise(exercise, lang);
  const images = exercise.media.filter((m) => m.mediaType === 'image');
  const videos = exercise.media.filter((m) => m.mediaType === 'video');

  return (
    <div className="space-y-5">
      <BackLink />

      <div>
        <h1 className="text-2xl font-bold">{name}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <CategoryBadge category={exercise.category} />
          <DifficultyBadge difficulty={exercise.difficulty} />
          {exercise.archived && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
              {t('detail.archived')}
            </span>
          )}
        </div>
      </div>

      {images.length > 0 && (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto pb-1">
          {images.map((m) => (
            <img
              key={m.id}
              src={m.url}
              alt={m.originalName ?? name}
              loading="lazy"
              className="h-56 w-auto flex-shrink-0 snap-center rounded-2xl object-cover"
            />
          ))}
        </div>
      )}

      {videos.map((m) => (
        <video
          key={m.id}
          src={m.url}
          controls
          playsInline
          className="w-full rounded-2xl bg-black"
        />
      ))}

      {purpose && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('detail.purpose')}
          </h2>
          <p className="whitespace-pre-wrap leading-relaxed text-fg">{purpose}</p>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {t('detail.instructions')}
        </h2>
        {instructions ? (
          <p className="whitespace-pre-wrap leading-relaxed text-fg">{instructions}</p>
        ) : (
          <p className="text-fg-subtle">{t('detail.noInstructions')}</p>
        )}
      </section>

      <Link to="/workout" className="btn-primary w-full">
        {t('detail.addToWorkout')}
      </Link>
    </div>
  );
}

function BackLink() {
  const t = useLanguage().t;
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
      ‹ {t('detail.back')}
    </Link>
  );
}
