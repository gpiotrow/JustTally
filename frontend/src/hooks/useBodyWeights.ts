import type { BodyWeight } from '../lib/types';
import { syncBodyWeights } from '../api/bodyWeights';
import { createSyncedCollection } from '../lib/syncedCollection';
import { useAuth } from './useAuth';

const byDateDescending = (items: BodyWeight[]) => [...items].sort((a, b) => b.date - a.date);

const useBodyWeightsCollection = createSyncedCollection<BodyWeight>({
  storageKey: 'jt_body_weights',
  syncFn: async (payload) => {
    const res = await syncBodyWeights(payload);
    return { items: res.bodyWeights, deletedIds: res.deletedIds, serverTime: res.serverTime };
  },
  sortBy: byDateDescending,
});

/**
 * Manual body-weight log entries, offline-first exactly like workouts and
 * routines — the third caller of `createSyncedCollection`. Newest first, the
 * order every reader of this hook (the settings log, the relative-strength
 * lookup) wants.
 */
export function useBodyWeights() {
  const { user } = useAuth();
  const collection = useBodyWeightsCollection(user?.id ?? null);

  return {
    bodyWeights: collection.items,
    loaded: collection.loaded,
    syncing: collection.syncing,
    lastSyncedAt: collection.lastSyncedAt,
    pendingCount: collection.pendingCount,
    saveBodyWeight: collection.save,
    deleteBodyWeight: collection.remove,
    sync: collection.sync,
  };
}
