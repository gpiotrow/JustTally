import { Router } from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * Convert a routines row to the camelCase Routine shape the client uses.
 * `weeks` is jsonb, so pg hands back a parsed array — no JSON.parse here.
 */
function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    weeks: row.weeks ?? [],
    updatedAt: row.updated_at,
  };
}

function isValidAlternative(a) {
  return (
    a &&
    typeof a.exerciseId === 'string' &&
    typeof a.exerciseName === 'string' &&
    (a.exerciseRef === undefined || (Number.isInteger(a.exerciseRef) && a.exerciseRef > 0))
  );
}

function isValidRoutineExercise(e) {
  return (
    e &&
    typeof e.exerciseId === 'string' &&
    typeof e.exerciseName === 'string' &&
    (e.exerciseRef === undefined || (Number.isInteger(e.exerciseRef) && e.exerciseRef > 0)) &&
    Array.isArray(e.alternatives) &&
    e.alternatives.every(isValidAlternative) &&
    Number.isInteger(e.targetSets) &&
    e.targetSets > 0 &&
    (e.targetReps === undefined || typeof e.targetReps === 'string') &&
    (e.targetWeight === undefined || typeof e.targetWeight === 'number') &&
    (e.targetRpe === undefined ||
      (typeof e.targetRpe === 'number' && e.targetRpe >= 5 && e.targetRpe <= 10)) &&
    (e.restSeconds === undefined || (Number.isFinite(e.restSeconds) && e.restSeconds >= 0)) &&
    (e.groupId === undefined || typeof e.groupId === 'string') &&
    (e.notes === undefined || typeof e.notes === 'string')
  );
}

function isValidDay(d) {
  return (
    d &&
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    Array.isArray(d.exercises) &&
    d.exercises.every(isValidRoutineExercise)
  );
}

function isValidWeek(w) {
  return (
    w &&
    typeof w.id === 'string' &&
    (w.name === undefined || typeof w.name === 'string') &&
    Array.isArray(w.days) &&
    w.days.every(isValidDay)
  );
}

function isValidRoutine(r) {
  return (
    r &&
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    (r.description === undefined || typeof r.description === 'string') &&
    Array.isArray(r.weeks) &&
    r.weeks.every(isValidWeek)
  );
}

/** Every exerciseId a routine references — primary and alternatives — across all its weeks/days. */
function referencedExerciseIds(routine) {
  const ids = new Set();
  for (const week of routine.weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        ids.add(ex.exerciseId);
        for (const alt of ex.alternatives) ids.add(alt.exerciseId);
      }
    }
  }
  return ids;
}

/**
 * POST /api/routines/sync — push local changes and pull server changes in one round trip.
 * Same protocol as /api/workouts/sync: scoped to the authenticated user,
 * last-write-wins by updatedAt/deletedAt.
 */
router.post('/sync', requireAuth, async (req, res) => {
  const { lastSyncedAt, upserts, deletes } = req.body || {};
  const since = Number(lastSyncedAt) || 0;
  const userId = req.user.sub;

  if (upserts !== undefined && !Array.isArray(upserts)) {
    return res.status(400).json({ error: 'upserts must be an array' });
  }
  if (deletes !== undefined && !Array.isArray(deletes)) {
    return res.status(400).json({ error: 'deletes must be an array' });
  }

  // Structurally valid first; whether the exercises they point at actually
  // exist is checked in one round trip below rather than per routine.
  const candidates = (upserts || []).filter(isValidRoutine);

  const allIds = new Set();
  for (const routine of candidates) {
    for (const id of referencedExerciseIds(routine)) allIds.add(id);
  }
  let existingIds = new Set();
  if (allIds.size > 0) {
    const { rows } = await db.query('SELECT id FROM exercises WHERE id = ANY($1)', [[...allIds]]);
    existingIds = new Set(rows.map((r) => r.id));
  }
  // A routine pointing at an exercise that no longer exists would fail to
  // instantiate later — rejected here rather than stored and discovered then.
  const valid = candidates.filter((routine) =>
    [...referencedExerciseIds(routine)].every((id) => existingIds.has(id))
  );

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();

    for (const routine of valid) {
      const incomingUpdatedAt = Number(routine.updatedAt) || now;

      const { rows: existingRows } = await client.query(
        'SELECT * FROM routines WHERE id = $1 AND user_id = $2',
        [routine.id, userId]
      );
      const existing = existingRows[0];
      if (existing && incomingUpdatedAt < Number(existing.updated_at)) continue; // stale write, ignore

      const weeksJson = JSON.stringify(routine.weeks);

      if (existing) {
        await client.query(
          `UPDATE routines
             SET name = $1, description = $2, weeks = $3::jsonb, updated_at = $4, deleted_at = NULL
           WHERE id = $5 AND user_id = $6`,
          [routine.name, routine.description ?? null, weeksJson, incomingUpdatedAt, routine.id, userId]
        );
      } else {
        await client.query(
          `INSERT INTO routines
             (id, user_id, name, description, weeks, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NULL)`,
          [
            routine.id,
            userId,
            routine.name,
            routine.description ?? null,
            weeksJson,
            now,
            incomingUpdatedAt,
          ]
        );
      }
    }

    for (const del of deletes || []) {
      if (!del || typeof del.id !== 'string') continue;
      const deletedAt = Number(del.deletedAt) || now;
      const { rows: existingRows } = await client.query(
        'SELECT * FROM routines WHERE id = $1 AND user_id = $2',
        [del.id, userId]
      );
      const existing = existingRows[0];
      if (!existing) continue; // nothing to delete locally; client never pushed this row
      if (deletedAt < Number(existing.updated_at)) continue; // a newer edit supersedes this delete
      await client.query(
        'UPDATE routines SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
        [deletedAt, deletedAt, del.id, userId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows: changedRows } = await db.query(
    'SELECT * FROM routines WHERE user_id = $1 AND updated_at > $2',
    [userId, since]
  );

  const routines = changedRows.filter((r) => !r.deleted_at).map(serialize);
  const deletedIds = changedRows.filter((r) => r.deleted_at).map((r) => r.id);

  res.json({ routines, deletedIds, serverTime: Date.now() });
});

export default router;
