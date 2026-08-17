import { RPE_VALUES } from '../lib/types';
import { useT } from '../i18n';

interface RpePickerProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  setNumber: number;
}

/**
 * A tap-row of the standard RPE scale instead of a keyboard — nobody types
 * "7,5" reliably mid-set. Nine values do not fit one row at 320px even at a
 * legible tap target, so the row wraps onto a second rather than shrinking
 * below the 44px minimum every other control in this app uses.
 */
export function RpePicker({ value, onChange, setNumber }: RpePickerProps) {
  const t = useT();
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label={t('workout.rpeGroupLabel', { n: setNumber })}
    >
      {RPE_VALUES.map((rpe) => (
        <button
          key={rpe}
          type="button"
          onClick={() => onChange(value === rpe ? undefined : rpe)}
          aria-pressed={value === rpe}
          className={`focus-ring min-h-11 min-w-11 rounded-md border px-1.5 text-xs font-semibold transition ${
            value === rpe
              ? 'border-accent bg-accent text-white'
              : 'border-border bg-surface-2 text-fg-subtle hover:border-accent hover:text-accent'
          }`}
        >
          {Number.isInteger(rpe) ? rpe : rpe.toFixed(1)}
        </button>
      ))}
    </div>
  );
}
