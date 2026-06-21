import { useCallback, useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import { listExercises } from '../api/exercises';
import type { Exercise } from '../lib/types';

const CACHE_KEY = 'jt_exercises_cache';

/**
 * Loads exercises from the API, falling back to the IndexedDB cache when offline.
 * Successful fetches refresh the cache so the data is available offline later.
 */
export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listExercises();
      setExercises(res.exercises);
      setFromCache(false);
      await set(CACHE_KEY, res.exercises);
    } catch (err) {
      // Offline or server error — try the local cache.
      const cached = await get<Exercise[]>(CACHE_KEY);
      if (cached && cached.length) {
        setExercises(cached);
        setFromCache(true);
      } else {
        setError(err instanceof Error ? err.message : 'Could not load exercises');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { exercises, loading, error, fromCache, reload: load };
}
