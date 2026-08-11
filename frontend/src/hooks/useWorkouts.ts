import { useCallback, useEffect, useRef, useState } from 'react';
import { del, get, set } from 'idb-keyval';
import type { WorkoutSession } from '../lib/types';
import { syncWorkouts, type WorkoutDelete } from '../api/workouts';
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
 * Mount-triggered syncs are throttled: navigating between Training and Verlauf
 * remounts the hook, and the sync protocol pushes the *entire* session list
 * every time. Coming back online bypasses this — that is the moment the queue
 * is meant to drain.
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
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      await adoptLegacyCache(userId);
      const [data, synced] = await Promise.all([
        get<WorkoutSession[]>(sessionsKey(userId)),
        get<number>(lastSyncedKey(userId)),
      ]);
      if (cancelled) return;
      setSessions(data ?? []);
      setLastSyncedAt(synced ?? 0);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);

  const persist = useCallback(
    async (next: WorkoutSession[]) => {
      setSessions(next);
      if (userId) await set(sessionsKey(userId), next);
    },
    [userId]
  );

  const addSession = useCallback(
    async (session: WorkoutSession) => {
      await persist([session, ...sessions]);
      notifyChanged();
    },
    [sessions, persist]
  );

  const updateSession = useCallback(
    async (session: WorkoutSession) => {
      await persist(sessions.map((s) => (s.id === session.id ? session : s)));
      notifyChanged();
    },
    [sessions, persist]
  );

  const deleteSession = useCallback(
    async (id: string) => {
      if (!userId) return;
      const pending = (await get<WorkoutDelete[]>(pendingDeletesKey(userId))) ?? [];
      await set(pendingDeletesKey(userId), [
        ...pending.filter((d) => d.id !== id),
        { id, deletedAt: Date.now() },
      ]);
      await persist(sessions.filter((s) => s.id !== id));
      notifyChanged();
    },
    [sessions, persist, userId]
  );

  const sync = useCallback(async (): Promise<SyncResult> => {
    if (!userId) return { pulled: 0, pushed: 0, deleted: 0 };
    // Join the run already in progress rather than starting a second one.
    if (inFlightSync) return inFlightSync;

    setSyncing(true);
    inFlightSync = (async () => {
      const deletes = (await get<WorkoutDelete[]>(pendingDeletesKey(userId))) ?? [];
      const response = await syncWorkouts({
        lastSyncedAt: lastSyncedAt ?? 0,
        upserts: sessions,
        deletes,
      });

      const deletedIdSet = new Set(response.deletedIds);
      const byId = new Map(sessions.map((s) => [s.id, s]));
      for (const incoming of response.workouts) byId.set(incoming.id, incoming);
      for (const id of deletedIdSet) byId.delete(id);
      const merged = [...byId.values()].sort((a, b) => (b.startedAt ?? b.date) - (a.startedAt ?? a.date));

      await persist(merged);
      await set(pendingDeletesKey(userId), []);
      await set(lastSyncedKey(userId), response.serverTime);
      setLastSyncedAt(response.serverTime);
      // After the timestamp, not before: an instance re-reading in between
      // would pick up the merged sessions with a stale last-synced stamp.
      notifyChanged();

      return {
        pulled: response.workouts.length,
        pushed: sessions.length,
        deleted: response.deletedIds.length,
      };
    })();

    try {
      return await inFlightSync;
    } finally {
      inFlightSync = null;
      setSyncing(false);
    }
  }, [sessions, lastSyncedAt, persist, userId]);

  // `sync` gets a new identity on every session change; the listener below must
  // not be torn down and re-armed each time, so it reaches the current one
  // through a ref instead of a dependency.
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  /**
   * The queue drains on its own: once on mount (throttled) and again the
   * moment the device reports a connection. Without this, everything logged
   * offline stayed on the one device until someone remembered to press Sync —
   * which is not something anyone remembers after a workout.
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
      // shows how stale they are via its last-synced stamp. Errors the user
      // asked for still surface, through the manual Sync button.
      void syncRef.current().catch(() => {});
    };

    flush(false);
    const onOnline = () => flush(true);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [userId, loaded]);

  return {
    sessions,
    loaded,
    syncing,
    lastSyncedAt,
    addSession,
    updateSession,
    deleteSession,
    sync,
  };
}
