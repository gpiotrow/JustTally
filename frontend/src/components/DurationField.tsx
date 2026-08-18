import { formatDurationInput, parseDurationInput } from '../lib/units';
import { StepperButton } from './StepperButton';

interface DurationFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Seconds per stepper tap. */
  step: number;
  label: string;
  stepUpLabel: string;
  stepDownLabel: string;
  placeholder?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
}

/**
 * An oversized duration field with a −/+ pair beneath it — the time-tracking
 * counterpart of `NumberField`. The field always displays and steps in plain
 * seconds; `parseDurationInput` also accepts an `m:ss` pair typed out of habit,
 * but that is a parsing convenience, not a second display format (bumping the
 * stepper always normalizes back to plain seconds).
 */
export function DurationField({
  value,
  onChange,
  step,
  label,
  stepUpLabel,
  stepDownLabel,
  placeholder,
  inputRef,
}: DurationFieldProps) {
  const bump = (direction: 1 | -1) => {
    const current = parseDurationInput(value) ?? 0;
    const next = Math.max(0, current + direction * step);
    onChange(formatDurationInput(next));
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
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
