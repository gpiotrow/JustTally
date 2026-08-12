import db from '../db/database.js';

const EXPORT_FORMAT = 'justtally-export/v1';

/** Same shape the routines.js sync endpoint hands the client. */
function serializeRoutine(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    weeks: row.weeks ?? [],
    updatedAt: row.updated_at,
  };
}

/** Same shape the workouts.js sync endpoint hands the client. */
function serializeSession(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title ?? undefined,
    startedAt: row.started_at ?? undefined,
    durationMin: row.duration_min ?? undefined,
    notes: row.notes ?? undefined,
    entries: row.entries ?? [],
    updatedAt: row.updated_at,
  };
}

/** Every exerciseId a set of routines/sessions references — primary and alternatives. */
function referencedExerciseIds(routines, sessions) {
  const ids = new Set();
  for (const routine of routines) {
    for (const week of routine.weeks || []) {
      for (const day of week.days || []) {
        for (const ex of day.exercises || []) {
          ids.add(ex.exerciseId);
          for (const alt of ex.alternatives || []) ids.add(alt.exerciseId);
        }
      }
    }
  }
  for (const session of sessions) {
    for (const entry of session.entries || []) ids.add(entry.exerciseId);
  }
  return ids;
}

/**
 * Build a full `justtally-export/v1` file for one account, server-side.
 *
 * Mirrors the client-side builder (`frontend/src/lib/exportWorkouts.ts`)
 * field for field: exercises reduced to id/ref/name, weights already
 * canonical kg (nothing here ever touches `unit_preference` except to label
 * the file), routines and sessions carried through unchanged.
 *
 * `bodyWeights` stays `[]` — that collection doesn't exist yet (§ 10).
 */
export async function buildAccountExport(userId) {
  const [{ rows: userRows }, { rows: workoutRows }, { rows: routineRows }] = await Promise.all([
    db.query('SELECT unit_preference FROM users WHERE id = $1', [userId]),
    db.query('SELECT * FROM workouts WHERE user_id = $1 AND deleted_at IS NULL', [userId]),
    db.query('SELECT * FROM routines WHERE user_id = $1 AND deleted_at IS NULL', [userId]),
  ]);

  const sessions = workoutRows.map(serializeSession);
  const routines = routineRows.map(serializeRoutine);

  const ids = referencedExerciseIds(routines, sessions);
  let exercises = [];
  if (ids.size > 0) {
    const { rows } = await db.query('SELECT id, ref, name FROM exercises WHERE id = ANY($1)', [
      [...ids],
    ]);
    exercises = rows.map((r) => ({ id: r.id, ref: r.ref, name: r.name }));
  }

  return {
    format: EXPORT_FORMAT,
    exportedAt: Date.now(),
    displayUnit: userRows[0]?.unit_preference ?? 'kg',
    exercises,
    routines,
    bodyWeights: [],
    sessions,
  };
}
