import { describe, it, expect, afterEach, vi } from 'vitest';
import { isLocked, recordFailure, clearFailures } from './loginLockout.js';

describe('loginLockout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports an email as not locked before any failures', () => {
    expect(isLocked('fresh@example.com')).toBe(false);
  });

  it('stays unlocked for attempts below the threshold', () => {
    const email = 'below-threshold@example.com';
    for (let i = 0; i < 4; i++) recordFailure(email);
    expect(isLocked(email)).toBe(false);
  });

  it('locks the email after 5 failed attempts', () => {
    const email = 'locked@example.com';
    for (let i = 0; i < 5; i++) recordFailure(email);
    expect(isLocked(email)).toBe(true);
  });

  it('unlocks automatically once the lock window has passed', () => {
    const email = 'expires@example.com';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 5; i++) recordFailure(email);
    expect(isLocked(email)).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T00:16:00Z')); // 16 min later, past the 15 min window
    expect(isLocked(email)).toBe(false);
  });

  it('clearFailures resets the lock immediately', () => {
    const email = 'cleared@example.com';
    for (let i = 0; i < 5; i++) recordFailure(email);
    expect(isLocked(email)).toBe(true);

    clearFailures(email);
    expect(isLocked(email)).toBe(false);
  });

  it('tracks each email independently', () => {
    const a = 'a@example.com';
    const b = 'b@example.com';
    for (let i = 0; i < 5; i++) recordFailure(a);
    expect(isLocked(a)).toBe(true);
    expect(isLocked(b)).toBe(false);
  });
});
