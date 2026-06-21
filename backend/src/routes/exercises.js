import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import db from '../db/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { processImage, processVideo, deleteMediaFiles } from '../services/mediaService.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];

/** Attach media list to an exercise row. */
function withMedia(exercise) {
  const media = db
    .prepare('SELECT * FROM media WHERE exercise_id = ? ORDER BY position, created_at')
    .all(exercise.id)
    .map((m) => ({
      id: m.id,
      mediaType: m.media_type,
      url: m.url,
      thumbnailUrl: m.thumbnail_url,
      originalName: m.original_name,
    }));
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category,
    difficulty: exercise.difficulty,
    instructions: exercise.instructions,
    createdAt: exercise.created_at,
    updatedAt: exercise.updated_at,
    media,
  };
}

/**
 * GET /api/exercises — list all exercises with media (any authenticated user).
 * Supports ?category= and ?since= (epoch ms) for incremental sync.
 */
router.get('/', requireAuth, (req, res) => {
  const { category, since } = req.query;
  let rows;
  if (category) {
    rows = db.prepare('SELECT * FROM exercises WHERE category = ? ORDER BY name').all(category);
  } else if (since) {
    rows = db
      .prepare('SELECT * FROM exercises WHERE updated_at > ? ORDER BY name')
      .all(Number(since) || 0);
  } else {
    rows = db.prepare('SELECT * FROM exercises ORDER BY name').all();
  }
  res.json({ exercises: rows.map(withMedia), serverTime: Date.now() });
});

/**
 * GET /api/exercises/:id
 */
router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Exercise not found' });
  res.json({ exercise: withMedia(row) });
});

/**
 * POST /api/exercises — create (admin only).
 */
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, category, difficulty, instructions } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  const now = Date.now();
  const id = nanoid();
  db.prepare(
    `INSERT INTO exercises (id, name, category, difficulty, instructions, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    category || 'other',
    difficulty || 'beginner',
    instructions || '',
    req.user.sub,
    now,
    now
  );
  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(id);
  res.status(201).json({ exercise: withMedia(row) });
});

/**
 * PUT /api/exercises/:id — update (admin only).
 */
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const { name, category, difficulty, instructions } = req.body || {};
  if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  db.prepare(
    `UPDATE exercises SET name = ?, category = ?, difficulty = ?, instructions = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name ?? existing.name,
    category ?? existing.category,
    difficulty ?? existing.difficulty,
    instructions ?? existing.instructions,
    Date.now(),
    req.params.id
  );
  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  res.json({ exercise: withMedia(row) });
});

/**
 * DELETE /api/exercises/:id — delete exercise + its media files (admin only).
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const existing = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const mediaRows = db.prepare('SELECT * FROM media WHERE exercise_id = ?').all(req.params.id);
  for (const m of mediaRows) await deleteMediaFiles(m);

  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/**
 * POST /api/exercises/:id/media — upload an image or video (admin only).
 */
router.post(
  '/:id/media',
  requireAuth,
  requireAdmin,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
      if (!exercise) return res.status(404).json({ error: 'Exercise not found' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const isImage = req.file.mimetype.startsWith('image/');
      const isVideo = req.file.mimetype.startsWith('video/');
      if (!isImage && !isVideo) {
        return res.status(400).json({ error: 'Only image and video files are allowed' });
      }

      const processed = isImage
        ? await processImage(req.file.buffer, req.file.originalname)
        : await processVideo(req.file.buffer, req.file.originalname, req.file.mimetype);

      const id = nanoid();
      const now = Date.now();
      const maxPos =
        db.prepare('SELECT MAX(position) AS p FROM media WHERE exercise_id = ?').get(req.params.id)
          ?.p ?? -1;

      db.prepare(
        `INSERT INTO media (id, exercise_id, media_type, url, thumbnail_url, original_name, size_bytes, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        req.params.id,
        processed.mediaType,
        processed.url,
        processed.thumbnailUrl,
        processed.originalName,
        req.file.size,
        maxPos + 1,
        now
      );

      db.prepare('UPDATE exercises SET updated_at = ? WHERE id = ?').run(now, req.params.id);

      const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
      res.status(201).json({ exercise: withMedia(row) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/exercises/:id/media/:mediaId — remove a media item (admin only).
 */
router.delete('/:id/media/:mediaId', requireAuth, requireAdmin, async (req, res) => {
  const media = db
    .prepare('SELECT * FROM media WHERE id = ? AND exercise_id = ?')
    .get(req.params.mediaId, req.params.id);
  if (!media) return res.status(404).json({ error: 'Media not found' });

  await deleteMediaFiles(media);
  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.mediaId);
  db.prepare('UPDATE exercises SET updated_at = ? WHERE id = ?').run(Date.now(), req.params.id);

  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  res.json({ exercise: withMedia(row) });
});

export default router;
