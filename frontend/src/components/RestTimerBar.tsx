import { useRestTimer } from '../hooks/useRestTimer';
import { formatDuration, REST_ADJUST_STEP } from '../lib/restTimer';
import { useT } from '../i18n';

/**
 * Sits directly above the bottom navigation while a rest runs. Deliberately a
 * strip rather than an overlay: the set list underneath is what you look at
 * next, and a timer that covers it would be dismissed every single time.
 */
export function RestTimerBar() {
  const { rest, remaining, finished, adjust, stop } = useRestTimer();
  const t = useT();

  if (!rest) return null;

  const progress = rest.durationSeconds > 0 ? remaining / rest.durationSeconds : 0;

  return (
    <div
      className="fixed bottom-16 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-3 pb-2"
      role="status"
      aria-live="polite"
    >
      <div
        className={`card relative flex items-center gap-2 overflow-hidden p-2 shadow-lg transition-colors ${
          finished ? 'border-accent bg-accent/10' : ''
        }`}
      >
        {/* Drains left-to-right so the remaining time is legible as a shape,
            not only as digits — useful at arm's length mid-set. */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-surface-2">
          <div
            className="h-full bg-accent transition-[width] duration-500 ease-linear"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <button
          type="button"
          onClick={() => adjust(-REST_ADJUST_STEP)}
          className="focus-ring min-h-11 min-w-11 shrink-0 rounded-xl text-sm font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          aria-label={t('rest.minus', { seconds: REST_ADJUST_STEP })}
        >
          −{REST_ADJUST_STEP}
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p
            className={`text-2xl font-bold tabular-nums leading-none ${
              finished ? 'text-accent' : 'text-fg'
            }`}
          >
            {formatDuration(remaining)}
          </p>
          <p className="mt-0.5 truncate text-[0.65rem] uppercase tracking-wide text-fg-subtle">
            {finished ? t('rest.done') : t('rest.label')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => adjust(REST_ADJUST_STEP)}
          className="focus-ring min-h-11 min-w-11 shrink-0 rounded-xl text-sm font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          aria-label={t('rest.plus', { seconds: REST_ADJUST_STEP })}
        >
          +{REST_ADJUST_STEP}
        </button>

        <button
          type="button"
          onClick={stop}
          className="focus-ring min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold text-fg-muted transition hover:bg-surface-2 hover:text-fg"
        >
          {t('rest.skip')}
        </button>
      </div>
    </div>
  );
}
