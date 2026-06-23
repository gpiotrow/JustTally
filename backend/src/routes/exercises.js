import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import db from '../db/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { processImage, processVideo, deleteMediaFiles } from '../services/mediaService.js';
import { parseExercisesCsv } from '../services/csvImport.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

const VALID_DIFFICULTY = ['beginner', 'intermediate', 'advanced'];

/** German-preferred resolution of a bilingual field, with fallback to the other. */
function resolve(de, en) {
  const d = (de || '').trim();
  const e = (en || '').trim();
  return d || e;
}

/** Attach media list to an exercise row and expose bilingual + resolved fields. */
async function withMedia(exercise) {
  const { rows: media } = await db.query(
    'SELECT * FROM media WHERE exercise_id = $1 ORDER BY position, created_at',
    [exercise.id]
  );
  return {
    id: exercise.id,
    // Resolved (German-preferred) values for back-compat and sorting.
    name: exercise.name,
    instructions: exercise.instructions,
    // Bilingual source-of-truth fields.
    nameDe: exercise.name_de ?? '',
    nameEn: exercise.name_en ?? '',
    instructionsDe: exercise.instructions_de ?? '',
    instructionsEn: exercise.instructions_en ?? '',
    category: exercise.category,
    difficulty: exercise.difficulty,
    createdAt: exercise.created_at,
    updatedAt: exercise.updated_at,
    media: media.map((m) => ({
      id: m.id,
      mediaType: m.media_type,
      url: m.url,
      thumbnailUrl: m.thumbnail_url,
      originalName: m.original_name,
    })),
  };
}

/**
 * GET /api/exercises — list all exercises with media (any authenticated user).
 * Supports ?category= and ?since= (epoch ms) for incremental sync.
 */
router.get('/', requireAuth, async (req, res) => {
  const { category, since } = req.query;
  let rows;
  if (category) {
    ({ rows } = await db.query('SELECT * FROM exercises WHERE category = $1 ORDER BY name', [
      category,
    ]));
  } else if (since) {
    ({ rows } = await db.query(
      'SELECT * FROM exercises WHERE updated_at > $1 ORDER BY name',
      [Number(since) || 0]
    ));
  } else {
    ({ rows } = await db.query('SELECT * FROM exercises ORDER BY name'));
  }
  res.json({ exercises: await Promise.all(rows.map(withMedia)), serverTime: Date.now() });
});

/**
 * GET /api/exercises/:id
 */
router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Exercise not found' });
  res.json({ exercise: await withMedia(rows[0]) });
});

/**
 * POST /api/exercises — create (admin only).
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { nameDe, nameEn, instructionsDe, instructionsEn, category, difficulty } = req.body || {};
  if (!resolve(nameDe, nameEn)) {
    return res.status(400).json({ error: 'At least one of nameDe / nameEn is required' });
  }
  if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  const now = Date.now();
  const id = nanoid();
  const { rows } = await db.query(
    `INSERT INTO exercises
       (id, name, name_de, name_en, category, difficulty, instructions, instructions_de, instructions_en, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      resolve(nameDe, nameEn),
      (nameDe || '').trim(),
      (nameEn || '').trim(),
      category || 'other',
      difficulty || 'beginner',
      resolve(instructionsDe, instructionsEn),
      (instructionsDe || '').trim(),
      (instructionsEn || '').trim(),
      req.user.sub,
      now,
      now,
    ]
  );
  res.status(201).json({ exercise: await withMedia(rows[0]) });
});

/**
 * POST /api/exercises/import — bulk-import exercises from a CSV file (admin only).
 * Skips rows whose name already exists (case-insensitive, either language).
 */
