import { useCallback, useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import type { WorkoutSession } from '../lib/types';
import { syncWorkouts, type WorkoutDelete } from '../api/workouts';

const KEY = 'jt_workouts';
const PENDING_DELETES_KEY = 'jt_workouts_pending_deletes';
const LAST_SYNCED_KEY = 'jt_workouts_last_synced';

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
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([get<WorkoutSession[]>(KEY), get<number>(LAST_SYNCED_KEY)]).then(
      ([data, synced]) => {
        setSessions(data ?? []);
        setLastSyncedAt(synced ?? 0);
        setLoaded(true);
      }
    );
  }, []);

  const persist = useCallback(async (next: WorkoutSession[]) => {
    setSessions(next);
    await set(KEY, next);
  }, []);

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
      const pending = (await get<WorkoutDelete[]>(PENDING_DELETES_KEY)) ?? [];
      await set(PENDING_DELETES_KEY, [
        ...pending.filter((d) => d.id !== id),
        { id, deletedAt: Date.now() },
      ]);
      await persist(sessions.filter((s) => s.id !== id));
    },
    [sessions, persist]
  );

  const sync = useCallback(async (): Promise<SyncResult> => {
    setSyncing(true);
    try {
      const deletes = (await get<WorkoutDelete[]>(PENDING_DELETES_KEY)) ?? [];
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
      await set(PENDING_DELETES_KEY, []);
      await set(LAST_SYNCED_KEY, response.serverTime);
      setLastSyncedAt(response.serverTime);

      return {
        pulled: response.workouts.length,
        pushed: sessions.length,
        deleted: response.deletedIds.length,
      };
    } finally {
      setSyncing(false);
    }
  }, [sessions, lastSyncedAt, persist]);

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
