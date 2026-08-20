import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useOnline } from '../../hooks/useOnline';
import { useAuth } from '../../hooks/useAuth';
import { formatDistanceWithUnit, formatWeightWithUnit, type Unit } from '../../lib/units';
import { formatDuration } from '../../lib/restTimer';
import { entryTracking, setType, type WorkoutEntry, type WorkoutSession, type WorkoutSet } from '../../lib/types';
import type { TrackingMode } from '../../lib/tracking';
import type { NewPR } from '../../lib/analytics/records';
import { routineFromSession } from '../../lib/sessionToRoutine';
import { EmptyState, ErrorBanner, PendingSyncChip, Spinner } from '../../components/ui';
import { useLanguage, type TKey } from '../../i18n';

/** One set, formatted for the mode it was logged under — mirrors the columns `Workout.tsx` shows while logging. */
function formatSetSummary(set: WorkoutSet, mode: TrackingMode, unit: Unit): string {
  switch (mode) {
    case 'reps':
      return String(set.reps);
    case 'time':
      return set.durationSec != null ? formatDuration(set.durationSec) : '–';
    case 'time_weight': {
      const duration = set.durationSec != null ? formatDuration(set.durationSec) : '–';
      return set.weight ? `${duration}×${formatWeightWithUnit(set.weight, unit)}` : duration;
    }
    case 'distance_time': {
      const distance = set.distanceM != null ? formatDistanceWithUnit(set.distanceM) : '–';
      const duration = set.durationSec != null ? formatDuration(set.durationSec) : '–';
      return `${distance} · ${duration}`;
    }
    case 'reps_weight':
    default:
      return `${set.reps}${set.weight ? `×${formatWeightWithUnit(set.weight, unit)}` : ''}`;
  }
}

