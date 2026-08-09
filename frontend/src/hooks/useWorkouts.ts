import { useCallback, useEffect, useState } from 'react';
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
  }, [userId]);

  const persist = useCallback(
    async (next: WorkoutSession[]) => {
      setSessions(next);
      if (userId) await set(sessionsKey(userId), next);
    },
    [userId]
  );

  const addSession = useCallback(
    (session: WorkoutSession) => persist([session, ...sessions]),
    [sessions, persist]
  );

  const updateSession = useCallback(
    (session: WorkoutSession) =>
      persist(sessions.map((s) => (s.id === session.id ? session : s))),
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
    },
    [sessions, persist, userId]
  );

  const sync = useCallback(async (): Promise<SyncResult> => {
    if (!userId) return { pulled: 0, pushed: 0, deleted: 0 };
    setSyncing(true);
    try {
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

      return {
        pulled: response.workouts.length,
        pushed: sessions.length,
        deleted: response.deletedIds.length,
      };
    } finally {
      setSyncing(false);
    }
  }, [sessions, lastSyncedAt, persist, userId]);

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
