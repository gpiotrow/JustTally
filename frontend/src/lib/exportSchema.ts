import type { Unit } from './units';
import type { Routine, WorkoutSession } from './types';

/**
 * The export file's format tag. Versioned so a future breaking change to the
 * shape gets a `v2` reader instead of silently misreading `v1` files —
 * exported data has to keep working for as long as someone might still have
 * the file.
 */
export const EXPORT_FORMAT = 'justtally-export/v1';

/**
 * Minimal, self-contained exercise record: enough to read a session without
 * this installation, not the full catalog entry (no media, no per-language
 * instructions — that content belongs to the catalog, not the user's data).
 *
 * `musclesPrimary`/`musclesSecondary` are reserved for § 11 (the muscle
 * taxonomy has not landed yet, so today's export always omits them). Adding
 * them later needs no format bump — they are optional from day one.
 */
export interface ExportedExercise {
  id: string;
  ref: number;
  name: string;
  musclesPrimary?: string[];
  musclesSecondary?: string[];
}

/** Reserved for § 10 (body-weight tracking does not exist yet) — always `[]` until then. */
export interface ExportedBodyWeight {
  date: number;
  /** Canonical kilograms, like every other weight in the export. */
  kg: number;
}

/**
 * Everything the export/import pair round-trips. Deliberately not the same
 * shape as the live app state: `exercises` here is the reduced
 * {@link ExportedExercise}, not the full catalog `Exercise`.
 */
export interface ExportBundle {
  exercises: ExportedExercise[];
  routines: Routine[];
  bodyWeights: ExportedBodyWeight[];
  sessions: WorkoutSession[];
}

/**
 * The file on disk. Weights inside `routines`/`sessions` are always
 * kilograms, whatever the user has chosen to see — `displayUnit` records
 * that choice for a human reading the file, and nothing else reads it.
 */
export interface JustTallyExportV1 {
  format: typeof EXPORT_FORMAT;
  exportedAt: number;
  displayUnit: Unit;
  exercises: ExportedExercise[];
  routines: Routine[];
  bodyWeights: ExportedBodyWeight[];
  sessions: WorkoutSession[];
}
