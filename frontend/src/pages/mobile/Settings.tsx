import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useFavorites } from '../../hooks/useFavorites';
import { useOfflineMedia } from '../../hooks/useOfflineMedia';
import { useAuth } from '../../hooks/useAuth';
import { LanguageToggle } from '../../components/LanguageToggle';
import { ChevronLeftIcon } from '../../components/icons';
import { useRestTimer } from '../../hooks/useRestTimer';
import { useRpeVisibility } from '../../hooks/useRpeVisibility';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useRoutines } from '../../hooks/useRoutines';
import { useBodyWeights } from '../../hooks/useBodyWeights';
import { ErrorBanner, Spinner } from '../../components/ui';
import { TrendChart } from '../../components/charts/TrendChart';
import { UNITS, weightInputToKg, formatWeightInput, formatWeightWithUnit, type Unit } from '../../lib/units';
import { buildExport } from '../../lib/exportWorkouts';
import { parseExport, ExportFormatError } from '../../lib/importWorkouts';
import { sessionsToCsv } from '../../lib/exportCsv';
import { downloadAccountExport } from '../../api/export';
import type { Sex } from '../../lib/types';
import { useLanguage } from '../../i18n';

const SEX_OPTIONS: { value: Sex | null; labelKey: 'settings.sexMale' | 'settings.sexFemale' | 'settings.sexUnset' }[] = [
  { value: 'male', labelKey: 'settings.sexMale' },
  { value: 'female', labelKey: 'settings.sexFemale' },
  { value: null, labelKey: 'settings.sexUnset' },
];

/** Today as a local `date` input value (`YYYY-MM-DD`) — a UTC-based `toISOString` slice
 * would read as the wrong day near midnight in most timezones. */
function todayLocalDateInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const BODY_WEIGHT_DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

