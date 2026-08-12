import { setType, isSetDone, type WorkoutSession } from './types';

/**
 * Flat, spreadsheet-friendly export: one row per set. This is a convenience
 * format, not the round-trip path — `groupId`/`plannedExerciseId` and the
 * distinction between "field absent" and "field empty" are both lost when
 * everything is flattened to one row per set. Use `exportWorkouts.ts` when
 * the data needs to come back in.
 */
export const CSV_EXPORT_COLUMNS = [
  'date',
  'session_title',
  'exercise_name',
  'set_number',
  'type',
  'reps',
  'weight_kg',
  'rpe',
  'done',
] as const;

/** Quote a field for `;`-delimited CSV, doubling any embedded quotes — same rule as the exercise-catalog CSV. */
function csvField(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** `YYYY-MM-DD`, the one date shape every spreadsheet parses without a locale guess. */
function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * Serialize sessions to one row per set. Deliberately lossy and labelled as
 * such wherever it is offered in the UI — the JSON export is what "verlustfrei"
 * refers to.
 */
export function sessionsToCsv(sessions: WorkoutSession[]): string {
  const lines = [CSV_EXPORT_COLUMNS.join(';')];
  for (const session of sessions) {
    for (const entry of session.entries) {
      entry.sets.forEach((set, index) => {
        lines.push(
          [
            isoDate(session.date),
            session.title ?? '',
            entry.exerciseName,
            index + 1,
            setType(set),
            set.reps,
            set.weight ?? '',
            set.rpe ?? '',
            isSetDone(set),
          ]
            .map(csvField)
            .join(';')
        );
      });
    }
  }
  return `${lines.join('\n')}\n`;
}
