import type { Unit } from './units';
import type { MuscleGroup } from './muscles';
import type { EquipmentItem } from './equipment';
import type { GoalItem } from './goals';

export type Role = 'admin' | 'user';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export const DIFFICULTIES: readonly Difficulty[] = ['beginner', 'intermediate', 'advanced'];
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
  /**
   * Muscle-group codes (§ 2.4). Empty on exercises nobody has classified yet —
   * those simply contribute nothing to the recovery heatmap rather than
   * being guessed at.
   */
  musclesPrimary: MuscleGroup[];
  musclesSecondary: MuscleGroup[];
  /** Equipment codes required to perform this exercise. */
  equipment: EquipmentItem[];
  /** Training-goal tags (§ Teil 2). Distinct from the free-text purpose fields. */
  goals: GoalItem[];
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

/** RPE scale offered in the UI: whole numbers below 7, half-steps from 7 up. */
export const RPE_VALUES = [5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

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
  /** Superset: entries sharing the same id are clamped together as one unit. */
  groupId?: string;
  /**
   * Which routine exercise this entry started from, kept even after swapping
   * to an alternative. Not writable yet — routines (§ 7) are what sets it —
   * but carried through so an entry never silently loses it in the meantime.
   */
  plannedExerciseId?: string;
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
  /**
   * Which routine this session was instantiated from, and where in it. Purely
   * a backward-pointing label — there is no path from here back into the
   * routine, so nothing this session does can ever edit the template.
   */
  routineId?: string;
  weekIndex?: number;
  dayId?: string;
}

/** A named alternative exercise a routine exercise can be swapped for mid-workout. */
export interface RoutineAlternative {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
}

export interface RoutineExercise {
  exerciseId: string;
  exerciseRef?: number;
  exerciseName: string;
  /** Plan B, Plan C — offered in this order when the primary exercise is taken. */
  alternatives: RoutineAlternative[];
  targetSets: number;
  /** Text, not a number: real plans say "8-12" or "AMRAP", not just "10". */
  targetReps?: string;
  /** Always kilograms, like WorkoutSet.weight — converted at the display edge. */
  targetWeight?: number;
  targetRpe?: number;
  restSeconds?: number;
  /** Superset already baked into the plan; carried onto the instantiated entries. */
  groupId?: string;
  notes?: string;
}

export interface RoutineDay {
  id: string;
  name: string;
  exercises: RoutineExercise[];
}

export interface RoutineWeek {
  id: string;
  /** e.g. "Week 1" or "Deload" — optional, most routines only need position. */
  name?: string;
  days: RoutineDay[];
}

export interface Routine {
  id: string;
  name: string;
  description?: string;
  /** Periodization: several weeks, each with its own targets. */
  weeks: RoutineWeek[];
  updatedAt: number;
}

/**
 * A single manual body-weight log entry. There is no Health-app integration
 * (§ 1.1 — deliberately out of scope), so this is always hand-entered.
 */
export interface BodyWeight {
  id: string;
  /** When the weight was recorded (epoch ms) — not when the row was saved. */
  date: number;
  /** Always kilograms, the same invariant as every other stored weight. */
  kg: number;
  updatedAt: number;
}

export const CATEGORIES = [
  'chest',
  'back',
  'legs',
  'calves',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'other',
] as const;
