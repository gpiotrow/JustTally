import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useOnline } from '../../hooks/useOnline';
import { EmptyState, ErrorBanner, Spinner } from '../../components/ui';
import { useLanguage } from '../../i18n';

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

export function History() {
  const { sessions, loaded, deleteSession, sync, syncing, lastSyncedAt } = useWorkouts();
  const online = useOnline();
  const { lang, t } = useLanguage();
  const [syncError, setSyncError] = useState<string | null>(null);
  const dateFmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', DATE_OPTIONS);

  if (!loaded) return <Spinner label={t('common.loading')} />;

  async function handleSync() {
    setSyncError(null);
    try {
      await sync();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : t('history.syncError'));
    }
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

      {syncError && <ErrorBanner message={syncError} />}
      {!syncError && lastSyncedAt ? (
        <p className="text-xs text-fg-subtle">
          {t('history.lastSynced')} {dateFmt.format(lastSyncedAt)}
        </p>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState title={t('history.emptyTitle')} hint={t('history.emptyHint')} />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const totalSets = s.entries.reduce((sum, e) => sum + e.sets.length, 0);
            return (
              <li key={s.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">
                      {s.title?.trim() || t('history.untitled')}
                    </p>
                    <p className="text-xs text-fg-subtle">{dateFmt.format(s.startedAt ?? s.date)}</p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <Link
                      to={`/workout/${s.id}`}
                      className="text-xs text-fg-subtle hover:text-accent"
                    >
                      {t('common.edit')}
                    </Link>
                    <button
                      onClick={() => deleteSession(s.id)}
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
                  {s.entries.map((e, i) => (
                    <li key={i} className="text-sm text-fg-muted">
                      <span className="font-medium text-fg">{e.exerciseName}</span>{' '}
                      <span className="text-fg-subtle">
                        {e.sets
                          .map((set) => `${set.reps}${set.weight ? `×${set.weight}kg` : ''}`)
                          .join(', ')}
                      </span>
                    </li>
                  ))}
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
