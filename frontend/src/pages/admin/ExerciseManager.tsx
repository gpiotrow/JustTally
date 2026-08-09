import { useEffect, useRef, useState } from 'react';
import {
  listExercises,
  deleteExercise,
  unarchiveExercise,
  bulkDeleteExercises,
  bulkUploadMedia,
  importExercises,
  csvTemplate,
  type ImportResult,
  type MediaBulkResult,
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
import { useLanguage, type TKey } from '../../i18n';
import { localizedExercise } from '../../lib/exerciseText';

/** Map a bulk-upload skip reason code to its translation key. */
const UNMATCHED_REASON_KEY: Record<string, TKey> = {
  no_leading_number: 'admin.ex.unmatchedReason.noLeadingNumber',
  no_exercise_for_number: 'admin.ex.unmatchedReason.noExercise',
  unsupported_type: 'admin.ex.unmatchedReason.unsupportedType',
  processing_error: 'admin.ex.unmatchedReason.processingError',
};

export function ExerciseManager() {
  const { lang, t } = useLanguage();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Non-error feedback, e.g. "archived instead of deleted, still in use". */
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exercise | null | undefined>(undefined); // undefined = closed
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [overwriteImport, setOverwriteImport] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaResult, setMediaResult] = useState<MediaBulkResult | null>(null);
  const [overwriteMedia, setOverwriteMedia] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      // Archived exercises are part of the admin view — they are hidden from the
      // app's catalog, not from the person managing it.
      const res = await listExercises(true);
      setExercises(res.exercises);
      setSelectedIds(new Set());
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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === exercises.length ? new Set() : new Set(exercises.map((e) => e.id))
    );
  }

  async function handleDelete(ex: Exercise) {
    const name = localizedExercise(ex, lang).name;
    if (!confirm(t('admin.ex.deleteConfirm', { name }))) return;
    setError(null);
    setNotice(null);
    try {
      const res = await deleteExercise(ex.id);
      if (res.archived) {
        // Still referenced, so it was archived rather than removed. Reload
        // instead of dropping the row: it is still there, just archived now.
        setNotice(
          t('admin.ex.archivedInstead', {
            name,
            workouts: res.usage.workouts,
            users: res.usage.users,
          })
        );
        await load();
        return;
      }
      setExercises((prev) => prev.filter((e) => e.id !== ex.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(ex.id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.deleteError'));
    }
  }

  async function handleUnarchive(ex: Exercise) {
    setError(null);
    setNotice(null);
    try {
      const res = await unarchiveExercise(ex.id);
      handleSaved(res.exercise);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.unarchiveError'));
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(t('admin.ex.bulkDeleteConfirm', { count: ids.length }))) return;
    setDeletingBulk(true);
    setError(null);
    setNotice(null);
    try {
      const res = await bulkDeleteExercises(ids);
      if (res.archived > 0) {
        setNotice(t('admin.ex.bulkArchivedInstead', { archived: res.archived, deleted: res.deleted }));
      }
      // Archived ones stay in the list (flagged), so re-read rather than assuming
      // every selected exercise is gone.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.deleteError'));
    } finally {
      setDeletingBulk(false);
    }
  }

  async function onPickCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImporting(true);
    try {
      const result = await importExercises(file, overwriteImport);
      setImportResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.error'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onPickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setError(null);
    setUploadingMedia(true);
    try {
      const result = await bulkUploadMedia(files, overwriteMedia);
      setMediaResult(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.bulkUploadError'));
    } finally {
      setUploadingMedia(false);
      if (mediaRef.current) mediaRef.current.value = '';
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

  const allSelected = exercises.length > 0 && selectedIds.size === exercises.length;

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
            onClick={() => mediaRef.current?.click()}
            className="btn-ghost"
            disabled={uploadingMedia}
          >
            {uploadingMedia ? t('admin.ex.bulkUploading') : t('admin.ex.bulkUpload')}
          </button>
          <input
            ref={mediaRef}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={onPickMedia}
          />
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

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-xs font-medium text-accent hover:underline"
        >
          {t('admin.ex.template')}
        </button>
        <span className="text-xs text-fg-subtle">{t('admin.ex.bulkUploadHint')}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-fg-muted">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={overwriteMedia}
            onChange={(e) => setOverwriteMedia(e.target.checked)}
          />
          {t('admin.ex.overwriteMedia')}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={overwriteImport}
            onChange={(e) => setOverwriteImport(e.target.checked)}
          />
          {t('admin.ex.overwriteImport')}
        </label>
      </div>

      {error && <ErrorBanner message={error} />}
      {notice && (
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-fg-muted">
          {notice}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-2">
          <span className="text-sm text-fg">
            {t('admin.ex.selected', { count: selectedIds.size })}
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="btn-danger px-3 py-1.5 text-xs"
            disabled={deletingBulk}
          >
            {deletingBulk ? t('common.loading') : t('admin.ex.deleteSelected', { count: selectedIds.size })}
          </button>
        </div>
      )}

      {loading ? (
        <Spinner label={t('common.loading')} />
      ) : exercises.length === 0 ? (
        <EmptyState title={t('admin.ex.emptyTitle')} hint={t('admin.ex.emptyHint')} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={t('admin.ex.selectAll')}
                    checked={allSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3">{t('admin.ex.colRef')}</th>
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
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={localizedExercise(ex, lang).name}
                      checked={selectedIds.has(ex.id)}
                      onChange={() => toggleSelected(ex.id)}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-fg-muted">{ex.ref}</td>
                  <td className="px-4 py-3 font-medium text-fg">
                    {localizedExercise(ex, lang).name}
                    {ex.archived && (
                      <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-normal text-fg-muted">
                        {t('admin.ex.archived')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3"><CategoryBadge category={ex.category} /></td>
                  <td className="px-4 py-3"><DifficultyBadge difficulty={ex.difficulty} /></td>
                  <td className="px-4 py-3 text-fg-muted">{ex.media.length}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(ex)} className="btn-ghost px-3 py-1.5 text-xs">
                        {t('common.edit')}
                      </button>
                      {ex.archived ? (
                        <button
                          onClick={() => handleUnarchive(ex)}
                          className="btn-ghost px-3 py-1.5 text-xs"
                        >
                          {t('admin.ex.unarchive')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDelete(ex)}
                          className="btn-danger px-3 py-1.5 text-xs"
                        >
                          {t('common.delete')}
                        </button>
                      )}
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
              {importResult.updated > 0 && (
                <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  {t('import.updated', { count: importResult.updated })}
                </span>
              )}
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

      {mediaResult && (
        <Modal title={t('admin.ex.bulkResultTitle')} onClose={() => setMediaResult(null)}>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {t('admin.ex.assigned', { count: mediaResult.assigned.length })}
              </span>
              {mediaResult.unmatched.length > 0 && (
                <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  {t('admin.ex.unmatched', { count: mediaResult.unmatched.length })}
                </span>
              )}
            </div>
            {mediaResult.clearedExerciseIds.length > 0 && (
              <p className="text-fg-muted">
                {t('admin.ex.mediaOverwritten', { count: mediaResult.clearedExerciseIds.length })}
              </p>
            )}
            {mediaResult.unmatched.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-fg">{t('admin.ex.unmatchedTitle')}</p>
                <ul className="space-y-1 text-fg-muted">
                  {mediaResult.unmatched.map((u) => (
                    <li key={u.filename}>
                      {u.filename} — {t(UNMATCHED_REASON_KEY[u.reason] ?? 'admin.ex.unmatchedReason.processingError')}
                    </li>
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
