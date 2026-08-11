/**
 * Rest timer arithmetic.
 *
 * The timer stores *when it started* and *how long it runs*, never a counter it
 * decrements. Browsers throttle timers in background tabs and stop them
 * entirely when the device sleeps, so anything that counts down drifts exactly
 * when it matters — pocketed phone, mid-rest. Deriving the remaining time from
 * two timestamps makes the display correct on the next render no matter what
 * happened in between, and lets a reload mid-rest pick the timer back up.
 */

export interface RestState {
  /** Epoch ms at which the rest began — the moment a set was checked off. */
  startedAt: number;
  /** How long the rest runs, in seconds. Adjustable while it counts. */
  durationSeconds: number;
}

export const DEFAULT_REST_SECONDS = 90;

/** One tap of the -/+ control on the running timer. */
export const REST_ADJUST_STEP = 15;

/**
 * Beyond this, a finished rest is treated as history rather than something to
 * announce: coming back to the app half an hour later should not set off an
 * alarm for a set finished long ago.
 */
export const REST_STALE_AFTER_SECONDS = 120;

export function remainingSeconds(rest: RestState, now: number): number {
  const elapsed = (now - rest.startedAt) / 1000;
  return Math.max(0, Math.ceil(rest.durationSeconds - elapsed));
}

export function isFinished(rest: RestState, now: number): boolean {
  return remainingSeconds(rest, now) === 0;
}

/** How long ago the rest ran out; 0 while it is still counting. */
export function overdueSeconds(rest: RestState, now: number): number {
  const elapsed = (now - rest.startedAt) / 1000;
  return Math.max(0, Math.floor(elapsed - rest.durationSeconds));
}

/**
 * A rest that expired while the app was away. Worth showing, not worth
 * alarming about.
 */
export function isStale(rest: RestState, now: number): boolean {
  return overdueSeconds(rest, now) > REST_STALE_AFTER_SECONDS;
}

/**
 * Shift the duration of a running rest. Never goes below zero — subtracting
 * past the elapsed time simply ends the rest now, which is what someone
 * pressing "−15" on an almost-finished timer means.
 */
export function adjustDuration(rest: RestState, deltaSeconds: number): RestState {
  return { ...rest, durationSeconds: Math.max(0, rest.durationSeconds + deltaSeconds) };
}

/** `m:ss`, the shape a gym clock has. Negative input is clamped to `0:00`. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
