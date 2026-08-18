import { del, get, set } from 'idb-keyval';
import type { SetType } from './types';
import type { TrackingMode } from './tracking';

/**
 * A snapshot of an in-progress workout, written locally well before the
 * explicit "Save" tap. `WorkoutEditor` used to hold every logged set in
 * `useState` only, so backgrounding the tab, a dead battery, or a reload
 * mid-workout lost everything since the last manual save — exactly the
 * failure mode an offline-first, in-a-gym app most needs to survive. This is
 * the recovery copy, not the record of truth: a successful save clears it.
 */
export interface WorkoutDraftSet {
  reps: string;
  weight: string;
  duration: string;
  distance: string;
  type: SetType;
  done: boolean;
  completedAt?: number;
  rpe?: number;
}

export interface WorkoutDraftEntry {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
  groupId?: string;
  plannedExerciseId?: string;
  /**
   * The tracking mode frozen on this entry when it was loaded from an
   * existing saved session; absent for an entry added fresh this session,
   * whose effective mode is resolved live from the current catalog until
   * save freezes it. Mirrors `WorkoutEntry.tracking` — see `types.ts`.
   */
  tracking?: TrackingMode;
  /** Mirrors `WorkoutEntry.settings` — see `types.ts`. */
  settings?: Record<string, string>;
  sets: WorkoutDraftSet[];
}

export interface WorkoutDraft {
  entries: WorkoutDraftEntry[];
  title: string;
  startedAt: string;
  duration: string;
  notes: string;
  savedAt: number;
}

const draftKey = (userId: string, sessionKey: string) => `jt_workout_draft:${userId}:${sessionKey}`;

export async function loadWorkoutDraft(
  userId: string,
  sessionKey: string
): Promise<WorkoutDraft | undefined> {
  return get<WorkoutDraft>(draftKey(userId, sessionKey));
}

export async function saveWorkoutDraft(
  userId: string,
  sessionKey: string,
  draft: Omit<WorkoutDraft, 'savedAt'>
): Promise<void> {
  await set(draftKey(userId, sessionKey), { ...draft, savedAt: Date.now() });
}

export async function clearWorkoutDraft(userId: string, sessionKey: string): Promise<void> {
  await del(draftKey(userId, sessionKey));
}
