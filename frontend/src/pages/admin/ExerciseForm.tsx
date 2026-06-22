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
import { VideoIcon } from '../../components/icons';
import { useT, type TKey } from '../../i18n';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

/**
 * Create or edit an exercise (bilingual: German + English), including media upload.
 * For new exercises the media section unlocks after the first save.
 */
export function ExerciseForm({
  initial,
  onSaved,
}: {
  initial: Exercise | null;
  onSaved: (saved: Exercise) => void;
}) {
  const t = useT();
  const [current, setCurrent] = useState<Exercise | null>(initial);
  const [nameDe, setNameDe] = useState(initial?.nameDe ?? '');
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'other');
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'beginner');
  const [instructionsDe, setInstructionsDe] = useState(initial?.instructionsDe ?? '');
  const [instructionsEn, setInstructionsEn] = useState(initial?.instructionsEn ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nameDe.trim() && !nameEn.trim()) {
      setError(t('form.nameRequired'));
      return;
    }
    setSaving(true);
    const input: ExerciseInput = {
      nameDe: nameDe.trim(),
      nameEn: nameEn.trim(),
      instructionsDe,
      instructionsEn,
      category,
      difficulty,
    };
    try {
      const res = current
        ? await updateExercise(current.id, input)
        : await createExercise(input);
      setCurrent(res.exercise);
      onSaved(res.exercise);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.saveError'));
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
      setError(err instanceof Error ? err.message : t('form.uploadError'));
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
      setError(err instanceof Error ? err.message : t('form.deleteError'));
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ex-name-de">{t('form.nameDe')}</label>
            <input
              id="ex-name-de"
              className="input"
              value={nameDe}
              onChange={(e) => setNameDe(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ex-name-en">{t('form.nameEn')}</label>
            <input
              id="ex-name-en"
              className="input"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="ex-cat">{t('form.category')}</label>
            <select
              id="ex-cat"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`category.${c}` as TKey)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ex-diff">{t('form.difficulty')}</label>
            <select
              id="ex-diff"
              className="input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{t(`difficulty.${d}` as TKey)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ex-inst-de">{t('form.instructionsDe')}</label>
          <textarea
            id="ex-inst-de"
            className="input min-h-28 resize-y"
            value={instructionsDe}
            onChange={(e) => setInstructionsDe(e.target.value)}
            placeholder={t('form.instructionsPlaceholder')}
          />
        </div>
        <div>
          <label className="label" htmlFor="ex-inst-en">{t('form.instructionsEn')}</label>
          <textarea
            id="ex-inst-en"
            className="input min-h-28 resize-y"
            value={instructionsEn}
            onChange={(e) => setInstructionsEn(e.target.value)}
            placeholder={t('form.instructionsPlaceholder')}
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? t('form.saving') : current ? t('form.saveChanges') : t('form.create')}
        </button>
      </form>

      <div className="border-t border-border pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('form.media')}
          </h3>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-ghost px-3 py-1.5 text-xs"
            disabled={!current || uploading}
            title={!current ? t('form.saveFirst') : ''}
          >
            {uploading ? t('form.uploading') : t('form.upload')}
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
          <p className="text-sm text-fg-subtle">{t('form.saveFirstHint')}</p>
        ) : current.media.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t('form.noMedia')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {current.media.map((m) => (
              <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-2">
                {m.mediaType === 'image' ? (
                  <img src={m.thumbnailUrl ?? m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                    <VideoIcon width={32} height={32} />
                  </div>
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
