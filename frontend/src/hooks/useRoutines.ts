import type { Routine } from '../lib/types';
import { syncRoutines } from '../api/routines';
import { createSyncedCollection } from '../lib/syncedCollection';
import { useAuth } from './useAuth';

const useRoutinesCollection = createSyncedCollection<Routine>({
  storageKey: 'jt_routines',
  syncFn: async (payload) => {
    const res = await syncRoutines(payload);
    return { items: res.routines, deletedIds: res.deletedIds, serverTime: res.serverTime };
  },
});

/**
 * Routine templates live on the device first, exactly like workout sessions
 * (`useWorkouts.ts`) — the second caller `createSyncedCollection` was built
 * for. No legacy cache to adopt here: routines did not exist before the
 * per-user, dirty-queued storage scheme did.
 */
export function useRoutines() {
  const { user } = useAuth();
  const collection = useRoutinesCollection(user?.id ?? null);

  return {
    routines: collection.items,
    loaded: collection.loaded,
    syncing: collection.syncing,
    lastSyncedAt: collection.lastSyncedAt,
    pendingCount: collection.pendingCount,
    saveRoutine: collection.save,
    deleteRoutine: collection.remove,
    sync: collection.sync,
  };
}
