import type { Unit } from './units';

export type Role = 'admin' | 'user';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type MediaType = 'image' | 'video';

export type Sex = 'male' | 'female';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: number;
  disabledAt?: number | null;
  /**
   * Display unit for weights. Belongs to the account rather than the device —
   * unlike theme and language, it describes how someone trains, not where they
   * happen to be sitting. Absent on the admin user list, which has no business
   * reading it.
   */
  unitPreference?: Unit;
  /**
   * Optional and self-declared. Exists only to pick the coefficient set for
   * relative-strength formulas; `null` is a real answer meaning "withdrawn".
   */
  sex?: Sex | null;
}

export interface Media {
  id: string;
  mediaType: MediaType;
  url: string;
  thumbnailUrl: string | null;
  originalName: string | null;
}

export interface Exercise {
  id: string;
  /** Human-visible sequential number used for filename-based media matching. */
  ref: number;
  /** de -> en -> es preferred resolved name (server-side fallback). */
  name: string;
  /** de -> en -> es preferred resolved instructions (server-side fallback). */
  instructions: string;
  nameDe: string;
  nameEn: string;
  nameEs: string;
  purposeDe: string;
  purposeEn: string;
  purposeEs: string;
  instructionsDe: string;
  instructionsEn: string;
  instructionsEs: string;
  category: string;
  difficulty: Difficulty;
  createdAt: number;
  updatedAt: number;
  /** Archived exercises are hidden from the catalog but stay readable from history. */
  archived?: boolean;
  archivedAt?: number | null;
  media: Media[];
}

/**
 * Warm-up sets must stay out of volume and 1RM estimates, drop sets belong to
 * the working set before them and start no rest. The distinction is what makes
 * later statistics honest, so it is recorded at logging time.
 */
export type SetType = 'warmup' | 'working' | 'drop';

export interface WorkoutSet {
  reps: number;
  /**
   * Always kilograms, whatever the user has chosen to see. Display and input
   * convert at the edge (`lib/units.ts`) so no stored number ever depends on a
   * preference that can change.
   */
  weight?: number;
  /** Absent on sets logged before set types existed; read as `'working'`. */
  type?: SetType;
  /**
   * Absent on sets logged before check-off existed. Those were recorded after
   * the fact and were all performed, so the read-default is `true` — treating
   * them as open would strand every historical session mid-workout.
   */
  done?: boolean;
  /** When the set was checked off; the rest timer counts from here. */
  completedAt?: number;
  /** Rate of perceived exertion, 5–10 in half steps. */
  rpe?: number;
}

/** Read-defaults for sets written before these fields existed. */
export const setType = (set: WorkoutSet): SetType => set.type ?? 'working';
export const isSetDone = (set: WorkoutSet): boolean => set.done ?? true;

export interface WorkoutEntry {
  exerciseId: string;
  /**
   * Reference number of the exercise as it stood when this was recorded.
   * A second handle back to the exercise if the id link is ever broken —
   * see backfillWorkoutRefs.js / relinkWorkoutEntries.js.
   */
  exerciseRef?: number;
  exerciseName: string;
  sets: WorkoutSet[];
}

export interface WorkoutSession {
  id: string;
  /** Save timestamp (epoch ms) — kept for sorting and backward compatibility. */
  date: number;
  /** Optional workout title. */
  title?: string;
  /** User-chosen start date/time (epoch ms); defaults to now when not set. */
  startedAt?: number;
  /** Manually entered duration in minutes. */
  durationMin?: number;
  /** Free-text notes for the session. */
  notes?: string;
  /** Last-modified timestamp (epoch ms); refreshed on every save, used for sync conflict resolution. */
  updatedAt: number;
  entries: WorkoutEntry[];
}

export const CATEGORIES = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'other',
] as const;
