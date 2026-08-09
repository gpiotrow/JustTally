import { useCallback, useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { addFavorite, listFavorites, removeFavorite } from '../api/favorites';
import { useAuth } from './useAuth';
import { useOnline } from './useOnline';

/**
 * Keyed by user id, not a single shared key: on a shared device the previous
 * account's favorites would otherwise show up for the next one until the first
 * successful fetch replaced them.
 */
function cacheKeyFor(userId: string) {
  return `jt_favorites:${userId}`;
}

/**
 * The user's favorite exercises.
 *
 * No sync protocol here, unlike workouts: this is a small, conflict-poor set of
 * ids, so the cost of tombstones and last-write-wins would buy nothing. Changes
 * are applied optimistically and pushed immediately; a failed push is rolled
 * back and reported rather than left to look like it worked.
 *
 * Offline the cached list is still *readable* — that is the point of having the
 * favorites at the gym — but toggling is disabled, since there is nowhere to
 * push the change and no queue to hold it.
 */
export function useFavorites() {
  const { user } = useAuth();
  const online = useOnline();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Ids with a request in flight. A second tap while the first is unresolved
   * would race: if the responses landed out of order the server and the UI
   * would disagree with nothing to correct them.
   */
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const cancelledRef = useRef(false);

  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setFavoriteIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listFavorites();
      if (cancelledRef.current) return;
      setFavoriteIds(new Set(res.exerciseIds));
      await set(cacheKeyFor(userId), res.exerciseIds);
    } catch {
      // Offline or server error — fall back to the local cache. Not surfaced as
      // an error: a readable favorites list is the expected offline state.
      const cached = await get<string[]>(cacheKeyFor(userId));
      if (!cancelledRef.current && cached) setFavoriteIds(new Set(cached));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const isFavorite = useCallback((exerciseId: string) => favoriteIds.has(exerciseId), [favoriteIds]);

  /**
   * Flip one exercise's favorite state.
   *
   * Only the single id is added or removed on both the optimistic write and the
   * rollback — replacing the whole set would let a failed toggle of one exercise
   * undo a concurrent, successful toggle of another.
   */
  const toggle = useCallback(
    async (exerciseId: string) => {
      if (!online || !userId || pendingIds.has(exerciseId)) return;

      const wasFavorite = favoriteIds.has(exerciseId);
      setError(null);
      setPendingIds((prev) => new Set(prev).add(exerciseId));
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(exerciseId);
        else next.add(exerciseId);
        return next;
      });

      try {
        if (wasFavorite) await removeFavorite(exerciseId);
        else await addFavorite(exerciseId);
        // Refresh the offline copy only after the server confirmed, so the
        // cache can never claim a favorite the server rejected.
        setFavoriteIds((current) => {
          void set(cacheKeyFor(userId), [...current]);
          return current;
        });
      } catch (err) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(exerciseId);
          else next.delete(exerciseId);
          return next;
        });
        setError(err instanceof Error ? err.message : 'Could not update favorite');
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(exerciseId);
          return next;
        });
      }
    },
    [online, userId, favoriteIds, pendingIds]
  );

  return {
    favoriteIds,
    isFavorite,
    toggle,
    loading,
    error,
    /** False while offline: there is no queue to hold an unsent change. */
    canToggle: online,
    isPending: useCallback((exerciseId: string) => pendingIds.has(exerciseId), [pendingIds]),
    reload: load,
  };
}
