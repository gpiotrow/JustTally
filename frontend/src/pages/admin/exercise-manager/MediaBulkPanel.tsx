import { useRef, useState } from 'react';
import { bulkUploadMediaChunked, type MediaBulkResult } from '../../../api/exercises';
import { ErrorBanner, Modal } from '../../../components/ui';
import { useT, type TKey } from '../../../i18n';

/** Map a bulk-upload skip reason code to its translation key. */
const UNMATCHED_REASON_KEY: Record<string, TKey> = {
  no_leading_number: 'admin.ex.unmatchedReason.noLeadingNumber',
  no_exercise_for_number: 'admin.ex.unmatchedReason.noExercise',
  unsupported_type: 'admin.ex.unmatchedReason.unsupportedType',
  processing_error: 'admin.ex.unmatchedReason.processingError',
};

/**
 * Bulk media upload with client-side chunking: a selection of hundreds of
 * files is split into server-sized batches and sent sequentially, with a
 * progress readout, instead of failing outright past the server's per-request
 * file cap.
 */
export function MediaBulkPanel({ onUploaded }: { onUploaded: () => void }) {
  const t = useT();
  const [overwrite, setOverwrite] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<MediaBulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<HTMLInputElement>(null);

  async function onPickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      const res = await bulkUploadMediaChunked(files, overwrite, (done, total) =>
        setProgress({ done, total })
      );
      setResult(res);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.ex.bulkUploadError'));
    } finally {
      setUploading(false);
      setProgress(null);
      if (mediaRef.current) mediaRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => mediaRef.current?.click()}
        className="btn-ghost"
        disabled={uploading}
      >
        {uploading
          ? progress
            ? t('admin.ex.bulkUploadProgress', { done: progress.done, total: progress.total })
            : t('admin.ex.bulkUploading')
          : t('admin.ex.bulkUpload')}
      </button>
      <input
        ref={mediaRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={onPickMedia}
      />
      <label className="flex items-center gap-1.5 text-xs text-fg-muted">
        <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
        {t('admin.ex.overwriteMedia')}
      </label>
      <span className="text-xs text-fg-subtle">{t('admin.ex.bulkUploadHint')}</span>

      {error && <ErrorBanner message={error} />}

      {result && (
        <Modal title={t('admin.ex.bulkResultTitle')} onClose={() => setResult(null)}>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {t('admin.ex.assigned', { count: result.assigned.length })}
              </span>
              {result.unmatched.length > 0 && (
                <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  {t('admin.ex.unmatched', { count: result.unmatched.length })}
                </span>
              )}
            </div>
            {result.clearedExerciseIds.length > 0 && (
              <p className="text-fg-muted">
                {t('admin.ex.mediaOverwritten', { count: result.clearedExerciseIds.length })}
              </p>
            )}
            {result.unmatched.length > 0 && (
              <div>
                <p className="mb-1 font-semibold text-fg">{t('admin.ex.unmatchedTitle')}</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-fg-muted">
                  {result.unmatched.map((u) => (
                    <li key={u.filename}>
                      {u.filename} —{' '}
                      {t(UNMATCHED_REASON_KEY[u.reason] ?? 'admin.ex.unmatchedReason.processingError')}
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
