import { useCallback, useEffect, useState } from 'react';
import { del, get, set } from 'idb-keyval';
import type { WorkoutSession } from '../lib/types';
import { syncWorkouts, type WorkoutDelete } from '../api/workouts';
import { mergeSynced, remainingDeletes, remainingDirty, sortByRecency } from '../lib/syncMerge';
import { useAuth } from './useAuth';

/**
 * Cache keys are per user. They used to be global, which let the next account
 * on a shared device read the previous one's history — and worse, push it to
 * the server under its own id on the next sync, permanently copying one
 * person's training log into someone else's account.
 */
const sessionsKey = (userId: string) => `jt_workouts:${userId}`;
const pendingDeletesKey = (userId: string) => `jt_workouts_pending_deletes:${userId}`;
const lastSyncedKey = (userId: string) => `jt_workouts_last_synced:${userId}`;
/** Ids written since the server last confirmed them — the push queue. */
const dirtyKey = (userId: string) => `jt_workouts_dirty:${userId}`;

/** The pre-migration, ownerless keys. Read once, then removed. */
const LEGACY_SESSIONS_KEY = 'jt_workouts';
const LEGACY_PENDING_DELETES_KEY = 'jt_workouts_pending_deletes';
const LEGACY_LAST_SYNCED_KEY = 'jt_workouts_last_synced';

/**
 * Hand the ownerless cache to the user who is signed in now, then delete it.
 *
 * The legacy blob records no owner, so on a device that only ever had one
 * account — the ordinary case — this is exactly right and loses nothing,
 * including workouts that were never synced. On a shared device whoever signs
 * in first inherits it once; after that the keys are gone and the accounts are
 * separated for good.
 *
 * The delete runs even when nothing was adopted: a legacy blob left behind
 * because this user already has scoped data is precisely the blob that must not
 * survive for the next account.
 *
 * Safe to run concurrently — `Workout.tsx` mounts two instances of this hook.
 * Both would write the same values, and whichever deletes second finds the
 * keys already gone.
 */
async function adoptLegacyCache(userId: string) {
  const legacySessions = await get<WorkoutSession[]>(LEGACY_SESSIONS_KEY);
  const legacyDeletes = await get<WorkoutDelete[]>(LEGACY_PENDING_DELETES_KEY);
  const legacySynced = await get<number>(LEGACY_LAST_SYNCED_KEY);
  if (legacySessions === undefined && legacyDeletes === undefined && legacySynced === undefined) {
    return; // already migrated, or a device that never held the old cache
  }

  const alreadyScoped = await get<WorkoutSession[]>(sessionsKey(userId));
  if (alreadyScoped === undefined) {
    // All three move together. Sessions without their pending deletes would
    // resurrect workouts the user already deleted offline.
    if (legacySessions !== undefined) await set(sessionsKey(userId), legacySessions);
    if (legacyDeletes !== undefined) await set(pendingDeletesKey(userId), legacyDeletes);
    if (legacySynced !== undefined) await set(lastSyncedKey(userId), legacySynced);
  }

  await del(LEGACY_SESSIONS_KEY);
  await del(LEGACY_PENDING_DELETES_KEY);
  await del(LEGACY_LAST_SYNCED_KEY);
}

/**
 * Seed the push queue on a device that predates it.
 *
 * Before incremental push, every sync sent the complete session list, so there
 * was nothing to remember. A device upgrading into this build has sessions and
 * *no* queue — and an absent queue read as an empty one would mean nothing is
 * ever pushed again. Anything logged offline before the upgrade would live and
 * die on that phone.
 *
 * Absent therefore means "everything might be unsent"; empty means "the server
 * has it all". Only the first is backfilled, and only once.
 */
async function seedDirtyQueue(userId: string, sessions: WorkoutSession[]) {
  const existing = await get<string[]>(dirtyKey(userId));
  if (existing !== undefined) return;
  await set(dirtyKey(userId), sessions.map((s) => s.id));
}

/** Queue an id for the next push. */
async function markDirty(userId: string, id: string) {
  const current = (await get<string[]>(dirtyKey(userId))) ?? [];
  if (current.includes(id)) return;
  await set(dirtyKey(userId), [...current, id]);
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  deleted: number;
}

