import { useWorkouts } from '../../hooks/useWorkouts';
import { EmptyState, Spinner } from '../../components/ui';
import { useLanguage } from '../../i18n';

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

export function History() {
  const { sessions, loaded, deleteSession } = useWorkouts();
  const { lang, t } = useLanguage();
  const dateFmt = new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', DATE_OPTIONS);

  if (!loaded) return <Spinner label={t('common.loading')} />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('history.title')}</h1>

      {sessions.length === 0 ? (
        <EmptyState title={t('history.emptyTitle')} hint={t('history.emptyHint')} />
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const totalSets = s.entries.reduce((sum, e) => sum + e.sets.length, 0);
            return (
              <li key={s.id} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-fg">{dateFmt.format(s.date)}</p>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="text-xs text-fg-subtle hover:text-danger"
                  >
                    {t('common.delete')}
                  </button>
                </div>
                <p className="mb-3 text-xs text-fg-subtle">
                  {s.entries.length} {t('history.exercises')} · {totalSets} {t('history.sets')}
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
