import { useCallback, useEffect, useRef } from 'react';
import { formatNumber, parseDecimalInput } from '../lib/units';

/** Held down this long before the value starts repeating. */
const REPEAT_DELAY_MS = 450;
/** Repeat cadence once it does — fast enough to cross 40 kg, slow enough to stop on target. */
const REPEAT_INTERVAL_MS = 90;

interface StepperProps {
  onStep: () => void;
  label: string;
  children: React.ReactNode;
}

/**
 * Fires once on press and then repeats while held. Pointer events rather than
 * click, so the repeat can start before the finger lifts — the whole point of
 * holding it down.
 */
function StepperButton({ onStep, label, children }: StepperProps) {
  const delay = useRef<number>();
  const repeat = useRef<number>();
  // The handler is rebuilt every render (it closes over the current value), but
  // an interval started on press must call the latest one, not the one from
  // the render where the finger landed.
  const latest = useRef(onStep);
  useEffect(() => {
    latest.current = onStep;
  });

  const stop = useCallback(() => {
    window.clearTimeout(delay.current);
    window.clearInterval(repeat.current);
  }, []);

  // A component unmounted mid-hold (set removed, workout saved) must not leave
  // an interval running against a dead handler.
  useEffect(() => stop, [stop]);

  const start = () => {
    latest.current();
    delay.current = window.setTimeout(() => {
      repeat.current = window.setInterval(() => latest.current(), REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        // Keeps the press from also selecting text or scrolling the list.
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="focus-ring flex h-11 flex-1 items-center justify-center rounded-lg text-base font-bold text-fg-muted transition select-none touch-none hover:bg-surface-2 hover:text-fg active:bg-border"
    >
      {children}
    </button>
  );
}

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