/**
 * Every mounted instance of this hook holds its own copy of the sessions, so a
 * write in one leaves the others showing yesterday's list until they remount.
 * That was survivable while the only writer was the screen you were looking
 * at; with a sync that fires on its own it is not — the History list would
 * quietly keep rendering pre-sync data.
 *
 * Writers call `notifyChanged()`, every instance re-reads from IndexedDB.
 */
const changeListeners = new Set<() => void>();

function notifyChanged() {
  for (const listener of [...changeListeners]) listener();
}

/**
 * One sync at a time, process-wide. Two mounted instances both reacting to the
 * same `online` event would otherwise push the same sessions twice.
 */
let inFlightSync: Promise<SyncResult> | null = null;

/**
 * Mount- and foreground-triggered syncs are throttled: navigating between
 * Training and Verlauf remounts the hook, and switching apps twice in a row is
 * ordinary behaviour. Coming back online bypasses the throttle — that is the
 * moment the queue is meant to drain.
 */
const AUTO_SYNC_MIN_INTERVAL_MS = 60_000;
let lastAutoSyncAt = 0;

/**
 * Workout sessions live on the device first (IndexedDB via idb-keyval) and can
 * optionally be pushed/pulled to the server on demand via `sync()`.
 */
export function useWorkouts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [revision, setRevision] = useState(0);

  // Re-read whenever another instance writes. Reads never notify, so this
  // cannot feed itself.
  useEffect(() => {
    const onChange = () => setRevision((r) => r + 1);
    changeListeners.add(onChange);
    return () => {
      changeListeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      // Signed out: hold nothing in memory that a next account could see.
      setSessions([]);
      setLastSyncedAt(null);
      setPendingCount(0);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      await adoptLegacyCache(userId);
      const data = (await get<WorkoutSession[]>(sessionsKey(userId))) ?? [];
      await seedDirtyQueue(userId, data);
      const [synced, dirty, deletes] = await Promise.all([
        get<number>(lastSyncedKey(userId)),
        get<string[]>(dirtyKey(userId)),
        get<WorkoutDelete[]>(pendingDeletesKey(userId)),
      ]);
      if (cancelled) return;
      setSessions(data);
      setLastSyncedAt(synced ?? 0);
      setPendingCount((dirty?.length ?? 0) + (deletes?.length ?? 0));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  /**
   * Writes read the stored list first rather than the `sessions` in scope.
   *
   * The state a callback closes over is the state of the render that created
   * it, and a sync landing in between makes that a snapshot of the past.
   * Writing it back would drop everything the sync had just pulled in.
   */
  const saveSession = useCallback(
    async (session: WorkoutSession) => {
      if (!userId) return;
      const current = (await get<WorkoutSession[]>(sessionsKey(userId))) ?? [];
      const next = sortByRecency([...current.filter((s) => s.id !== session.id), session]);
      await set(sessionsKey(userId), next);
      await markDirty(userId, session.id);
      setSessions(next);
      notifyChanged();
    },
    [userId]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      if (!userId) return;
      const [current, pending] = await Promise.all([
        get<WorkoutSession[]>(sessionsKey(userId)),
        get<WorkoutDelete[]>(pendingDeletesKey(userId)),
      ]);
      // The tombstone is what survives: the row is gone from this device
      // immediately, and the queue is what eventually tells the server.
      await set(pendingDeletesKey(userId), [
        ...(pending ?? []).filter((d) => d.id !== id),
        { id, deletedAt: Date.now() },
      ]);
      const remaining = (current ?? []).filter((s) => s.id !== id);
      await set(sessionsKey(userId), remaining);
      // Nothing left to push for an id that no longer exists.
      const dirty = (await get<string[]>(dirtyKey(userId))) ?? [];
      await set(dirtyKey(userId), dirty.filter((d) => d !== id));
      setSessions(remaining);
      notifyChanged();
    },
    [userId]
  );

  const sync = useCallback(async (): Promise<SyncResult> => {
    if (!userId) return { pulled: 0, pushed: 0, deleted: 0 };
    // Join the run already in progress rather than starting a second one.
    if (inFlightSync) return inFlightSync;

    setSyncing(true);
    inFlightSync = (async () => {
      // Read from storage, never from the render's closure: this callback can
      // be a few renders old by the time it runs.
      const [storedSessions, storedDirty, storedDeletes, storedSyncedAt] = await Promise.all([
        get<WorkoutSession[]>(sessionsKey(userId)),
        get<string[]>(dirtyKey(userId)),
        get<WorkoutDelete[]>(pendingDeletesKey(userId)),
        get<number>(lastSyncedKey(userId)),
      ]);

      const dirtyIds = new Set(storedDirty ?? []);
      const pendingDeletes = storedDeletes ?? [];
      // Only what has actually changed. The full list used to go out on every
      // run, which on a long history is a few hundred kilobytes over mobile
      // data for, most of the time, nothing at all.
      const upserts = (storedSessions ?? []).filter((s) => dirtyIds.has(s.id));

      // What this request is responsible for, so the queues can be cleared by
      // exactly that much afterwards and not by whatever they hold by then.
      const pushedUpdatedAt = new Map(upserts.map((s) => [s.id, s.updatedAt]));
      const pushedDeletedAt = new Map(pendingDeletes.map((d) => [d.id, d.deletedAt]));

      const response = await syncWorkouts({
        lastSyncedAt: storedSyncedAt ?? 0,
        upserts,
        deletes: pendingDeletes,
      });

      // Re-read: a set was probably checked off while that request was out.
      const [afterSessions, afterDirty, afterDeletes] = await Promise.all([
        get<WorkoutSession[]>(sessionsKey(userId)),
        get<string[]>(dirtyKey(userId)),
        get<WorkoutDelete[]>(pendingDeletesKey(userId)),
      ]);
      const dirtyNow = afterDirty ?? [];

      const merged = sortByRecency(
        mergeSynced({
          local: afterSessions ?? [],
          incoming: response.workouts,
          deletedIds: response.deletedIds,
          dirtyIds: new Set(dirtyNow),
        })
      );

      const localById = new Map(merged.map((s) => [s.id, s]));
      await set(sessionsKey(userId), merged);
      await set(dirtyKey(userId), remainingDirty(dirtyNow, pushedUpdatedAt, localById));
      await set(pendingDeletesKey(userId), remainingDeletes(afterDeletes ?? [], pushedDeletedAt));
      await set(lastSyncedKey(userId), response.serverTime);

      setSessions(merged);
      setLastSyncedAt(response.serverTime);
      // After the timestamp, not before: an instance re-reading in between
      // would pick up the merged sessions with a stale last-synced stamp.
      notifyChanged();

      return {
        pulled: response.workouts.length,
        pushed: upserts.length,
        deleted: response.deletedIds.length,
      };
    })();

    try {
      return await inFlightSync;
    } finally {
      inFlightSync = null;
      setSyncing(false);
    }
    // Deliberately depends on nothing but the account: everything else is read
    // fresh inside, which is what keeps this callback safe to hold onto.
  }, [userId]);

  /**
   * The queue drains on its own: on mount (throttled), the moment the device
   * reports a connection, and when the app is brought back to the foreground.
   * Without this, everything logged offline stayed on the one device until
   * someone remembered to press Sync — which is not something anyone remembers
   * after a workout.
   *
   * The last of the three matters most in practice: phones are unlocked far
   * more often than they cross an offline/online boundary, and the walk out of
   * the gym is usually where signal returns without any event firing.
   */
  useEffect(() => {
    if (!userId || !loaded) return;

    const flush = (force: boolean) => {
      if (!navigator.onLine) return;
      if (!force && Date.now() - lastAutoSyncAt < AUTO_SYNC_MIN_INTERVAL_MS) return;
      lastAutoSyncAt = Date.now();
      // Swallowed deliberately: a background attempt that fails means the
      // connection is not usable yet, which is the normal case this exists
      // for. Nothing was lost — the sessions stay queued locally and History
      // shows how many changes are waiting. Errors the user asked for still
      // surface, through the manual Sync button.
      void sync().catch(() => {});
    };

    flush(false);
    const onOnline = () => flush(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush(false);
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, loaded, sync]);

  return {
    sessions,
    loaded,
    syncing,
    lastSyncedAt,
    /** Local writes the server has not confirmed yet — edits plus deletions. */
    pendingCount,
    addSession: saveSession,
    updateSession: saveSession,
    deleteSession,
    sync,
  };
}
