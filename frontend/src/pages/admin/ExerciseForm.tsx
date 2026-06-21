import { useRef, useState, type FormEvent } from 'react';
import {
  createExercise,
  updateExercise,
  uploadMedia,
  deleteMedia,
  type ExerciseInput,
} from '../../api/exercises';
import { CATEGORIES, type Difficulty, type Exercise } from '../../lib/types';
import { ErrorBanner } from '../../components/ui';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

/**
 * Create or edit an exercise, including media upload.
 * For new exercises the media section unlocks after the first save.
 */
export function ExerciseForm({
  initial,
  onSaved,
}: {
  initial: Exercise | null;
  onSaved: (saved: Exercise) => void;
}) {
  const [current, setCurrent] = useState<Exercise | null>(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'other');
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'beginner');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const input: ExerciseInput = { name: name.trim(), category, difficulty, instructions };
    try {
      const res = current
        ? await updateExercise(current.id, input)
        : await createExercise(input);
      setCurrent(res.exercise);
      onSaved(res.exercise);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!current || !e.target.files?.length) return;
    setError(null);
    setUploading(true);
    try {
      let latest = current;
      for (const file of Array.from(e.target.files)) {
        const res = await uploadMedia(current.id, file);
        latest = res.exercise;
      }
      setCurrent(latest);
      onSaved(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeMedia(mediaId: string) {
    if (!current) return;
    try {
      const res = await deleteMedia(current.id, mediaId);
      setCurrent(res.exercise);
      onSaved(res.exercise);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label className="label" htmlFor="ex-name">Name</label>
          <input
            id="ex-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="ex-cat">Kategorie</label>
            <select
              id="ex-cat"
              className="input capitalize"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ex-diff">Schwierigkeit</label>
            <select
              id="ex-diff"
              className="input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ex-inst">Anleitung</label>
          <textarea
            id="ex-inst"
            className="input min-h-32 resize-y"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Schritt-für-Schritt Anleitung…"
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? 'Speichern…' : current ? 'Änderungen speichern' : 'Übung erstellen'}
        </button>
      </form>

      <div className="border-t border-ink-700 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Fotos &amp; Videos
          </h3>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-ghost px-3 py-1.5 text-xs"
            disabled={!current || uploading}
            title={!current ? 'Zuerst die Übung speichern' : ''}
          >
            {uploading ? 'Hochladen…' : '+ Hochladen'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={onPickFiles}
          />
        </div>

        {!current ? (
          <p className="text-sm text-slate-500">
            Speichere die Übung zuerst, um Medien hinzuzufügen.
          </p>
        ) : current.media.length === 0 ? (
          <p className="text-sm text-slate-500">Noch keine Medien.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {current.media.map((m) => (
              <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl bg-ink-900">
                {m.mediaType === 'image' ? (
                  <img src={m.thumbnailUrl ?? m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">🎬</div>
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(m.id)}
                  className="absolute right-1 top-1 rounded-lg bg-black/70 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
