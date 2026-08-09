import { useRef, useState } from 'react';
import {
  previewImport,
  importExercises,
  downloadExerciseCsv,
  csvTemplate,
  type ImportMode,
  type ImportResult,
} from '../../../api/exercises';
import { ErrorBanner, Modal } from '../../../components/ui';
import { useT } from '../../../i18n';

const IMPORT_MODES: ImportMode[] = ['merge', 'upsert', 'replace'];

/**
 * CSV import: pick a mode, preview what it would do (mandatory for `replace`,
 * since that mode can archive a large slice of the catalog in one go), then
 * confirm to actually run it.
 */
export function ImportPanel({ onImported }: { onImported: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<ImportMode>('merge');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPendingFile(file);
    setPreviewing(true);
    try {
      setPreview(await previewImport(file, mode));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.previewError'));
      setPendingFile(null);
    } finally {
      setPreviewing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!pendingFile) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await importExercises(pendingFile, mode, false);
      setPreview(null);
      setPendingFile(null);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.error'));
    } finally {
      setConfirming(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setPendingFile(null);
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

  async function onExport() {
    setError(null);
    setExporting(true);
    try {
      await downloadExerciseCsv();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.exportError'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input w-auto py-1.5 text-xs"
        value={mode}
        onChange={(e) => setMode(e.target.value as ImportMode)}
        aria-label={t('import.mode')}
      >
        {IMPORT_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`import.mode.${m}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="btn-ghost"
        disabled={previewing}
      >
        {previewing ? t('import.previewing') : t('admin.ex.import')}
      </button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onPickCsv} />
      <button type="button" onClick={downloadTemplate} className="text-xs font-medium text-accent hover:underline">
        {t('admin.ex.template')}
      </button>
      <button
        type="button"
        onClick={onExport}
        disabled={exporting}
        className="text-xs font-medium text-accent hover:underline"
      >
        {t('admin.ex.export')}
      </button>

      {error && <ErrorBanner message={error} />}

      {preview && pendingFile && (
        <Modal title={t('import.previewTitle')} onClose={cancelPreview}>
          <div className="space-y-4 text-sm">
            <ImportSummary result={preview} />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={confirmImport}
                className="btn-primary flex-1"
                disabled={confirming}
              >
                {confirming ? t('import.confirming') : t('import.confirm')}
              </button>
              <button type="button" onClick={cancelPreview} className="btn-ghost flex-1" disabled={confirming}>
                {t('import.cancel')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {result && (
        <Modal title={t('import.resultTitle')} onClose={() => setResult(null)}>
          <ImportSummary result={result} />
        </Modal>
      )}
    </div>
  );
}

function ImportSummary({ result }: { result: ImportResult }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          {t('import.imported', { count: result.imported })}
        </span>
        {result.updated > 0 && (
          <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
            {t('import.updated', { count: result.updated })}
          </span>
        )}
        {result.skipped > 0 && (
          <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {t('import.skipped', { count: result.skipped })}
          </span>
        )}
        {result.archived > 0 && (
          <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {t('import.archived', { count: result.archived })}
          </span>
        )}
      </div>
      {result.archived > 0 && (result.archivedInUse ?? result.archivedAffectedUsers) > 0 && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {t('import.archivedInUseWarning', {
            inUse: result.archivedInUse ?? result.archived,
            users: result.archivedAffectedUsers,
          })}
        </p>
      )}
      {result.errors.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-fg">{t('import.errorsTitle')}</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-fg-muted">
            {result.errors.map((e) => (
              <li key={e.row}>{t('import.rowError', { row: e.row, message: e.message })}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
