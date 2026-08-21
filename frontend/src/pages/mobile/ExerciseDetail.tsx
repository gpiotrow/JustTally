import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useFavorites } from '../../hooks/useFavorites';
import { getExercise } from '../../api/exercises';
import { CategoryBadge, DifficultyBadge, TrackingBadge, Spinner, EmptyState, ErrorBanner } from '../../components/ui';
import { useLanguage, type TKey } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';
import { FavoriteButton } from '../../components/FavoriteButton';
import { ImageLightbox } from '../../components/ImageLightbox';
import { exerciseTracking, exerciseSettings, type Exercise } from '../../lib/types';
import { ChevronLeftIcon } from '../../components/icons';

export function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const { exercises, loading } = useExercises();
  const {
    isFavorite,
    toggle: toggleFavorite,
    canToggle,
    isPending,
    error: favoriteError,
  } = useFavorites();
  const { lang, t } = useLanguage();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
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

  const { name, instructions } = localizedExercise(exercise, lang);
  const images = exercise.media.filter((m) => m.mediaType === 'image');
  const videos = exercise.media.filter((m) => m.mediaType === 'video');

  return (
    <div className="space-y-5">
      <BackLink />

      {favoriteError && <ErrorBanner message={favoriteError} />}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CategoryBadge category={exercise.category} />
            <DifficultyBadge difficulty={exercise.difficulty} />
            <TrackingBadge tracking={exerciseTracking(exercise)} />
            {exercise.equipment.map((item) => (
              <span key={item} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                {t(`equipment.${item}` as TKey)}
              </span>
            ))}
            {exercise.archived && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                {t('detail.archived')}
              </span>
            )}
          </div>
        </div>
        <FavoriteButton
          favorite={isFavorite(exercise.id)}
          disabled={!canToggle || isPending(exercise.id)}
          title={!canToggle ? t('favorites.offlineHint') : undefined}
          label={isFavorite(exercise.id) ? t('favorites.remove') : t('favorites.add')}
          onClick={() => toggleFavorite(exercise.id)}
        />
      </div>

      {images.length > 0 && (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto pb-1">
          {images.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="flex-shrink-0 snap-center"
            >
              {/* Fixed box rather than `w-auto`: the browser knows the size
                  before the image loads, so the scroller doesn't jump as
                  each photo comes in — `object-cover` fills it regardless of
                  the source photo's own aspect ratio. */}
              <img
                src={m.url}
                alt={m.originalName ?? name}
                loading="lazy"
                width={160}
                height={224}
                className="h-56 w-40 cursor-zoom-in rounded-2xl object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images.map((m) => ({ url: m.url, alt: m.originalName ?? name }))}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
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

      {exercise.goals.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('detail.goals')}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {exercise.goals.map((item) => (
              <span key={item} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                {t(`goal.${item}` as TKey)}
              </span>
            ))}
          </div>
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

      {exerciseSettings(exercise).length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('detail.settings')}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {exerciseSettings(exercise).map((code) => (
              <span key={code} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                {t(`setting.${code}` as TKey)}
              </span>
            ))}
          </div>
        </section>
      )}

      <Link to={`/exercise/${exercise.id}/stats`} className="btn-ghost w-full">
        {t('detail.viewStats')}
      </Link>

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
      <ChevronLeftIcon width={16} height={16} /> {t('detail.back')}
    </Link>
  );
}
