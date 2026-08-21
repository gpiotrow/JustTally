import { useCallback, useEffect, useRef } from 'react';

/** Held down this long before the value starts repeating. */
const REPEAT_DELAY_MS = 450;
/** Repeat cadence once it does — fast enough to cross 40 kg, slow enough to stop on target. */
const REPEAT_INTERVAL_MS = 90;

interface StepperButtonProps {
  onStep: () => void;
  label: string;
  children: React.ReactNode;
}

/**
 * Fires once on press and then repeats while held. Pointer events rather than
 * click, so the repeat can start before the finger lifts — the whole point of
 * holding it down.
 *
 * Shared between `NumberField` and `DurationField` — both oversized fields
 * with a −/+ pair beneath them, differing only in how the value is parsed.
 */
export function StepperButton({ onStep, label, children }: StepperButtonProps) {
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
      className="focus-ring flex h-11 min-w-11 flex-1 items-center justify-center rounded-lg text-base font-bold text-fg-muted transition select-none touch-none hover:bg-surface-2 hover:text-fg active:bg-border"
    >
      {children}
    </button>
  );
}
