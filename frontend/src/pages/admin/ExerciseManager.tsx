import { useEffect, useRef, useState } from 'react';
import {
  listExercises,
  deleteExercise,
  importExercises,
  csvTemplate,
  type ImportResult,
} from '../../api/exercises';
import type { Exercise } from '../../lib/types';
import {
  CategoryBadge,
  DifficultyBadge,
  EmptyState,
  ErrorBanner,
  Modal,
  Spinner,
} from '../../components/ui';
import { ExerciseForm } from './ExerciseForm';
import { useLanguage } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';

export function ExerciseManager() {
  const { lang, t } = useLanguage();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exercise | null | undefined>(undefined); // undefined = closed
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await listExercises();
      setExercises(res.exercises);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.loadError'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleSaved(saved: Exercise) {
    setExercises((prev) => {
      const exists = prev.some((e) => e.id === saved.id);
      const next = exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function handleDelete(ex: Exercise) {
    const name = localizedExercise(ex, lang).name;
    if (!confirm(t('admin.ex.deleteConfirm', { name }))) return;
    try {
      await deleteExercise(ex.id);
      setExercises((prev) => prev.filter((e) => e.id !== ex.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.deleteError'));
    }
  }

  async function onPickCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const result = await importExercises(file);
      setImportResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.error'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function downloadTemplate() {
    const blob = new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'just-tally-exercises.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.ex.title')}</h1>
          <p className="text-sm text-fg-muted">{t('admin.ex.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-ghost"
            disabled={importing}
          >
            {importing ? t('admin.ex.importing') : t('admin.ex.import')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={onPickCsv}
          />
          <button onClick={() => setEditing(null)} className="btn-primary">
            {t('admin.ex.new')}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={downloadTemplate}
        className="text-xs font-medium text-accent hover:underline"
      >
        {t('admin.ex.template')}
      </button>

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner label={t('common.loading')} />
      ) : exercises.length === 0 ? (
        <EmptyState title={t('admin.ex.emptyTitle')} hint={t('admin.ex.emptyHint')} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3">{t('common.name')}</th>
                <th className="px-4 py-3">{t('admin.ex.colCategory')}</th>
                <th className="px-4 py-3">{t('admin.ex.colDifficulty')}</th>
                <th className="px-4 py-3">{t('admin.ex.colMedia')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {exercises.map((ex) => (
                <tr key={ex.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-fg">
                    {localizedExercise(ex, lang).name}
                  </td>
                  <td className="px-4 py-3"><CategoryBadge category={ex.category} /></td>
                  <td className="px-4 py-3"><DifficultyBadge difficulty={ex.difficulty} /></td>
                  <td className="px-4 py-3 text-fg-muted">{ex.media.length}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(ex)} className="btn-ghost px-3 py-1.5 text-xs">
                        {t('common.edit')}
                      </button>
                      <button onClick={() => handleDelete(ex)} className="btn-danger px-3 py-1.5 text-xs">
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <Modal
          title={editing ? t('admin.ex.editTitle') : t('admin.ex.newTitle')}
          onClose={() => setEditing(undefined)}
        >
          <ExerciseForm initial={editing} onSaved={handleSaved} />
        </Modal>
      )}

      {importResult && (
        <Modal title={t('import.resultTitle')} onClose={() => setImportResult(null)}>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {t('import.imported', { count: importResult.imported })}
              </span>
              {importResult.skipped > 0 && (
                <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  {t('import.skipped', { count: importResult.skipped })}
                </span>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-fg">{t('import.errorsTitle')}</p>
                <ul className="space-y-1 text-fg-muted">
                  {importResult.errors.map((e) => (
                    <li key={e.row}>{t('import.rowError', { row: e.row, message: e.message })}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
