import { useCallback, useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';
import type { WorkoutSession } from '../lib/types';

const KEY = 'jt_workouts';

/**
 * Workout sessions live only on the device (privacy by design).
 * Persisted in IndexedDB via idb-keyval.
 */
export function useWorkouts() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    get<WorkoutSession[]>(KEY).then((data) => {
      setSessions(data ?? []);
      setLoaded(true);
    });
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
    (id: string) => persist(sessions.filter((s) => s.id !== id)),
    [sessions, persist]
  );

  return { sessions, loaded, addSession, updateSession, deleteSession };
}
