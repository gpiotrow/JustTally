import { describe, it, expect } from 'vitest';
import {
  adjustDuration,
  formatDuration,
  isFinished,
  isStale,
  overdueSeconds,
  remainingSeconds,
  REST_STALE_AFTER_SECONDS,
  type RestState,
} from './restTimer';

const START = 1_786_400_000_000;
const rest = (durationSeconds: number): RestState => ({ startedAt: START, durationSeconds });
const secondsLater = (n: number) => START + n * 1000;

describe('remainingSeconds', () => {
  it('returns the full duration at the moment it starts', () => {
    expect(remainingSeconds(rest(90), START)).toBe(90);
  });

  it('counts down as time passes', () => {
    expect(remainingSeconds(rest(90), secondsLater(30))).toBe(60);
  });

  it('rounds up, so the last second is shown as 1 rather than 0', () => {
    expect(remainingSeconds(rest(90), secondsLater(89.4))).toBe(1);
  });

  it('clamps at zero instead of going negative', () => {
    expect(remainingSeconds(rest(90), secondsLater(200))).toBe(0);
  });

  it('is correct after a long gap, as if the device had slept', () => {
    // The whole reason the timer stores timestamps: a throttled or suspended
    // tab must not leave the count behind where it stopped ticking.
    expect(remainingSeconds(rest(300), secondsLater(120))).toBe(180);
  });
});

describe('isFinished', () => {
  it('is false while time remains and true once it runs out', () => {
    expect(isFinished(rest(90), secondsLater(89))).toBe(false);
    expect(isFinished(rest(90), secondsLater(90))).toBe(true);
  });
});

describe('overdueSeconds', () => {
  it('is zero while the rest is still running', () => {
    expect(overdueSeconds(rest(90), secondsLater(30))).toBe(0);
  });

  it('measures how long ago the rest ran out', () => {
    expect(overdueSeconds(rest(90), secondsLater(150))).toBe(60);
  });
});

describe('isStale', () => {
  it('is false for a rest that just finished — that one deserves an alarm', () => {
    expect(isStale(rest(90), secondsLater(91))).toBe(false);
  });

  it('is true once the app has been away far longer than the rest', () => {
    expect(isStale(rest(90), secondsLater(90 + REST_STALE_AFTER_SECONDS + 1))).toBe(true);
  });
});

describe('adjustDuration', () => {
  it('extends a running rest', () => {
    expect(adjustDuration(rest(90), 15).durationSeconds).toBe(105);
  });

  it('shortens a running rest', () => {
    expect(adjustDuration(rest(90), -15).durationSeconds).toBe(75);
  });

  it('never goes below zero', () => {
    // Pressing "-15" on a nearly-finished timer means "I am done now".
    expect(adjustDuration(rest(10), -15).durationSeconds).toBe(0);
  });

  it('does not mutate the state it was given', () => {
    const original = rest(90);
    adjustDuration(original, 15);
    expect(original.durationSeconds).toBe(90);
  });
});

describe('formatDuration', () => {
  it.each([
    [90, '1:30'],
    [5, '0:05'],
    [0, '0:00'],
    [60, '1:00'],
    [599, '9:59'],
    [-5, '0:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
