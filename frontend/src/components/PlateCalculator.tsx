import { useMemo, useState } from 'react';
import { Modal } from './ui';
import { useT } from '../i18n';
import { BAR_OPTIONS, computePlates, PLATE_SETS, type PlateCount } from '../lib/plates';
import { formatNumber, kgToUnit, parseDecimalInput, type Unit } from '../lib/units';

/**
 * The bar is a property of the gym, so it stays on the device — and it is kept
 * per unit, because a 20 kg bar and a 45 lb bar are different pieces of steel,
 * not the same choice expressed twice.
 */
const barStorageKey = (unit: Unit) => `jt_bar_${unit}`;

function readStoredBar(unit: Unit): number {
  // Checked as a string first: `Number(null)` is 0, which is itself a valid
  // option ("no bar") — so an empty slot would masquerade as a real choice.
  const raw = localStorage.getItem(barStorageKey(unit));
  const fallback = BAR_OPTIONS[unit][0];
  if (raw === null) return fallback;
  const value = Number(raw);
  return BAR_OPTIONS[unit].includes(value) ? value : fallback;
}

/**
 * Metric colours are the competition standard (25 red, 20 blue, 15 yellow,
 * 10 green). Imperial bumper colours are far less consistent between
 * manufacturers, so those are indicative rather than a claim — the number on
 * the plate is what identifies it.
 *
 * Written as literal class names because Tailwind scans source text; a
 * computed `bg-${colour}` would not survive the build.
 */
const PLATE_STYLES: Record<Unit, Record<number, { bg: string; fg: string; height: number }>> = {
  kg: {
    25: { bg: 'bg-red-600', fg: 'text-white', height: 92 },
    20: { bg: 'bg-blue-600', fg: 'text-white', height: 80 },
    15: { bg: 'bg-yellow-400', fg: 'text-slate-900', height: 68 },
    10: { bg: 'bg-emerald-600', fg: 'text-white', height: 56 },
    5: { bg: 'bg-slate-100 border border-slate-300', fg: 'text-slate-900', height: 44 },
    2.5: { bg: 'bg-slate-900 border border-slate-700', fg: 'text-white', height: 34 },
    1.25: { bg: 'bg-slate-400', fg: 'text-slate-900', height: 26 },
  },
  lb: {
    45: { bg: 'bg-blue-600', fg: 'text-white', height: 92 },
    35: { bg: 'bg-yellow-400', fg: 'text-slate-900', height: 78 },
    25: { bg: 'bg-emerald-600', fg: 'text-white', height: 64 },
    10: { bg: 'bg-slate-100 border border-slate-300', fg: 'text-slate-900', height: 48 },
    5: { bg: 'bg-slate-900 border border-slate-700', fg: 'text-white', height: 36 },
    2.5: { bg: 'bg-slate-400', fg: 'text-slate-900', height: 28 },
  },
};

const FALLBACK_STYLE = { bg: 'bg-fg-muted', fg: 'text-bg', height: 40 };

/** One side of the bar, drawn to scale: sleeve on the left, heaviest plate first. */
function BarGraphic({ perSide, unit }: { perSide: PlateCount[]; unit: Unit }) {
  const plates = perSide.flatMap(({ weight, count }) =>
    Array.from({ length: count }, (_, i) => ({ weight, key: `${weight}-${i}` }))
  );

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-surface-2 px-3 py-4">
      <div className="h-1.5 w-6 shrink-0 rounded-full bg-fg-subtle" aria-hidden />
      {plates.map(({ weight, key }) => {
        const style = PLATE_STYLES[unit][weight] ?? FALLBACK_STYLE;
        return (
          <div
            key={key}
            style={{ height: style.height }}
            className={`flex w-7 shrink-0 items-center justify-center rounded-md text-[0.6rem] font-bold tabular-nums ${style.bg} ${style.fg}`}
          >
            {weight}
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
 *
 * Everything here runs in the user's display unit. The seed arrives in
 * canonical kilograms and is converted once, on the way in.
 */
export function PlateCalculator({
  initialKg,
  unit,
  onClose,
}: {
  initialKg?: number;
  unit: Unit;
  onClose: () => void;
}) {
  const t = useT();
  const [target, setTarget] = useState(() =>
    initialKg != null ? formatNumber(kgToUnit(initialKg, unit)) : ''
  );
  const [bar, setBar] = useState(() => readStoredBar(unit));

  function chooseBar(weight: number) {
    setBar(weight);
    localStorage.setItem(barStorageKey(unit), String(weight));
  }

  const targetValue = parseDecimalInput(target);
  const result = useMemo(
    () =>
      targetValue !== undefined && targetValue > 0
        ? computePlates(targetValue, bar, PLATE_SETS[unit])
        : null,
    [targetValue, bar, unit]
  );

  return (
    <Modal title={t('plates.title')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="plate-target">
            {`${t('plates.target')} (${unit})`}
          </label>
          <input
            id="plate-target"
            type="text"
            inputMode="decimal"
            autoComplete="off"
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
            {BAR_OPTIONS[unit].map((weight) => (
              <button
                key={weight}
                type="button"
                onClick={() => chooseBar(weight)}
                aria-pressed={bar === weight}
                className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition ${
                  bar === weight
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-fg-muted hover:bg-surface-2'
                }`}
              >
                {weight === 0 ? t('plates.barNone') : `${weight} ${unit}`}
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
                <BarGraphic perSide={result.perSide} unit={unit} />
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg">
                  {result.perSide.map(({ weight, count }) => (
                    <li key={weight} className="tabular-nums">
                      <span className="font-bold">{count} ×</span> {weight} {unit}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <p className="text-xs text-fg-subtle tabular-nums">
              {t('plates.total', { weight: `${formatNumber(result.achieved)} ${unit}` })}
            </p>
            {result.remainder > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300 tabular-nums">
                {t('plates.remainder', { weight: `${formatNumber(result.remainder)} ${unit}` })}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