/** Triggers a browser save prompt for in-memory content — no server round trip. */
function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ImportSummary {
  importedSessions: number;
  skippedSessions: number;
  importedRoutines: number;
  skippedRoutines: number;
  importedBodyWeights: number;
  rowErrors: string[];
}

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
  const { lang, t } = useLanguage();
  const { exercises, loading } = useExercises();
  const { favoriteIds, loading: favoritesLoading } = useFavorites();
  const { unit, updateProfile, user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const { defaultSeconds, setDefaultSeconds, wakeLockEnabled, setWakeLockEnabled } = useRestTimer();
  const [rpeVisible, setRpeVisible] = useRpeVisibility();
  const [savingUnit, setSavingUnit] = useState(false);
  const [savingSex, setSavingSex] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const { sessions, loaded: sessionsLoaded, addSession } = useWorkouts();
  const { routines, loaded: routinesLoaded, saveRoutine } = useRoutines();
  const {
    bodyWeights,
    loaded: bodyWeightsLoaded,
    saveBodyWeight,
    deleteBodyWeight,
  } = useBodyWeights();
  const dataReady = sessionsLoaded && routinesLoaded && bodyWeightsLoaded;
  const bodyWeightDateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', BODY_WEIGHT_DATE_OPTIONS),
    [lang]
  );
  const [bwDate, setBwDate] = useState(todayLocalDateInputValue);
  const [bwWeightInput, setBwWeightInput] = useState('');
  const [bwError, setBwError] = useState<string | null>(null);
  const [savingBw, setSavingBw] = useState(false);
  const [serverExporting, setServerExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  function handleExportJson() {
    const bundle = {
      exercises: exercises.map((e) => ({ id: e.id, ref: e.ref, name: e.name })),
      routines,
      // The export format carries no identity for a body-weight entry (§ 9) —
      // date and weight are all that make a person's own history meaningful,
      // and two entries sharing both are indistinguishable anyway.
      bodyWeights: bodyWeights.map((b) => ({ date: b.date, kg: b.kg })),
      sessions,
    };
    const file = buildExport(bundle, unit);
    downloadBlob(JSON.stringify(file, null, 2), 'application/json', 'just-tally-export.json');
  }

  function handleExportCsv() {
    downloadBlob(sessionsToCsv(sessions), 'text/csv;charset=utf-8', 'just-tally-sessions.csv');
  }

  async function handleServerExport() {
    setExportError(null);
    setServerExporting(true);
    try {
      await downloadAccountExport();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('settings.exportError'));
    } finally {
      setServerExporting(false);
    }
  }

  /**
   * A local edit made since the last export must not be clobbered by an
   * older backup — the same last-write-wins rule the sync protocol already
   * applies, applied here between the imported row and what is on-device.
   */
  async function handleImportFile(file: File) {
    setImportError(null);
    setImportSummary(null);
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const { bundle, errors } = parseExport(json);

      let importedSessions = 0;
      let skippedSessions = 0;
      for (const session of bundle.sessions) {
        const existing = sessions.find((s) => s.id === session.id);
        if (existing && existing.updatedAt >= session.updatedAt) {
          skippedSessions += 1;
          continue;
        }
        await addSession(session);
        importedSessions += 1;
      }

      let importedRoutines = 0;
      let skippedRoutines = 0;
      for (const routine of bundle.routines) {
        const existing = routines.find((r) => r.id === routine.id);
        if (existing && existing.updatedAt >= routine.updatedAt) {
          skippedRoutines += 1;
          continue;
        }
        await saveRoutine(routine);
        importedRoutines += 1;
      }

      // No identity to dedupe against (see the export side's comment) — every
      // imported entry becomes a new row, deliberately, rather than guessing
      // at which existing row it might "really" be.
      let importedBodyWeights = 0;
      for (const bw of bundle.bodyWeights) {
        await saveBodyWeight({ id: crypto.randomUUID(), date: bw.date, kg: bw.kg, updatedAt: Date.now() });
        importedBodyWeights += 1;
      }

      setImportSummary({
        importedSessions,
        skippedSessions,
        importedRoutines,
        skippedRoutines,
        importedBodyWeights,
        rowErrors: errors,
      });
    } catch (err) {
      if (err instanceof ExportFormatError) setImportError(err.message);
      else setImportError(err instanceof Error ? err.message : t('settings.importError'));
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

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

  /**
   * Optional and self-declared (§ 2.5) — exists only to pick the Wilks/DOTS
   * coefficient set. `null` is a real, explicit answer meaning "withdrawn",
   * not merely "not yet asked".
   */
  async function chooseSex(next: Sex | null) {
    if (next === (user?.sex ?? null)) return;
    setProfileError(null);
    setSavingSex(true);
    try {
      await updateProfile({ sex: next });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : t('settings.sexError'));
    } finally {
      setSavingSex(false);
    }
  }

  async function handleAddBodyWeight() {
    const kg = weightInputToKg(bwWeightInput, unit);
    if (kg === undefined || kg <= 0) {
      setBwError(t('settings.bodyWeightInvalid'));
      return;
    }
    const date = new Date(`${bwDate}T00:00`).getTime();
    if (Number.isNaN(date)) {
      setBwError(t('settings.bodyWeightInvalid'));
      return;
    }
    setBwError(null);
    setSavingBw(true);
    try {
      await saveBodyWeight({ id: crypto.randomUUID(), date, kg, updatedAt: Date.now() });
      setBwWeightInput('');
    } finally {
      setSavingBw(false);
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
          <ChevronLeftIcon width={16} height={16} /> {t('detail.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t('settings.title')}</h1>
      </div>

      {error && <ErrorBanner message={error} />}
      {profileError && <ErrorBanner message={profileError} />}

      {/* Moved here from the global header: set once, not per screen, so it
          doesn't earn a permanent spot in the row every screen shows. */}
      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {t('settings.language')}
        </h2>
        <LanguageToggle />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {t('settings.account')}
        </h2>
        <p className="truncate text-sm text-fg-subtle">{user?.email}</p>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="btn-ghost px-4 text-sm"
            >
              {t('common.admin')}
            </button>
          )}
          <button type="button" onClick={logout} className="btn-ghost px-4 text-sm">
            {t('common.logout')}
          </button>
        </div>
      </section>

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
            {t('settings.sex')}
          </h2>
          <p className="mt-1 text-sm text-fg-subtle">{t('settings.sexHint')}</p>
        </div>
        <div className="flex gap-2">
          {SEX_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => void chooseSex(opt.value)}
              disabled={savingSex}
              aria-pressed={(user?.sex ?? null) === opt.value}
              className={`min-h-11 flex-1 rounded-xl border text-sm font-medium transition disabled:opacity-50 ${
                (user?.sex ?? null) === opt.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-fg-muted hover:bg-surface-2'
              }`}
            >
              {t(opt.labelKey)}
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

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('settings.bodyWeight')}
          </h2>
          <p className="mt-1 text-sm text-fg-subtle">{t('settings.bodyWeightHint')}</p>
        </div>

        {bwError && <ErrorBanner message={bwError} />}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="bw-date">{t('settings.bodyWeightDate')}</label>
            <input
              id="bw-date"
              type="date"
              className="input"
              value={bwDate}
              onChange={(e) => setBwDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="label" htmlFor="bw-weight">{`${t('settings.bodyWeightValue')} (${unit})`}</label>
            <input
              id="bw-weight"
              type="text"
              inputMode="decimal"
              className="input"
              value={bwWeightInput}
              onChange={(e) => setBwWeightInput(e.target.value)}
              placeholder="–"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleAddBodyWeight()}
            disabled={savingBw || bwWeightInput.trim() === ''}
            className="btn-primary min-h-11 px-4 text-sm disabled:opacity-50"
          >
            {t('common.save')}
          </button>
        </div>

        {bodyWeights.length > 0 && (
          <>
            <TrendChart
              points={[...bodyWeights].reverse().map((b) => ({ date: b.date, value: b.kg }))}
              variant="line"
              label={t('settings.bodyWeight')}
              formatValue={(v) => formatWeightWithUnit(v, unit)}
              formatDate={(d) => bodyWeightDateFmt.format(d)}
            />
            <ul className="space-y-1.5 border-t border-border pt-3">
              {bodyWeights.slice(0, 10).map((b) => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <span className="text-fg-subtle">{bodyWeightDateFmt.format(b.date)}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-fg">{formatWeightInput(b.kg, unit)} {unit}</span>
                    <button
                      type="button"
                      onClick={() => void deleteBodyWeight(b.id)}
                      className="text-xs text-fg-subtle hover:text-danger"
                    >
                      {t('common.delete')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            {t('settings.exportTitle')}
          </h2>
          <p className="mt-1 text-sm text-fg-subtle">{t('settings.exportHint')}</p>
        </div>

        {exportError && <ErrorBanner message={exportError} />}

        <div className="space-y-2">
          <button
            type="button"
            onClick={handleExportJson}
            disabled={!dataReady}
            className="btn-ghost w-full justify-center px-3 py-2 text-sm disabled:opacity-50"
          >
            {t('settings.exportJson')}
          </button>
          <button
            type="button"
            onClick={() => void handleServerExport()}
            disabled={serverExporting}
            className="btn-ghost w-full justify-center px-3 py-2 text-sm disabled:opacity-50"
          >
            {serverExporting ? t('common.loading') : t('settings.exportJsonServer')}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!dataReady}
            className="btn-ghost w-full justify-center px-3 py-2 text-sm disabled:opacity-50"
          >
            {t('settings.exportCsv')}
          </button>
          <p className="text-xs text-fg-subtle">{t('settings.exportCsvHint')}</p>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <label className="label" htmlFor="import-file">
            {t('settings.importLabel')}
          </label>
          <input
            id="import-file"
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
            }}
            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          {importError && <ErrorBanner message={importError} />}
          {importSummary && (
            <div className="space-y-1 text-xs text-fg-subtle">
              <p>
                {t('settings.importSummary', {
                  sessions: importSummary.importedSessions,
                  routines: importSummary.importedRoutines,
                  bodyWeights: importSummary.importedBodyWeights,
                })}
              </p>
              {(importSummary.skippedSessions > 0 || importSummary.skippedRoutines > 0) && (
                <p>
                  {t('settings.importSkipped', {
                    count: importSummary.skippedSessions + importSummary.skippedRoutines,
                  })}
                </p>
              )}
              {importSummary.rowErrors.length > 0 && (
                <p className="text-amber-700 dark:text-amber-300">
                  {t('settings.importRowErrors', { count: importSummary.rowErrors.length })}
                </p>
              )}
            </div>
          )}
        </div>
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
