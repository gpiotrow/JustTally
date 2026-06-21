import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { CategoryBadge, DifficultyBadge, Spinner, EmptyState } from '../../components/ui';

export function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const { exercises, loading } = useExercises();
  const exercise = useMemo(() => exercises.find((e) => e.id === id), [exercises, id]);

  if (loading) return <Spinner label="Laden…" />;
  if (!exercise) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title="Übung nicht gefunden" />
      </div>
    );
  }

  const images = exercise.media.filter((m) => m.mediaType === 'image');
  const videos = exercise.media.filter((m) => m.mediaType === 'video');

  return (
    <div className="space-y-5">
      <BackLink />

      <div>
        <h1 className="text-2xl font-bold">{exercise.name}</h1>
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
              alt={m.originalName ?? exercise.name}
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
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Anleitung
        </h2>
        {exercise.instructions ? (
          <p className="whitespace-pre-wrap leading-relaxed text-slate-200">
            {exercise.instructions}
          </p>
        ) : (
          <p className="text-slate-500">Keine Anleitung hinterlegt.</p>
        )}
      </section>

      <Link to="/workout" className="btn-primary w-full">
        Zum Training hinzufügen
      </Link>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-400">
      ‹ Zurück
    </Link>
  );
}
