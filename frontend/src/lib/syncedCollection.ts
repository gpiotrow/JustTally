import { useCallback, useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import {
  mergeSynced,
  remainingDeletes,
  remainingDirty,
  type PendingDelete,
  type Syncable,
} from './syncMerge';

/**
 * The IndexedDB-and-React scaffolding a locally-first, synced collection
 * needs — dirty queue, tombstones, last-write-wins, cross-instance change
 * notification, in-flight dedupe — extracted from `useWorkouts.ts` once a
 * second caller (`useRoutines.ts`) made it possible to see what the two
 * actually share. The risky half, the merge arithmetic, already lived in
 * `syncMerge.ts` and is unchanged here; this only wraps it in storage and
 * state.
 */

export interface SyncResult {
  pulled: number;
  pushed: number;
  deleted: number;
}

export interface SyncedCollectionConfig<T extends Syncable> {
  /**
   * Namespace for the IndexedDB keys, e.g. `jt_workouts` or `jt_routines`.
   * Each key is further scoped by user id — see the module doc in
   * `useWorkouts.ts` for why that scoping exists.
   */
  storageKey: string;
  /** Pushes local changes and pulls server changes in one round trip. */
  syncFn: (payload: {
    lastSyncedAt: number;
    upserts: T[];
    deletes: PendingDelete[];
  }) => Promise<{ items: T[]; deletedIds: string[]; serverTime: number }>;
  /** Applied after every local write and every merge. Defaults to no reordering. */
  sortBy?: (items: T[]) => T[];
  /**
   * Runs once per signed-in user, before the first read, and is awaited
   * before anything else touches storage — the hook this powers exists for
   * `useWorkouts.ts`'s legacy-cache adoption, which must land before the
   * scoped keys are read or a device upgrading into per-user keys would see
   * an empty collection instead of its own history.
   */
  prepare?: (userId: string) => Promise<void>;
}

/**
 * Mount- and foreground-triggered syncs are throttled: navigating between
 * screens remounts the hook, and switching apps twice in a row is ordinary
 * behaviour. Coming back online bypasses the throttle — that is the moment
 * the queue is meant to drain.
 */
const AUTO_SYNC_MIN_INTERVAL_MS = 60_000;

export function createSyncedCollection<T extends Syncable>(config: SyncedCollectionConfig<T>) {
  const { storageKey, syncFn, prepare } = config;
  const sortBy = config.sortBy ?? ((items: T[]) => items);

  const itemsKey = (userId: string) => `${storageKey}:${userId}`;
  const pendingDeletesKey = (userId: string) => `${storageKey}_pending_deletes:${userId}`;
  const lastSyncedKey = (userId: string) => `${storageKey}_last_synced:${userId}`;
  const dirtyKey = (userId: string) => `${storageKey}_dirty:${userId}`;

  /**
   * Seed the push queue on first read for this user.
   *
   * Absent means "everything might be unsent" (a device that predates the
   * queue, or a brand new collection); empty means "the server has it all".
   * Only the first is backfilled, and only once — see `useWorkouts.ts` for
   * the incident this guards against.
   */
  async function seedDirtyQueue(userId: string, items: T[]) {
    const existing = await get<string[]>(dirtyKey(userId));
    if (existing !== undefined) return;
    await set(
      dirtyKey(userId),
      items.map((i) => i.id)
    );
  }

  async function markDirty(userId: string, id: string) {
    const current = (await get<string[]>(dirtyKey(userId))) ?? [];
    if (current.includes(id)) return;
    await set(dirtyKey(userId), [...current, id]);
  }

  /**
   * Every mounted instance holds its own copy of the items, so a write in one
   * leaves the others stale until they remount. Writers call `notifyChanged`,
   * every instance re-reads from IndexedDB.
   */
  const changeListeners = new Set<() => void>();
  function notifyChanged() {
    for (const listener of [...changeListeners]) listener();
  }

  /** One sync at a time, process-wide, so two mounted instances cannot double-push. */
  let inFlightSync: Promise<SyncResult> | null = null;
  let lastAutoSyncAt = 0;

  function useCollection(userId: string | null) {
    const [items, setItems] = useState<T[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
    const [pendingCount, setPendingCount] = useState(0);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
      const onChange = () => setRevision((r) => r + 1);
      changeListeners.add(onChange);
      return () => {
        changeListeners.delete(onChange);
      };
    }, []);

    useEffect(() => {
      if (!userId) {
        setItems([]);
        setLastSyncedAt(null);
        setPendingCount(0);
        setLoaded(false);
        return;
      }
      let cancelled = false;
      (async () => {
        if (prepare) await prepare(userId);
        const data = (await get<T[]>(itemsKey(userId))) ?? [];
        await seedDirtyQueue(userId, data);
        const [synced, dirty, deletes] = await Promise.all([
          get<number>(lastSyncedKey(userId)),
          get<string[]>(dirtyKey(userId)),
          get<PendingDelete[]>(pendingDeletesKey(userId)),
        ]);
        if (cancelled) return;
        setItems(sortBy(data));
        setLastSyncedAt(synced ?? 0);
        setPendingCount((dirty?.length ?? 0) + (deletes?.length ?? 0));
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, revision]);

    /**
     * Writes read the stored list first rather than the `items` in scope: the
     * state a callback closes over is the state of the render that created
     * it, and a sync landing in between makes that a snapshot of the past.
     */
    const save = useCallback(
      async (item: T) => {
        if (!userId) return;
        const current = (await get<T[]>(itemsKey(userId))) ?? [];
        const next = sortBy([...current.filter((i) => i.id !== item.id), item]);
        await set(itemsKey(userId), next);
        await markDirty(userId, item.id);
        setItems(next);
        notifyChanged();
      },
      [userId]
    );

    const remove = useCallback(
      async (id: string) => {
        if (!userId) return;
        const [current, pending] = await Promise.all([
          get<T[]>(itemsKey(userId)),
          get<PendingDelete[]>(pendingDeletesKey(userId)),
        ]);
        // The tombstone is what survives: the row is gone from this device
        // immediately, and the queue is what eventually tells the server.
        await set(pendingDeletesKey(userId), [
          ...(pending ?? []).filter((d) => d.id !== id),
          { id, deletedAt: Date.now() },
        ]);
        const remaining = (current ?? []).filter((i) => i.id !== id);
        await set(itemsKey(userId), remaining);
        const dirty = (await get<string[]>(dirtyKey(userId))) ?? [];
        await set(dirtyKey(userId), dirty.filter((d) => d !== id));
        setItems(remaining);
        notifyChanged();
      },
      [userId]
    );

    const sync = useCallback(async (): Promise<SyncResult> => {
      if (!userId) return { pulled: 0, pushed: 0, deleted: 0 };
      if (inFlightSync) return inFlightSync;

      setSyncing(true);
      inFlightSync = (async () => {
        const [storedItems, storedDirty, storedDeletes, storedSyncedAt] = await Promise.all([
          get<T[]>(itemsKey(userId)),
          get<string[]>(dirtyKey(userId)),
          get<PendingDelete[]>(pendingDeletesKey(userId)),
          get<number>(lastSyncedKey(userId)),
        ]);

        const dirtyIds = new Set(storedDirty ?? []);
        const pendingDeletes = storedDeletes ?? [];
        const upserts = (storedItems ?? []).filter((i) => dirtyIds.has(i.id));

        const pushedUpdatedAt = new Map(upserts.map((i) => [i.id, i.updatedAt]));
        const pushedDeletedAt = new Map(pendingDeletes.map((d) => [d.id, d.deletedAt]));

        const response = await syncFn({
          lastSyncedAt: storedSyncedAt ?? 0,
          upserts,
          deletes: pendingDeletes,
        });

        // Re-read: local state may have changed while the request was out.
        const [afterItems, afterDirty, afterDeletes] = await Promise.all([
          get<T[]>(itemsKey(userId)),
          get<string[]>(dirtyKey(userId)),
          get<PendingDelete[]>(pendingDeletesKey(userId)),
        ]);
        const dirtyNow = afterDirty ?? [];

        const merged = sortBy(
          mergeSynced({
            local: afterItems ?? [],
            incoming: response.items,
            deletedIds: response.deletedIds,
            dirtyIds: new Set(dirtyNow),
          })
        );

        const localById = new Map(merged.map((i) => [i.id, i]));
        await set(itemsKey(userId), merged);
        await set(dirtyKey(userId), remainingDirty(dirtyNow, pushedUpdatedAt, localById));
        await set(
          pendingDeletesKey(userId),
          remainingDeletes(afterDeletes ?? [], pushedDeletedAt)
        );
        await set(lastSyncedKey(userId), response.serverTime);

        setItems(merged);
        setLastSyncedAt(response.serverTime);
        // After the timestamp, not before: an instance re-reading in between
        // would pick up the merged items with a stale last-synced stamp.
        notifyChanged();

        return {
          pulled: response.items.length,
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
    }, [userId]);

    /**
     * The queue drains on its own: on mount (throttled), the moment the
     * device reports a connection, and when the app is brought back to the
     * foreground. The last of the three matters most in practice — phones
     * are unlocked far more often than they cross an offline/online boundary.
     */
    useEffect(() => {
      if (!userId || !loaded) return;

      const flush = (force: boolean) => {
        if (!navigator.onLine) return;
        if (!force && Date.now() - lastAutoSyncAt < AUTO_SYNC_MIN_INTERVAL_MS) return;
        lastAutoSyncAt = Date.now();
        // Swallowed deliberately: a background attempt that fails means the
        // connection is not usable yet. Nothing was lost — items stay queued
        // locally. Errors the user asked for still surface via a manual sync.
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
      items,
      loaded,
      syncing,
      lastSyncedAt,
      /** Local writes the server has not confirmed yet — edits plus deletions. */
      pendingCount,
      save,
      remove,
      sync,
    };
  }

  return useCollection;
}
