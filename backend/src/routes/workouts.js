import { Router } from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/** Convert a workouts row to the camelCase WorkoutSession shape the client uses. */
function serialize(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title ?? undefined,
    startedAt: row.started_at ?? undefined,
    durationMin: row.duration_min ?? undefined,
    notes: row.notes ?? undefined,
    entries: JSON.parse(row.entries || '[]'),
    updatedAt: row.updated_at,
  };
}

function isValidEntries(entries) {
  return (
    Array.isArray(entries) &&
    entries.every(
      (e) =>
        e &&
        typeof e.exerciseId === 'string' &&
        typeof e.exerciseName === 'string' &&
        Array.isArray(e.sets) &&
        e.sets.every((s) => s && typeof s.reps === 'number')
    )
  );
}

/**
 * POST /api/workouts/sync — push local changes and pull server changes in one round trip.
 * Scoped to the authenticated user; last-write-wins by updatedAt/deletedAt.
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

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();

    for (const session of upserts || []) {
      if (!session || typeof session.id !== 'string') continue;
      if (!isValidEntries(session.entries)) continue;
      const incomingUpdatedAt = Number(session.updatedAt) || now;

      const { rows: existingRows } = await client.query(
        'SELECT * FROM workouts WHERE id = $1 AND user_id = $2',
        [session.id, userId]
      );
      const existing = existingRows[0];
      if (existing && incomingUpdatedAt < Number(existing.updated_at)) continue; // stale write, ignore

      const entriesJson = JSON.stringify(session.entries);
      const date = Number(session.date) || incomingUpdatedAt;

      if (existing) {
        await client.query(
          `UPDATE workouts
             SET title = $1, started_at = $2, duration_min = $3, notes = $4, entries = $5, date = $6, updated_at = $7, deleted_at = NULL
           WHERE id = $8 AND user_id = $9`,
          [
            session.title ?? null,
            session.startedAt ?? null,
            session.durationMin ?? null,
            session.notes ?? null,
            entriesJson,
            date,
            incomingUpdatedAt,
            session.id,
            userId,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO workouts
             (id, user_id, title, started_at, duration_min, notes, entries, date, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL)`,
          [
            session.id,
            userId,
            session.title ?? null,
            session.startedAt ?? null,
            session.durationMin ?? null,
            session.notes ?? null,
            entriesJson,
            date,
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
        'SELECT * FROM workouts WHERE id = $1 AND user_id = $2',
        [del.id, userId]
      );
      const existing = existingRows[0];
      if (!existing) continue; // nothing to delete locally; client never pushed this row
      if (deletedAt < Number(existing.updated_at)) continue; // a newer edit supersedes this delete
      await client.query(
        'UPDATE workouts SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
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
    'SELECT * FROM workouts WHERE user_id = $1 AND updated_at > $2',
    [userId, since]
  );

  const workouts = changedRows.filter((r) => !r.deleted_at).map(serialize);
  const deletedIds = changedRows.filter((r) => r.deleted_at).map((r) => r.id);

  res.json({ workouts, deletedIds, serverTime: Date.now() });
});

export default router;
