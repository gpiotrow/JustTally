import { useMemo, useState } from 'react';
import { Modal } from './ui';
import { useT } from '../i18n';
import { BAR_OPTIONS, computePlates, type PlateCount } from '../lib/plates';

/** The bar choice is a property of the gym, not of a workout — so it stays on the device. */
const BAR_STORAGE_KEY = 'jt_bar_kg';

function readStoredBar(): number {
  // Checked as a string first: `Number(null)` is 0, which is itself a valid
  // option ("no bar") — so an empty slot would masquerade as a real choice.
  const raw = localStorage.getItem(BAR_STORAGE_KEY);
  if (raw === null) return 20;
  const kg = Number(raw);
  return BAR_OPTIONS.includes(kg as (typeof BAR_OPTIONS)[number]) ? kg : 20;
}

/**
 * Competition colours, so the stack on screen matches what is on the rack.
 * Written as literal class names because Tailwind scans source text — a
 * computed `bg-${colour}` would not survive the build.
 */
const PLATE_STYLE: Record<number, { bg: string; fg: string; height: number }> = {
  25: { bg: 'bg-red-600', fg: 'text-white', height: 92 },
  20: { bg: 'bg-blue-600', fg: 'text-white', height: 80 },
  15: { bg: 'bg-yellow-400', fg: 'text-slate-900', height: 68 },
  10: { bg: 'bg-emerald-600', fg: 'text-white', height: 56 },
  5: { bg: 'bg-slate-100 border border-slate-300', fg: 'text-slate-900', height: 44 },
  2.5: { bg: 'bg-slate-900 border border-slate-700', fg: 'text-white', height: 34 },
  1.25: { bg: 'bg-slate-400', fg: 'text-slate-900', height: 26 },
};

const FALLBACK_STYLE = { bg: 'bg-fg-muted', fg: 'text-bg', height: 40 };

/** One side of the bar, drawn to scale: sleeve on the left, heaviest plate first. */
function BarGraphic({ perSide }: { perSide: PlateCount[] }) {
  const plates = perSide.flatMap(({ weightKg, count }) =>
    Array.from({ length: count }, (_, i) => ({ weightKg, key: `${weightKg}-${i}` }))
  );

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-surface-2 px-3 py-4">
      <div className="h-1.5 w-6 shrink-0 rounded-full bg-fg-subtle" aria-hidden />
      {plates.map(({ weightKg, key }) => {
        const style = PLATE_STYLE[weightKg] ?? FALLBACK_STYLE;
        return (
          <div
            key={key}
            style={{ height: style.height }}
            className={`flex w-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold tabular-nums ${style.bg} ${style.fg}`}
          >
            {weightKg}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Works out which plates go on each side for a target weight. Opened from a
 * workout entry and seeded with that exercise's weight, but the target stays
 * editable — the answer is wanted before the set is logged, not after.
 */
export function PlateCalculator({
  initialKg,
  onClose,
}: {
  initialKg?: number;
  onClose: () => void;
}) {
  const t = useT();
  const [target, setTarget] = useState(initialKg != null ? String(initialKg) : '');
  const [barKg, setBarKg] = useState(readStoredBar);

  function chooseBar(kg: number) {
    setBarKg(kg);
    localStorage.setItem(BAR_STORAGE_KEY, String(kg));
  }

  const targetKg = Number(target);
  const hasTarget = target.trim() !== '' && Number.isFinite(targetKg) && targetKg > 0;
  const result = useMemo(
    () => (hasTarget ? computePlates(targetKg, barKg) : null),
    [hasTarget, targetKg, barKg]
  );

  return (
    <Modal title={t('plates.title')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="plate-target">
            {t('plates.target')}
          </label>
          <input
            id="plate-target"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            autoFocus
            className="input-gym"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="–"
          />
        </div>

        <div>
          <span className="label">{t('plates.bar')}</span>
          <div className="flex flex-wrap gap-2">
            {BAR_OPTIONS.map((kg) => (
              <button
                key={kg}
                type="button"
                onClick={() => chooseBar(kg)}
                aria-pressed={barKg === kg}
                className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition ${
                  barKg === kg
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-fg-muted hover:bg-surface-2'
                }`}
              >
                {kg === 0 ? t('plates.barNone') : `${kg} kg`}
              </button>
            ))}
          </div>
        </div>

        {result?.status === 'below-bar' && (
          <p className="text-sm text-amber-700 dark:text-amber-300">{t('plates.belowBar')}</p>
        )}

        {result?.status === 'ok' && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
              {t('plates.perSide')}
            </p>

            {result.perSide.length === 0 ? (
              <p className="text-sm text-fg-muted">{t('plates.onlyBar')}</p>
            ) : (
              <>
                <BarGraphic perSide={result.perSide} />
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg">
                  {result.perSide.map(({ weightKg, count }) => (
                    <li key={weightKg} className="tabular-nums">
                      <span className="font-bold">{count} ×</span> {weightKg} kg
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="text-xs text-fg-subtle tabular-nums">
              {t('plates.total', { kg: result.achievedKg })}
            </p>
            {result.remainderKg > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300 tabular-nums">
                {t('plates.remainder', { kg: result.remainderKg })}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
