import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useExercises } from '../../hooks/useExercises';
import { useWorkouts } from '../../hooks/useWorkouts';
import { useBodyWeights } from '../../hooks/useBodyWeights';
import { useAuth } from '../../hooks/useAuth';
import { EmptyState, Spinner } from '../../components/ui';
import { TrendChart } from '../../components/charts/TrendChart';
import { exerciseHistory } from '../../lib/analytics/history';
import { computeExerciseRecords } from '../../lib/analytics/records';
import { E1RM_RELIABLE_MAX_REPS } from '../../lib/analytics/oneRepMax';
import { dotsScore, nearestBodyWeight, wilksScore } from '../../lib/analytics/relativeStrength';
import { formatWeightWithUnit } from '../../lib/units';
import { useLanguage } from '../../i18n';

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: '2-digit' };

export function ExerciseStats() {
  const { id } = useParams<{ id: string }>();
  const { exercises, loading: exercisesLoading } = useExercises();
  const { sessions, loaded: sessionsLoaded } = useWorkouts();
  const { bodyWeights, loaded: bodyWeightsLoaded } = useBodyWeights();
  const { user, unit } = useAuth();
  const { lang, t } = useLanguage();
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', DATE_OPTIONS),
    [lang]
  );

  const exercise = exercises.find((e) => e.id === id);
  const history = useMemo(() => (id ? exerciseHistory(sessions, id) : []), [sessions, id]);
  const records = useMemo(() => (id ? computeExerciseRecords(sessions, id) : null), [sessions, id]);

  const relativeStrength = useMemo(() => {
    if (!user?.sex || !records?.maxE1rm || bodyWeights.length === 0) return null;
    const bw = nearestBodyWeight(bodyWeights, records.maxE1rm.date);
    if (!bw) return null;
    return {
      wilks: wilksScore(records.maxE1rm.value, bw.kg, user.sex),
      dots: dotsScore(records.maxE1rm.value, bw.kg, user.sex),
      bodyWeightDate: bw.date,
    };
  }, [user?.sex, records?.maxE1rm, bodyWeights]);

  if (exercisesLoading || !sessionsLoaded || !bodyWeightsLoaded) {
    return <Spinner label={t('common.loading')} />;
  }

  const name = exercise?.name ?? t('stats.unknownExercise');

  return (
    <div className="space-y-5">
      <Link
        to={id ? `/exercise/${id}` : '/'}
        className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg"
      >
        ‹ {t('detail.back')}
      </Link>

      <h1 className="text-2xl font-bold">{t('stats.title', { name })}</h1>

      {history.length === 0 || !records ? (
        <EmptyState title={t('stats.emptyTitle')} hint={t('stats.emptyHint')} />
      ) : (
        <>
          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('stats.records')}
            </h2>
            <RecordRow
              label={t('stats.maxWeight')}
              value={records.maxWeight ? formatWeightWithUnit(records.maxWeight.value, unit) : '–'}
              date={records.maxWeight ? dateFmt.format(records.maxWeight.date) : undefined}
            />
            <RecordRow
              label={t('stats.maxE1rm')}
              value={records.maxE1rm ? formatWeightWithUnit(records.maxE1rm.value, unit) : '–'}
              date={records.maxE1rm ? dateFmt.format(records.maxE1rm.date) : undefined}
              caveat={records.maxE1rm && !records.maxE1rm.reliable ? t('stats.e1rmCaveat') : undefined}
            />
            <RecordRow
              label={t('stats.maxSetVolume')}
              value={
                records.maxSetVolume
                  ? `${formatWeightWithUnit(records.maxSetVolume.value, unit)}`
                  : '–'
              }
              date={records.maxSetVolume ? dateFmt.format(records.maxSetVolume.date) : undefined}
            />
          </section>

          {relativeStrength && (
            <section className="card space-y-2 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                {t('stats.relativeStrength')}
              </h2>
              <div className="flex gap-4 text-sm">
                <span className="text-fg">
                  {t('stats.wilks')}: <strong>{relativeStrength.wilks.toFixed(1)}</strong>
                </span>
                <span className="text-fg">
                  {t('stats.dots')}: <strong>{relativeStrength.dots.toFixed(1)}</strong>
                </span>
              </div>
              <p className="text-xs text-fg-subtle">{t('stats.relativeStrengthHint')}</p>
            </section>
          )}

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('stats.e1rmHistory')}
            </h2>
            <TrendChart
              points={history
                .filter((p) => p.e1rm !== null)
                .map((p) => ({ date: p.date, value: p.e1rm!, reliable: p.e1rmReliable }))}
              variant="line"
              label={t('stats.e1rmHistory')}
              formatValue={(v) => formatWeightWithUnit(v, unit)}
              formatDate={(d) => dateFmt.format(d)}
            />
            <p className="text-xs text-fg-subtle">
              {t('stats.e1rmHint', { maxReps: E1RM_RELIABLE_MAX_REPS })}
            </p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('stats.volumeHistory')}
            </h2>
            <TrendChart
              points={history.map((p) => ({ date: p.date, value: p.volume }))}
              variant="bar"
              label={t('stats.volumeHistory')}
              formatValue={(v) => formatWeightWithUnit(v, unit)}
              formatDate={(d) => dateFmt.format(d)}
            />
          </section>
        </>
      )}
    </div>
  );
}

function RecordRow({
  label,
  value,
  date,
  caveat,
}: {
  label: string;
  value: string;
  date?: string;
  caveat?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="text-right">
        <span className="font-semibold text-fg">{value}</span>
        {date && <span className="ml-2 text-xs text-fg-subtle">{date}</span>}
        {caveat && <span className="block text-xs text-amber-700 dark:text-amber-300">{caveat}</span>}
      </span>
    </div>
  );
}
