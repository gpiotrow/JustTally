import { useEffect, useState } from 'react';
import { listExercises, deleteExercise, unarchiveExercise, bulkDeleteExercises } from '../../../api/exercises';
import type { Exercise } from '../../../lib/types';
import { CategoryBadge, DifficultyBadge, EmptyState, ErrorBanner, Modal, Spinner } from '../../../components/ui';
import { ExerciseForm } from '../ExerciseForm';
import { ImportPanel } from './ImportPanel';
import { MediaBulkPanel } from './MediaBulkPanel';
import { useLanguage } from '../../../i18n';
import { localizedExercise } from '../../../lib/exerciseText';

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

  const allSelected = exercises.length > 0 && selectedIds.size === exercises.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.ex.title')}</h1>
          <p className="text-sm text-fg-muted">{t('admin.ex.subtitle')}</p>
        </div>
        <button onClick={() => setEditing(null)} className="btn-primary">
          {t('admin.ex.new')}
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-surface-2/50 p-3">
        <ImportPanel onImported={load} />
        <MediaBulkPanel onUploaded={load} />
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
    </div>
  );
}
