import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  createExercise,
  updateExercise,
  uploadMedia,
  deleteMedia,
  reorderMedia,
  type ExerciseInput,
} from '../../api/exercises';
import { CATEGORIES, type Difficulty, type Exercise } from '../../lib/types';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../lib/muscles';
import { EQUIPMENT_ITEMS, type EquipmentItem } from '../../lib/equipment';
import { GOAL_ITEMS, type GoalItem } from '../../lib/goals';
import { TRACKING_MODES, type TrackingMode } from '../../lib/tracking';
import { MACHINE_SETTINGS, type MachineSetting } from '../../lib/machineSettings';
import { CloseIcon } from '../../components/icons';
import { ErrorBanner } from '../../components/ui';
import { VideoIcon } from '../../components/icons';
import { useT, type Lang, type TKey } from '../../i18n';

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];
const LANGS: Lang[] = ['de', 'en', 'es'];
const LANG_KEY: Record<Lang, TKey> = { de: 'form.langDe', en: 'form.langEn', es: 'form.langEs' };

/**
 * Create or edit an exercise (trilingual: German, English, Spanish), including
 * media upload. For new exercises the media section unlocks after the first save.
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
  const [activeLang, setActiveLang] = useState<Lang>('de');
  const [name, setName] = useState<Record<Lang, string>>({
    de: initial?.nameDe ?? '',
    en: initial?.nameEn ?? '',
    es: initial?.nameEs ?? '',
  });
  const [instructions, setInstructions] = useState<Record<Lang, string>>({
    de: initial?.instructionsDe ?? '',
    en: initial?.instructionsEn ?? '',
    es: initial?.instructionsEs ?? '',
  });
  const [category, setCategory] = useState(initial?.category ?? 'other');
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'beginner');
  const [ref, setRef] = useState(initial?.ref != null ? String(initial.ref) : '');
  const [musclesPrimary, setMusclesPrimary] = useState<MuscleGroup[]>(initial?.musclesPrimary ?? []);
  const [musclesSecondary, setMusclesSecondary] = useState<MuscleGroup[]>(
    initial?.musclesSecondary ?? []
  );
  const [equipment, setEquipment] = useState<EquipmentItem[]>(initial?.equipment ?? []);
  const [goals, setGoals] = useState<GoalItem[]>(initial?.goals ?? []);
  const [tracking, setTracking] = useState<TrackingMode>(initial?.tracking ?? 'reps_weight');
  const [settings, setSettings] = useState<MachineSetting[]>(initial?.settings ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** A tab is flagged when its name — the one required field per language — is empty. */
  function isTabIncomplete(lang: Lang) {
    return !name[lang].trim();
  }

  /**
   * Toggle one muscle in the primary list, removing it from the secondary
   * list if it was there. A muscle listed twice would be charged 1.0 *and*
   * 0.5 of the exercise's volume by the recovery model — so the two lists
   * are kept mutually exclusive here rather than left to catch later.
   */
  function togglePrimary(muscle: MuscleGroup) {
    setMusclesPrimary((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]
    );
    setMusclesSecondary((prev) => prev.filter((m) => m !== muscle));
  }

  function toggleSecondary(muscle: MuscleGroup) {
    setMusclesSecondary((prev) =>
      prev.includes(muscle) ? prev.filter((m) => m !== muscle) : [...prev, muscle]
    );
    setMusclesPrimary((prev) => prev.filter((m) => m !== muscle));
  }

  function toggleEquipment(item: EquipmentItem) {
    setEquipment((prev) => (prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]));
  }

  function toggleGoal(item: GoalItem) {
    setGoals((prev) => (prev.includes(item) ? prev.filter((g) => g !== item) : [...prev, item]));
  }

  function toggleSetting(item: MachineSetting) {
    setSettings((prev) => (prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.de.trim() && !name.en.trim() && !name.es.trim()) {
      setError(t('form.nameRequired'));
      return;
    }
    setSaving(true);
    const input: ExerciseInput = {
      nameDe: name.de.trim(),
      nameEn: name.en.trim(),
      nameEs: name.es.trim(),
      instructionsDe: instructions.de,
      instructionsEn: instructions.en,
      instructionsEs: instructions.es,
      category,
      difficulty,
      ref: ref.trim() ? Number(ref) : undefined,
      musclesPrimary,
      musclesSecondary,
      equipment,
      goals,
      tracking,
      settings,
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

  /**
   * Drag-and-drop reorder. Applied optimistically so the grid does not jump
   * back to the old order while the request is in flight, then rolled back
   * on failure since a silently-wrong cover image would otherwise go unnoticed.
   */
  async function moveMedia(fromIndex: number, toIndex: number) {
    if (!current || fromIndex === toIndex) return;
    const before = current.media;
    const reordered = [...before];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setReorderError(null);
    setCurrent({ ...current, media: reordered });
    try {
      const res = await reorderMedia(current.id, reordered.map((m) => m.id));
      setCurrent(res.exercise);
      onSaved(res.exercise);
    } catch (err) {
      setCurrent({ ...current, media: before });
      setReorderError(err instanceof Error ? err.message : t('admin.ex.reorderError'));
    }
  }

  function onDragStart(index: number) {
    return (e: DragEvent<HTMLDivElement>) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
    };
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  function onDrop(index: number) {
    return (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (dragIndex !== null) moveMedia(dragIndex, index);
      setDragIndex(null);
    };
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div>
          <label className="label" htmlFor="ex-ref">{t('form.refNumber')}</label>
          <input
            id="ex-ref"
            type="number"
            min={1}
            className="input"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={t('form.refNumberPlaceholder')}
          />
          <p className="mt-1 text-xs text-fg-subtle">{t('form.refNumberHint')}</p>
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
          <label className="label" htmlFor="ex-tracking">{t('form.tracking')}</label>
          <select
            id="ex-tracking"
            className="input"
            value={tracking}
            onChange={(e) => setTracking(e.target.value as TrackingMode)}
          >
            {TRACKING_MODES.map((mode) => (
              <option key={mode} value={mode}>{t(`tracking.${mode}` as TKey)}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg-subtle">{t('form.trackingHint')}</p>
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">{t('form.muscles')}</h3>
            <p className="mt-1 text-xs text-fg-subtle">{t('form.musclesHint')}</p>
          </div>
          <MusclePicker
            legend={t('form.musclesPrimary')}
            selected={musclesPrimary}
            onToggle={togglePrimary}
            t={t}
          />
          <MusclePicker
            legend={t('form.musclesSecondary')}
            selected={musclesSecondary}
            onToggle={toggleSecondary}
            t={t}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">{t('form.equipment')}</h3>
            <p className="mt-1 text-xs text-fg-subtle">{t('form.equipmentHint')}</p>
          </div>
          <EquipmentPicker selected={equipment} onToggle={toggleEquipment} t={t} />
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">{t('form.goals')}</h3>
            <p className="mt-1 text-xs text-fg-subtle">{t('form.goalsHint')}</p>
          </div>
          <GoalPicker selected={goals} onToggle={toggleGoal} t={t} />
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">{t('form.settings')}</h3>
            <p className="mt-1 text-xs text-fg-subtle">{t('form.settingsHint')}</p>
          </div>
          <SettingsPicker selected={settings} onToggle={toggleSetting} t={t} />
        </div>

        <div className="rounded-xl border border-border">
          <div role="tablist" className="flex border-b border-border">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={activeLang === l}
                onClick={() => setActiveLang(l)}
                className={`flex-1 px-3 py-2 text-sm font-semibold transition first:rounded-tl-xl last:rounded-tr-xl ${
                  activeLang === l
                    ? 'bg-surface-2 text-fg'
                    : 'text-fg-subtle hover:text-fg-muted'
                }`}
              >
                {t(LANG_KEY[l])}
                {isTabIncomplete(l) && (
                  <span
                    className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
                    title={t('form.langIncomplete')}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="space-y-4 p-4">
            <div>
              <label className="label" htmlFor="ex-name">{t('form.name')}</label>
              <input
                id="ex-name"
                className="input"
                value={name[activeLang]}
                onChange={(e) => setName({ ...name, [activeLang]: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="ex-instructions">{t('form.instructions')}</label>
              <textarea
                id="ex-instructions"
                className="input min-h-28 resize-y"
                value={instructions[activeLang]}
                onChange={(e) => setInstructions({ ...instructions, [activeLang]: e.target.value })}
                placeholder={t('form.instructionsPlaceholder')}
              />
            </div>
          </div>
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

        {reorderError && <ErrorBanner message={reorderError} />}

        {!current ? (
          <p className="text-sm text-fg-subtle">{t('form.saveFirstHint')}</p>
        ) : current.media.length === 0 ? (
          <p className="text-sm text-fg-subtle">{t('form.noMedia')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {current.media.map((m, i) => (
              <div
                key={m.id}
                draggable
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver}
                onDrop={onDrop(i)}
                className={`group relative aspect-square cursor-move overflow-hidden rounded-xl border bg-surface-2 transition ${
                  dragIndex === i ? 'opacity-40' : 'border-border'
                }`}
              >
                {m.mediaType === 'image' ? (
                  <img src={m.thumbnailUrl ?? m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                    <VideoIcon width={32} height={32} />
                  </div>
                )}
                {i === 0 && (
                  <span className="absolute left-1 top-1 rounded-lg bg-black/70 px-2 py-0.5 text-xs text-white">
                    {t('admin.ex.cover')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(m.id)}
                  className="absolute right-1 top-1 rounded-lg bg-black/70 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100"
                >
                  <CloseIcon width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One labelled row of muscle chips; selection is a plain toggle per chip. */
function MusclePicker({
  legend,
  selected,
  onToggle,
  t,
}: {
  legend: string;
  selected: MuscleGroup[];
  onToggle: (muscle: MuscleGroup) => void;
  t: (key: TKey) => string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {MUSCLE_GROUPS.map((m) => {
          const active = selected.includes(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => onToggle(m)}
              aria-pressed={active}
              className={`min-h-8 rounded-lg border px-2.5 text-xs font-medium transition ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-fg-muted hover:bg-surface-2'
              }`}
            >
              {t(`muscle.${m}` as TKey)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One row of equipment chips; selection is a plain toggle per chip. */
function EquipmentPicker({
  selected,
  onToggle,
  t,
}: {
  selected: EquipmentItem[];
  onToggle: (item: EquipmentItem) => void;
  t: (key: TKey) => string;
}) {
  return (
    <fieldset>
      <div className="flex flex-wrap gap-1.5">
        {EQUIPMENT_ITEMS.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              aria-pressed={active}
              className={`min-h-8 rounded-lg border px-2.5 text-xs font-medium transition ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-fg-muted hover:bg-surface-2'
              }`}
            >
              {t(`equipment.${item}` as TKey)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One row of machine-setting chips; selection is a plain toggle per chip. */
function SettingsPicker({
  selected,
  onToggle,
  t,
}: {
  selected: MachineSetting[];
  onToggle: (item: MachineSetting) => void;
  t: (key: TKey) => string;
}) {
  return (
    <fieldset>
      <div className="flex flex-wrap gap-1.5">
        {MACHINE_SETTINGS.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              aria-pressed={active}
              className={`min-h-8 rounded-lg border px-2.5 text-xs font-medium transition ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-fg-muted hover:bg-surface-2'
              }`}
            >
              {t(`setting.${item}` as TKey)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** One row of training-goal chips; selection is a plain toggle per chip. */
function GoalPicker({
  selected,
  onToggle,
  t,
}: {
  selected: GoalItem[];
  onToggle: (item: GoalItem) => void;
  t: (key: TKey) => string;
}) {
  return (
    <fieldset>
      <div className="flex flex-wrap gap-1.5">
        {GOAL_ITEMS.map((item) => {
          const active = selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              aria-pressed={active}
              className={`min-h-8 rounded-lg border px-2.5 text-xs font-medium transition ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-fg-muted hover:bg-surface-2'
              }`}
            >
              {t(`goal.${item}` as TKey)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
