const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

// In-memory per-email lockout. Single-instance deployment (fly.io scale=1),
// so this is a soft throttle, not a durable security boundary — its job is
// to slow down credential stuffing against one account, not survive a restart.
const attempts = new Map();

export function isLocked(email) {
  const entry = attempts.get(email);
  return Boolean(entry?.lockedUntil && entry.lockedUntil > Date.now());
}

export function recordFailure(email) {
  const entry = attempts.get(email) || { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0;
  }
  attempts.set(email, entry);
}

export function clearFailures(email) {
  attempts.delete(email);
}
