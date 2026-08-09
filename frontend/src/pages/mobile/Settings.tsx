import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useFavorites } from '../../hooks/useFavorites';
import { useOfflineMedia } from '../../hooks/useOfflineMedia';
import { ErrorBanner, Spinner } from '../../components/ui';
import { useT } from '../../i18n';

/** Bytes as a short human-readable string; the exact figure is never the point. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function Settings() {
  const t = useT();
  const { exercises, loading } = useExercises();
  const { favoriteIds, loading: favoritesLoading } = useFavorites();

  const favoriteExercises = useMemo(
    () => exercises.filter((ex) => favoriteIds.has(ex.id)),
    [exercises, favoriteIds]
  );

  const {
    supported,
    enabled,
    setEnabled,
    cachedCount,
    totalCount,
    progress,
    summary,
    usageBytes,
    error,
    download,
    clear,
    canDownload,
  } = useOfflineMedia(favoriteExercises);

  if (loading || favoritesLoading) return <Spinner label={t('common.loading')} />;

  const missing = Math.max(totalCount - cachedCount, 0);

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg"
        >
          ‹ {t('detail.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t('settings.title')}</h1>
      </div>

      {error && <ErrorBanner message={error} />}

      <section className="card space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('settings.offlineMedia')}
          </h2>
          <p className="mt-1 text-sm text-fg-subtle">{t('settings.offlineMediaHint')}</p>
        </div>

        {!supported ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">{t('settings.unsupported')}</p>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-accent"
              />
              <span className="text-sm font-medium text-fg">
                {t('settings.offlineMediaToggle')}
              </span>
            </label>

            {enabled && (
              <div className="space-y-3 border-t border-border pt-3">
                {totalCount === 0 ? (
                  <p className="text-sm text-fg-subtle">{t('settings.noFavorites')}</p>
                ) : (
                  <>
                    <p className="text-sm text-fg">
                      {progress
                        ? t('settings.downloading', {
                            done: progress.done,
                            total: progress.total,
                          })
                        : t('settings.stored', { cached: cachedCount, total: totalCount })}
                    </p>

                    {progress && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent transition-[width]"
                          style={{
                            width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    )}

                    {!canDownload && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t('settings.offlineNow')}
                      </p>
                    )}

                    {/*
                     * An opaque response cannot be inspected, so "stored" is the
                     * strongest claim we can make about it. Saying so beats the
                     * alternative: the user believing the photos are safely
                     * there and finding out at the gym that they are not.
                     */}
                    {summary && summary.opaque > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t('settings.unverified', { count: summary.opaque })}
                      </p>
                    )}

                    {missing > 0 && !progress && (
                      <button
                        type="button"
                        onClick={() => void download()}
                        disabled={!canDownload}
                        className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40"
                      >
                        {t('settings.download')}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              {usageBytes !== null && (
                <span className="text-xs text-fg-subtle">
                  {t('settings.storageUsed', { size: formatBytes(usageBytes) })}
                </span>
              )}
              {/*
               * Always available, not only while the toggle is on: entries this
               * app writes itself are invisible to Workbox's expiration
               * bookkeeping, so nothing else will ever remove them.
               */}
              <button
                type="button"
                onClick={() => void clear()}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {t('settings.clear')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
