export type Role = 'admin' | 'user';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type MediaType = 'image' | 'video';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: number;
  disabledAt?: number | null;
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

export interface WorkoutSet {
  reps: number;
  weight?: number;
}

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
