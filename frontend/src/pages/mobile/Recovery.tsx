import { useMemo, useState } from 'react';
import { useExercises } from '../../hooks/useExercises';
import { useWorkouts } from '../../hooks/useWorkouts';
import { EmptyState, Spinner } from '../../components/ui';
import { BodyMap } from '../../components/BodyMap';
import { computeRecovery, type ExerciseMuscles } from '../../lib/recovery';
import { MUSCLE_GROUPS, MUSCLE_VIEW, type MuscleGroup } from '../../lib/muscles';
import { useLanguage, type TKey } from '../../i18n';

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
};

/** Hours since a timestamp, rounded down — the unit the recovery windows are stated in. */
function hoursSince(date: number, now: number): number {
  return Math.floor((now - date) / 3_600_000);
}

export function Recovery() {
  const { exercises, loading } = useExercises();
  const { sessions, loaded } = useWorkouts();
  const { lang, t } = useLanguage();
  const [view, setView] = useState<'front' | 'back'>('front');
  const [selected, setSelected] = useState<MuscleGroup | null>(null);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', DATE_OPTIONS),
    [lang]
  );

  // Recomputed on every render's `now`, not memoized against it: the decay is
  // a function of elapsed time, and a stale `now` would freeze the map.
  const now = Date.now();
  const recovery = useMemo(() => {
    const byId = new Map<string, ExerciseMuscles>(
      exercises.map((e) => [
        e.id,
        { musclesPrimary: e.musclesPrimary, musclesSecondary: e.musclesSecondary },
      ])
    );
    return computeRecovery(sessions, byId, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, sessions, Math.floor(now / 60_000)]);

  const values = useMemo(
    () => Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, recovery[m].value])),
    [recovery]
  );

  /** True when no exercise the user logged carries any muscle data at all. */
  const hasAnyData = MUSCLE_GROUPS.some((m) => recovery[m].lastTrainedAt !== null);

  if (loading || !loaded) return <Spinner label={t('common.loading')} />;

  const selectedLoad = selected ? recovery[selected] : null;
  const visibleGroups = MUSCLE_GROUPS.filter((m) => MUSCLE_VIEW[m] === view);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('recovery.title')}</h1>

      {!hasAnyData ? (
        <EmptyState title={t('recovery.emptyTitle')} hint={t('recovery.emptyHint')} />
      ) : (
        <>
          <div className="flex gap-2">
            {(['front', 'back'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  setSelected(null);
                }}
                aria-pressed={view === v}
                className={`min-h-11 flex-1 rounded-xl border text-sm font-medium transition ${
                  view === v
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-fg-muted hover:bg-surface-2'
                }`}
              >
                {t(v === 'front' ? 'recovery.front' : 'recovery.back')}
              </button>
            ))}
          </div>

          <div className="card p-4">
            <div className="mx-auto h-72">
              <BodyMap
                view={view}
                values={values}
                selected={selected}
                onSelect={setSelected}
                label={t(view === 'front' ? 'recovery.front' : 'recovery.back')}
              />
            </div>
          </div>

          {/*
           * The tap target the body map cannot be on its own: a small polygon
           * is awkward to hit, and colour alone would exclude anyone with a
           * colour vision deficiency (§ 11.3). Every group on this view is
           * listed with its number, so the map is an illustration of the list
           * rather than the only way to read it.
           */}
          <ul className="space-y-1.5">
            {visibleGroups.map((m) => {
              const load = recovery[m];
              const isSelected = selected === m;
              return (
                <li key={m}>
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : m)}
                    aria-pressed={isSelected}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left transition ${
                      isSelected ? 'border-accent bg-accent/5' : 'border-border hover:bg-surface-2'
                    }`}
                  >
                    <span className="text-sm font-medium text-fg">{t(`muscle.${m}` as TKey)}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-fg-subtle">
                        {load.lastTrainedAt === null
                          ? t('recovery.never')
                          : t('recovery.hoursAgo', { hours: hoursSince(load.lastTrainedAt, now) })}
                      </span>
                      <span
                        aria-hidden
                        className="h-2 w-16 overflow-hidden rounded-full bg-surface-2"
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.round(load.value * 100)}%` }}
                        />
                      </span>
                      <span className="w-9 text-right text-xs font-semibold text-fg-muted">
                        {Math.round(load.value * 100)}%
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && selectedLoad && (
            <div className="card space-y-1 p-4">
              <h2 className="text-sm font-semibold text-fg">{t(`muscle.${selected}` as TKey)}</h2>
              <p className="text-sm text-fg-muted">
                {t('recovery.load', { percent: Math.round(selectedLoad.value * 100) })}
              </p>
              <p className="text-sm text-fg-muted">
                {selectedLoad.lastTrainedAt === null
                  ? t('recovery.never')
                  : t('recovery.lastTrained', {
                      date: dateFmt.format(selectedLoad.lastTrainedAt),
                      hours: hoursSince(selectedLoad.lastTrainedAt, now),
                    })}
              </p>
            </div>
          )}
        </>
      )}

      {/* Said plainly rather than left to be inferred from a body diagram. */}
      <p className="text-xs text-fg-subtle">{t('recovery.disclaimer')}</p>
    </div>
  );
}
