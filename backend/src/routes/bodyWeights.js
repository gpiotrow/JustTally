import { Router } from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { syncLimiter } from '../middleware/rateLimiters.js';

const router = Router();

/** Convert a body_weights row to the camelCase shape the client uses. */
function serialize(row) {
  return {
    id: row.id,
    date: row.date,
    kg: row.kg,
    updatedAt: row.updated_at,
  };
}

function isValidEntry(b) {
  return (
    b &&
    typeof b.id === 'string' &&
    Number.isFinite(b.date) &&
    b.date > 0 &&
    typeof b.kg === 'number' &&
    Number.isFinite(b.kg) &&
    b.kg > 0
  );
}

/**
 * POST /api/body-weights/sync — push local changes and pull server changes in
 * one round trip. Same protocol as /api/routines/sync and /api/workouts/sync:
 * scoped to the authenticated user, last-write-wins by updatedAt/deletedAt.
 */
router.post('/sync', requireAuth, syncLimiter, async (req, res) => {
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

    for (const entry of upserts || []) {
      if (!isValidEntry(entry)) continue;
      const incomingUpdatedAt = Number(entry.updatedAt) || now;

      const { rows: existingRows } = await client.query(
        'SELECT * FROM body_weights WHERE id = $1 AND user_id = $2',
        [entry.id, userId]
      );
      const existing = existingRows[0];
      if (existing && incomingUpdatedAt < Number(existing.updated_at)) continue; // stale write, ignore

      if (existing) {
        await client.query(
          `UPDATE body_weights
             SET date = $1, kg = $2, updated_at = $3, deleted_at = NULL
           WHERE id = $4 AND user_id = $5`,
          [entry.date, entry.kg, incomingUpdatedAt, entry.id, userId]
        );
      } else {
        await client.query(
          `INSERT INTO body_weights (id, user_id, date, kg, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
          [entry.id, userId, entry.date, entry.kg, now, incomingUpdatedAt]
        );
      }
    }

    for (const del of deletes || []) {
      if (!del || typeof del.id !== 'string') continue;
      const deletedAt = Number(del.deletedAt) || now;
      const { rows: existingRows } = await client.query(
        'SELECT * FROM body_weights WHERE id = $1 AND user_id = $2',
        [del.id, userId]
      );
      const existing = existingRows[0];
      if (!existing) continue; // nothing to delete locally; client never pushed this row
      if (deletedAt < Number(existing.updated_at)) continue; // a newer edit supersedes this delete
      await client.query(
        'UPDATE body_weights SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
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
    'SELECT * FROM body_weights WHERE user_id = $1 AND updated_at > $2',
    [userId, since]
  );

  const bodyWeights = changedRows.filter((r) => !r.deleted_at).map(serialize);
  const deletedIds = changedRows.filter((r) => r.deleted_at).map((r) => r.id);

  res.json({ bodyWeights, deletedIds, serverTime: Date.now() });
});

export default router;
