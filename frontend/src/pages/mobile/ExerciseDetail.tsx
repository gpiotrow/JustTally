import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { CategoryBadge, DifficultyBadge, Spinner, EmptyState } from '../../components/ui';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';

export function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const { exercises, loading } = useExercises();
  const { lang, t } = useLanguage();
  const exercise = useMemo(() => exercises.find((e) => e.id === id), [exercises, id]);

  if (loading) return <Spinner label={t('common.loading')} />;
  if (!exercise) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title={t('detail.notFound')} />
      </div>
    );
  }

  const { name, instructions } = localizedExercise(exercise, lang);
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