/** Machine-setting values logged for an entry, as one labelled string — omitted entirely when there are none. */
function formatEntrySettings(entry: WorkoutEntry, t: (key: TKey) => string): string | null {
  if (!entry.settings) return null;
  const parts = Object.entries(entry.settings);
  if (parts.length === 0) return null;
  return parts.map(([code, value]) => `${t(`setting.${code}` as TKey)}: ${value}`).join(' · ');
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

export function History() {
  const { sessions, loaded, deleteSession, sync, syncing, lastSyncedAt, pendingCount } =
    useWorkouts();
  const online = useOnline();
  const { unit } = useAuth();
  const { lang, t } = useLanguage();
  const [syncError, setSyncError] = useState<string | null>(null);
  const dateFmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', DATE_OPTIONS);

  const navigate = useNavigate();
  const location = useLocation();
  // Shown once, right after a save that beat a prior record — cleared
  // locally on dismiss; router state doesn't survive a reload, so it never
  // reappears on its own either.
  const [newPRs, setNewPRs] = useState<NewPR[] | null>(
    (location.state as { newPRs?: NewPR[] } | null)?.newPRs ?? null
  );

  if (!loaded) return <Spinner label={t('common.loading')} />;

  async function handleSync() {
    setSyncError(null);
    try {
      await sync();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : t('history.syncError'));
    }
  }

  /**
   * Deleting a logged workout is the one destructive action here with no
   * undo — `deleteSession` queues a sync tombstone alongside the local
   * removal, so silently reviving it client-side risks a confusing
   * resurrect-then-vanish once that tombstone reaches the server. A confirm
   * step (the same pattern `Routines.tsx` already uses for deleting a
   * routine) is the safe fix, not a toast this action can't safely offer.
   */
  function handleDelete(id: string) {
    if (!window.confirm(t('history.deleteConfirm'))) return;
    void deleteSession(id);
  }

  /**
   * Builds a routine draft from this session and hands it to the routine
   * editor — nothing is saved here. `Routines.tsx` opens it pre-filled, the
   * same way `Workout.tsx` opens pre-filled from a routine's own "Training
   * starten" (`instantiateRoutineDay`), just running the other direction.
   */
  function saveAsRoutine(s: WorkoutSession) {
    const name = s.title?.trim() || t('routines.fromWorkoutName', { date: dateFmt.format(s.startedAt ?? s.date) });
    navigate('/routines', { state: { draftRoutine: routineFromSession(s, name) } });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('history.title')}</h1>
        <button
          onClick={handleSync}
          disabled={!online || syncing}
          className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {syncing ? t('history.syncing') : t('history.sync')}
        </button>
      </div>

      {newPRs && newPRs.length > 0 && (
        <div className="card space-y-2 border-accent/40 bg-accent/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-accent">{t('history.newRecordsTitle')}</h2>
            <button
              onClick={() => setNewPRs(null)}
              className="text-xs text-fg-subtle hover:text-fg"
            >
              {t('common.close')}
            </button>
          </div>
          <ul className="space-y-1 text-sm text-fg">
            {newPRs.map((pr) => (
              <li key={pr.exerciseId}>
                <span className="font-medium">{pr.exerciseName}</span>{' '}
                <span className="text-fg-subtle">
                  ({pr.kinds.map((kind) => t(`history.recordKind.${kind}`)).join(', ')})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {syncError && <ErrorBanner message={syncError} />}
      {!syncError && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {/* What is actually at stake, rather than only how long ago the last
              round succeeded: a timestamp reads the same whether nothing has
              changed since or a whole workout is sitting on this device. */}
          <PendingSyncChip count={pendingCount} />
          {lastSyncedAt ? (
            <span className="text-fg-subtle">
              {t('history.lastSynced')} {dateFmt.format(lastSyncedAt)}
            </span>
          ) : null}
        </div>
      )}

      {sessions.length === 0 ? (
        <EmptyState title={t('history.emptyTitle')} hint={t('history.emptyHint')} />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            // Warm-ups don't count as work done, so they stay out of the total.
            const totalSets = s.entries.reduce(
              (sum, e) => sum + e.sets.filter((set) => setType(set) !== 'warmup').length,
              0
            );
            return (
              <li key={s.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">
                      {s.title?.trim() || t('history.untitled')}
                    </p>
                    <p className="text-xs text-fg-subtle">{dateFmt.format(s.startedAt ?? s.date)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-x-3 gap-y-1">
                    {s.entries.length > 0 && (
                      <button
                        onClick={() => saveAsRoutine(s)}
                        className="text-xs text-fg-subtle hover:text-accent"
                      >
                        {t('history.saveAsRoutine')}
                      </button>
                    )}
                    <Link
                      to={`/workout/${s.id}`}
                      className="text-xs text-fg-subtle hover:text-accent"
                    >
                      {t('common.edit')}
                    </Link>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs text-fg-subtle hover:text-danger"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-xs text-fg-subtle">
                  {s.entries.length} {t('history.exercises')} · {totalSets} {t('history.sets')}
                  {s.durationMin != null && ` · ${s.durationMin} ${t('history.minutes')}`}
                </p>
                <ul className="space-y-1.5">
                  {s.entries.map((e, i) => {
                    const mode = entryTracking(e);
                    const settingsSummary = formatEntrySettings(e, t);
                    return (
                      <li key={i} className="text-sm text-fg-muted">
                        {/* History is the only way back to an archived exercise —
                            it is gone from the catalog list but still linkable. */}
                        <Link
                          to={`/exercise/${e.exerciseId}`}
                          className="font-medium text-fg hover:text-accent"
                        >
                          {e.exerciseName}
                        </Link>{' '}
                        <span className="text-fg-subtle">
                          {e.sets.map((set) => formatSetSummary(set, mode, unit)).join(', ')}
                        </span>
                        {settingsSummary && (
                          <span className="block text-xs text-fg-subtle">{settingsSummary}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {s.notes?.trim() && (
                  <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-fg-muted">
                    {s.notes}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
