import type { SetType } from '../lib/types';
import { useT, type TKey } from '../i18n';

const ORDER: SetType[] = ['working', 'warmup', 'drop'];
const LABELS: Record<SetType, string> = { working: '•', warmup: 'W', drop: '↓' };

interface SetTypeToggleProps {
  value: SetType;
  onChange: (type: SetType) => void;
  setNumber: number;
  /** Extra classes merged onto the button — e.g. the mobile-tier `order-*` a wide two-field set row needs to reflow around. */
  className?: string;
}

/**
 * Cycles working -> warmup -> drop -> working on tap. A true three-way
 * segmented control needs three simultaneous tap targets, which does not
 * fit next to reps and weight at 320px — cycling keeps a single 44px target
 * instead of shrinking three below it.
 */
export function SetTypeToggle({ value, onChange, setNumber, className = '' }: SetTypeToggleProps) {
  const t = useT();
  const next = ORDER[(ORDER.indexOf(value) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={t('set.typeToggle', { n: setNumber, type: t(`set.type.${value}` as TKey) })}
      className={`focus-ring flex h-14 w-11 shrink-0 items-center justify-center rounded-xl border text-base font-bold transition ${
        value === 'warmup'
          ? 'border-border bg-surface-2 text-fg-subtle'
          : value === 'drop'
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-border text-fg-muted hover:bg-surface-2'
      } ${className}`}
    >
      {LABELS[value]}
    </button>
  );
}
