import { del, get, set } from 'idb-keyval';
import type { WorkoutSession } from '../lib/types';
import { syncWorkouts, type WorkoutDelete } from '../api/workouts';
import { sortByRecency } from '../lib/syncMerge';
import { createSyncedCollection, type SyncResult } from '../lib/syncedCollection';
import { useAuth } from './useAuth';

export type { SyncResult };

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

const useWorkoutsCollection = createSyncedCollection<WorkoutSession>({
  storageKey: 'jt_workouts',
  syncFn: async (payload) => {
    const res = await syncWorkouts(payload);
    return { items: res.workouts, deletedIds: res.deletedIds, serverTime: res.serverTime };
  },
  sortBy: sortByRecency,
  prepare: adoptLegacyCache,
});

/**
 * Workout sessions live on the device first (IndexedDB via idb-keyval) and can
 * optionally be pushed/pulled to the server on demand via `sync()`.
 */
export function useWorkouts() {
  const { user } = useAuth();
  const collection = useWorkoutsCollection(user?.id ?? null);

  return {
    sessions: collection.items,
    loaded: collection.loaded,
    syncing: collection.syncing,
    lastSyncedAt: collection.lastSyncedAt,
    pendingCount: collection.pendingCount,
    addSession: collection.save,
    updateSession: collection.save,
    deleteSession: collection.remove,
    sync: collection.sync,
  };
}
