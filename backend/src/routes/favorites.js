import { Router } from 'express';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * Favorites are strictly per-user data. Every query below is constrained by
 * `req.user.sub` — never by an id taken from the request — so there is no
 * request shape that reaches another user's rows. The exercise id in the path
 * only ever selects *which of the caller's own* favorites is touched.
 */

/**
 * GET /api/favorites — the caller's favorite exercise ids.
 *
 * Returns ids rather than whole exercises: the client already holds the
 * catalog (and its offline cache), so shipping the rows again would duplicate
 * that payload and give the two copies a chance to disagree. It also means
 * archived exercises need no special handling here — they are absent from the
 * catalog the client filters against, so they drop out of the favorites view
 * on their own while the row survives for a later un-archive.
 */
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT exercise_id FROM favorites WHERE user_id = $1 ORDER BY created_at',
    [req.user.sub]
  );
  res.json({ exerciseIds: rows.map((r) => r.exercise_id) });
});

/**
 * PUT /api/favorites/:exerciseId — mark as favorite (admin or user).
 *
 * Idempotent: marking an existing favorite again succeeds and leaves the
 * original `created_at` intact, so the list keeps its insertion order and a
 * retry after a flaky connection cannot reorder it.
 */
router.put('/:exerciseId', requireAuth, async (req, res) => {
  const { rows: exerciseRows } = await db.query('SELECT id FROM exercises WHERE id = $1', [
    req.params.exerciseId,
  ]);
  if (!exerciseRows[0]) return res.status(404).json({ error: 'Exercise not found' });

  await db.query(
    `INSERT INTO favorites (user_id, exercise_id, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, exercise_id) DO NOTHING`,
    [req.user.sub, req.params.exerciseId, Date.now()]
  );
  res.json({ ok: true, favorite: true });
});

/**
 * DELETE /api/favorites/:exerciseId — remove from favorites.
 *
 * Answers 200 even when nothing was stored: the caller's intent ("this must
 * not be a favorite") is satisfied either way, and a 404 would make an
 * un-favorite retried after a dropped response look like a failure.
 */
router.delete('/:exerciseId', requireAuth, async (req, res) => {
  await db.query('DELETE FROM favorites WHERE user_id = $1 AND exercise_id = $2', [
    req.user.sub,
    req.params.exerciseId,
  ]);
  res.json({ ok: true, favorite: false });
});

export default router;