router.post('/import', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const isCsv =
    req.file.mimetype === 'text/csv' ||
    req.file.mimetype === 'application/vnd.ms-excel' ||
    /\.csv$/i.test(req.file.originalname || '');
  if (!isCsv) return res.status(400).json({ error: 'Only CSV files are allowed' });

  let parsed;
  try {
    parsed = parseExercisesCsv(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid CSV' });
  }

  // Existing names (both languages, lowercased) to detect duplicates.
  const { rows: existingRows } = await db.query('SELECT name_de, name_en FROM exercises');
  const existing = new Set();
  for (const r of existingRows) {
    if (r.name_de) existing.add(r.name_de.trim().toLowerCase());
    if (r.name_en) existing.add(r.name_en.trim().toLowerCase());
  }

  const errors = [...parsed.errors];
  const toInsert = [];
  let skipped = 0;
  for (const row of parsed.rows) {
    const keys = [row.nameDe, row.nameEn].filter(Boolean).map((n) => n.toLowerCase());
    if (keys.some((k) => existing.has(k))) {
      skipped += 1;
      continue;
    }
    keys.forEach((k) => existing.add(k)); // prevent duplicates within the same file
    toInsert.push(row);
  }

  const createdIds = [];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();
    for (const row of toInsert) {
      const id = nanoid();
      const name = row.nameDe || row.nameEn;
      const instructions = row.instructionsDe || row.instructionsEn;
      await client.query(
        `INSERT INTO exercises
           (id, name, name_de, name_en, category, difficulty, instructions, instructions_de, instructions_en, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          name,
          row.nameDe,
          row.nameEn,
          row.category,
          row.difficulty,
          instructions,
          row.instructionsDe,
          row.instructionsEn,
          req.user.sub,
          now,
          now,
        ]
      );
      createdIds.push(id);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const exercises = [];
  for (const id of createdIds) {
    const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [id]);
    exercises.push(await withMedia(rows[0]));
  }
  res.status(201).json({ imported: exercises.length, skipped, errors, exercises });
});

/**
 * PUT /api/exercises/:id — update (admin only).
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rows: existingRows } = await db.query('SELECT * FROM exercises WHERE id = $1', [
    req.params.id,
  ]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const { nameDe, nameEn, instructionsDe, instructionsEn, category, difficulty } = req.body || {};
  if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  const nextNameDe = (nameDe ?? existing.name_de ?? '').trim();
  const nextNameEn = (nameEn ?? existing.name_en ?? '').trim();
  const nextInstrDe = (instructionsDe ?? existing.instructions_de ?? '').trim();
  const nextInstrEn = (instructionsEn ?? existing.instructions_en ?? '').trim();
  if (!resolve(nextNameDe, nextNameEn)) {
    return res.status(400).json({ error: 'At least one of nameDe / nameEn is required' });
  }

  const { rows } = await db.query(
    `UPDATE exercises
       SET name = $1, name_de = $2, name_en = $3, category = $4, difficulty = $5,
           instructions = $6, instructions_de = $7, instructions_en = $8, updated_at = $9
     WHERE id = $10
     RETURNING *`,
    [
      resolve(nextNameDe, nextNameEn),
      nextNameDe,
      nextNameEn,
      category ?? existing.category,
      difficulty ?? existing.difficulty,
      resolve(nextInstrDe, nextInstrEn),
      nextInstrDe,
      nextInstrEn,
      Date.now(),
      req.params.id,
    ]
  );
  res.json({ exercise: await withMedia(rows[0]) });
});

/**
 * DELETE /api/exercises/:id — delete exercise + its media files (admin only).
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rows: existingRows } = await db.query('SELECT * FROM exercises WHERE id = $1', [
    req.params.id,
  ]);
  if (!existingRows[0]) return res.status(404).json({ error: 'Exercise not found' });

  const { rows: mediaRows } = await db.query('SELECT * FROM media WHERE exercise_id = $1', [
    req.params.id,
  ]);
  for (const m of mediaRows) await deleteMediaFiles(m);

  await db.query('DELETE FROM exercises WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

/**
 * POST /api/exercises/:id/media — upload an image or video (admin only).
 */
router.post('/:id/media', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  const { rows: exRows } = await db.query('SELECT * FROM exercises WHERE id = $1', [
    req.params.id,
  ]);
  if (!exRows[0]) return res.status(404).json({ error: 'Exercise not found' });
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
  const { rows: maxRows } = await db.query(
    'SELECT MAX(position) AS p FROM media WHERE exercise_id = $1',
    [req.params.id]
  );
  const maxPos = maxRows[0]?.p ?? -1;

  await db.query(
    `INSERT INTO media (id, exercise_id, media_type, url, thumbnail_url, original_name, size_bytes, position, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      req.params.id,
      processed.mediaType,
      processed.url,
      processed.thumbnailUrl,
      processed.originalName,
      req.file.size,
      maxPos + 1,
      now,
    ]
  );

  await db.query('UPDATE exercises SET updated_at = $1 WHERE id = $2', [now, req.params.id]);

  const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [req.params.id]);
  res.status(201).json({ exercise: await withMedia(rows[0]) });
});

/**
 * DELETE /api/exercises/:id/media/:mediaId — remove a media item (admin only).
 */
router.delete('/:id/media/:mediaId', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM media WHERE id = $1 AND exercise_id = $2', [
    req.params.mediaId,
    req.params.id,
  ]);
  const media = rows[0];
  if (!media) return res.status(404).json({ error: 'Media not found' });

  await deleteMediaFiles(media);
  await db.query('DELETE FROM media WHERE id = $1', [req.params.mediaId]);
  await db.query('UPDATE exercises SET updated_at = $1 WHERE id = $2', [
    Date.now(),
    req.params.id,
  ]);

  const { rows: exRows } = await db.query('SELECT * FROM exercises WHERE id = $1', [
    req.params.id,
  ]);
  res.json({ exercise: await withMedia(exRows[0]) });
});

export default router;
