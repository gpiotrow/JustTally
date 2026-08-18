import { formatNumber, parseDecimalInput } from '../lib/units';
import { StepperButton } from './StepperButton';

interface NumberFieldProps {
  value: string;
  onChange: (value: string) => void;
  step: number;
  min?: number;
  /** Round stepped values to whole numbers (reps). */
  integer?: boolean;
  label: string;
  stepUpLabel: string;
  stepDownLabel: string;
  placeholder?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
}

/**
 * An oversized numeric field with a −/+ pair beneath it.
 *
 * The field is `type="text"` with a decimal keypad rather than `type="number"`:
 * a number input discards a trailing separator on every keystroke (so "62,"
 * never becomes "62,5"), and rejects the comma outright in some browsers —
 * which is the separator on every German numeric keypad. The value stays raw
 * text here and is parsed once, at the edge, when the workout is saved.
 */
export function NumberField({
  value,
  onChange,
  step,
  min,
  integer,
  label,
  stepUpLabel,
  stepDownLabel,
  placeholder,
  inputRef,
}: NumberFieldProps) {
  const bump = (direction: 1 | -1) => {
    // A blank field steps from the placeholder's premise — zero — rather than
    // refusing to move.
    const current = parseDecimalInput(value) ?? 0;
    let next = current + direction * step;
    if (integer) next = Math.round(next);
    if (min !== undefined && next < min) next = min;
    onChange(formatNumber(next));
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        autoComplete="off"
        className="input-gym"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-1 flex gap-1">
        <StepperButton onStep={() => bump(-1)} label={stepDownLabel}>
          −
        </StepperButton>
        <StepperButton onStep={() => bump(1)} label={stepUpLabel}>
          +
        </StepperButton>
      </div>
    </div>
  );
}
