import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useFavorites } from '../../hooks/useFavorites';
import { useOfflineMedia } from '../../hooks/useOfflineMedia';
import { useAuth } from '../../hooks/useAuth';
import { useRestTimer } from '../../hooks/useRestTimer';
import { useRpeVisibility } from '../../hooks/useRpeVisibility';
import { ErrorBanner, Spinner } from '../../components/ui';
import { UNITS, type Unit } from '../../lib/units';
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
  const { unit, updateProfile } = useAuth();
  const { defaultSeconds, setDefaultSeconds, wakeLockEnabled, setWakeLockEnabled } = useRestTimer();
  const [rpeVisible, setRpeVisible] = useRpeVisibility();
  const [savingUnit, setSavingUnit] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  /**
   * The unit lives on the account, so switching it needs the server. Offline
   * the change is refused rather than applied locally: a preference that only
   * took on one device would have every other device disagreeing about what
   * the numbers mean.
   */
  async function chooseUnit(next: Unit) {
    if (next === unit) return;
    setProfileError(null);
    setSavingUnit(true);
    try {
      await updateProfile({ unitPreference: next });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t('settings.unitError'));
    } finally {
      setSavingUnit(false);
    }
  }

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
      {profileError && <ErrorBanner message={profileError} />}

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('settings.units')}
          </h2>
          <p className="mt-1 text-sm text-fg-subtle">{t('settings.unitsHint')}</p>
        </div>
        <div className="flex gap-2">
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => void chooseUnit(u)}
              disabled={savingUnit}
              aria-pressed={unit === u}
              className={`min-h-11 flex-1 rounded-xl border text-sm font-semibold uppercase transition disabled:opacity-50 ${
                unit === u
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-fg-muted hover:bg-surface-2'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('rest.label')}
          </h2>
        </div>
        <div>
          <label className="label" htmlFor="rest-default">
            {`${t('rest.default')} (${t('rest.seconds')})`}
          </label>
          <input
            id="rest-default"
            type="number"
            inputMode="numeric"
            min="0"
            step="15"
            className="input"
            value={defaultSeconds}
            onChange={(e) => {
              const seconds = Number(e.target.value);
              if (Number.isFinite(seconds) && seconds >= 0) setDefaultSeconds(seconds);
            }}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={wakeLockEnabled}
            onChange={(e) => setWakeLockEnabled(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
          />
          <span>
            <span className="block text-sm font-medium text-fg">{t('rest.wakeLock')}</span>
            {/* Said plainly and up front: a locked phone cannot be relied on to
                sound an alarm from a web app. Better read here than discovered
                mid-workout. */}
            <span className="mt-1 block text-xs text-fg-subtle">{t('rest.wakeLockHint')}</span>
          </span>
        </label>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {t('settings.rpe')}
        </h2>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={rpeVisible}
            onChange={(e) => setRpeVisible(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
          />
          <span>
            <span className="block text-sm font-medium text-fg">{t('settings.rpeVisible')}</span>
            <span className="mt-1 block text-xs text-fg-subtle">{t('settings.rpeVisibleHint')}</span>
          </span>
        </label>
      </section>

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
