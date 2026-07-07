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

// Bulk media upload additionally caps the number of files per request: multer
// buffers every file into memory before the handler runs, so an uncapped count
// alongside the 200 MB per-file limit could exhaust server memory in one request.
const MAX_BULK_FILES = 20;
const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: MAX_BULK_FILES },
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
    // Human-visible sequential number used for filename-based media matching.
    ref: exercise.ref,
    // Resolved (German-preferred) values for back-compat and sorting.
    name: exercise.name,
    instructions: exercise.instructions,
    // Bilingual source-of-truth fields.
    nameDe: exercise.name_de ?? '',
    nameEn: exercise.name_en ?? '',
    instructionsDe: exercise.instructions_de ?? '',
    instructionsEn: exercise.instructions_en ?? '',
    tipsDe: exercise.tips_de ?? '',
    tipsEn: exercise.tips_en ?? '',
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
 * Determine the reference number for an exercise on create/update/import.
 * - Absent (undefined/null/''): allocate the next sequence value.
 * - Positive integer: ensure uniqueness (excluding `excludeId` on update) and
 *   advance the sequence so future auto-numbers never collide with it.
 * `runner` may be the pool or a transaction client.
 * @throws error with `.status` (400 invalid, 409 collision).
 */
async function resolveRef(runner, provided, excludeId = null) {
  if (provided === undefined || provided === null || provided === '') {
    const { rows } = await runner.query("SELECT nextval('exercise_ref_seq') AS ref");
    return Number(rows[0].ref);
  }
  const n = Number(provided);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error('Reference number must be a positive integer');
    err.status = 400;
    throw err;
  }
  const { rows: clash } = await runner.query(
    'SELECT id FROM exercises WHERE ref = $1 AND ($2::text IS NULL OR id <> $2)',
    [n, excludeId]
  );
  if (clash[0]) {
    const err = new Error(`Reference number ${n} is already in use`);
    err.status = 409;
    throw err;
  }
  await runner.query(
    "SELECT setval('exercise_ref_seq', GREATEST((SELECT last_value FROM exercise_ref_seq), $1))",
    [n]
  );
  return n;
}

/**
 * `resolveRef`'s uniqueness check and the write that follows it are not atomic,
 * so a concurrent request can still slip a colliding `ref` past the check and
 * hit the unique index at write time. Translate that specific Postgres error
 * into the same friendly 409 `resolveRef` would have thrown; pass through
 * anything else unchanged.
 */
function toFriendlyRefError(err, refNumber) {
  if (err && err.code === '23505' && err.constraint === 'idx_exercises_ref') {
    const friendly = new Error(`Reference number ${refNumber} is already in use`);
    friendly.status = 409;
    return friendly;
  }
  return err;
}

/**
 * Process an uploaded image/video and insert a media row for `exerciseId`.
 * Returns the created media id. Callers refresh exercises.updated_at themselves.
 * @throws error with `.status` 400 for unsupported file types.
 */
async function insertMediaForExercise(runner, exerciseId, file) {
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');
  if (!isImage && !isVideo) {
    const err = new Error('Only image and video files are allowed');
    err.status = 400;
    throw err;
  }

  const processed = isImage
    ? await processImage(file.buffer, file.originalname)
    : await processVideo(file.buffer, file.originalname, file.mimetype);

  const id = nanoid();
  const now = Date.now();
  const { rows: maxRows } = await runner.query(
    'SELECT MAX(position) AS p FROM media WHERE exercise_id = $1',
    [exerciseId]
  );
  const maxPos = maxRows[0]?.p ?? -1;

  await runner.query(
    `INSERT INTO media (id, exercise_id, media_type, url, thumbnail_url, original_name, size_bytes, position, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      exerciseId,
      processed.mediaType,
      processed.url,
      processed.thumbnailUrl,
      processed.originalName,
      file.size,
      maxPos + 1,
      now,
    ]
  );
  return id;
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
  const { nameDe, nameEn, instructionsDe, instructionsEn, tipsDe, tipsEn, category, difficulty, ref } =
    req.body || {};
  if (!resolve(nameDe, nameEn)) {
    return res.status(400).json({ error: 'At least one of nameDe / nameEn is required' });
  }
  if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  const now = Date.now();
  const id = nanoid();
  const refNumber = await resolveRef(db, ref);
  let rows;
  try {
    ({ rows } = await db.query(
      `INSERT INTO exercises
         (id, ref, name, name_de, name_en, category, difficulty,
          instructions, instructions_de, instructions_en, tips_de, tips_en,
          created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        id,
        refNumber,
        resolve(nameDe, nameEn),
        (nameDe || '').trim(),
        (nameEn || '').trim(),
        category || 'other',
        difficulty || 'beginner',
        resolve(instructionsDe, instructionsEn),
        (instructionsDe || '').trim(),
        (instructionsEn || '').trim(),
        (tipsDe || '').trim(),
        (tipsEn || '').trim(),
        req.user.sub,
        now,
        now,
      ]
    ));
  } catch (err) {
    throw toFriendlyRefError(err, refNumber);
  }
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

  // Existing names (both languages, lowercased) and ref numbers, to detect duplicates
  // up front rather than discovering them mid-transaction.
  const { rows: existingRows } = await db.query('SELECT name_de, name_en, ref FROM exercises');
  const existingNames = new Set();
  const existingRefs = new Set();
  for (const r of existingRows) {
    if (r.name_de) existingNames.add(r.name_de.trim().toLowerCase());
    if (r.name_en) existingNames.add(r.name_en.trim().toLowerCase());
    if (r.ref != null) existingRefs.add(r.ref);
  }

  const errors = [...parsed.errors];
  const toInsert = [];
  const usedRefsInBatch = new Set();
  let skipped = 0;
  for (const row of parsed.rows) {
    const keys = [row.nameDe, row.nameEn].filter(Boolean).map((n) => n.toLowerCase());
    if (keys.some((k) => existingNames.has(k))) {
      skipped += 1;
      continue;
    }
    // A colliding explicit ref is a per-row error, not a batch-ending failure —
    // mirrors how duplicate names are skipped rather than aborting the import.
    if (row.ref != null) {
      if (existingRefs.has(row.ref) || usedRefsInBatch.has(row.ref)) {
        errors.push({ row: row.rowNumber, message: `Reference number ${row.ref} is already in use` });
        continue;
      }
      usedRefsInBatch.add(row.ref);
    }
    keys.forEach((k) => existingNames.add(k)); // prevent duplicates within the same file
    toInsert.push(row);
  }

  const createdIds = [];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();
    for (const row of toInsert) {
      await client.query('SAVEPOINT row_insert');
      let refNumber;
      try {
        const id = nanoid();
        const name = row.nameDe || row.nameEn;
        const instructions = row.instructionsDe || row.instructionsEn;
        refNumber = await resolveRef(client, row.ref);
        await client.query(
          `INSERT INTO exercises
             (id, ref, name, name_de, name_en, category, difficulty,
              instructions, instructions_de, instructions_en, tips_de, tips_en,
              created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            id,
            refNumber,
            name,
            row.nameDe,
            row.nameEn,
            row.category,
            row.difficulty,
            instructions,
            row.instructionsDe,
            row.instructionsEn,
            row.tipsDe,
            row.tipsEn,
            req.user.sub,
            now,
            now,
          ]
        );
        await client.query('RELEASE SAVEPOINT row_insert');
        createdIds.push(id);
      } catch (err) {
        // Defense in depth: the pre-check above already rules out most ref collisions,
        // but a concurrent write could still race past it. Roll back only this row's
        // work so the rest of the batch still commits, and report it like any other
        // per-row error instead of failing the whole import.
        await client.query('ROLLBACK TO SAVEPOINT row_insert');
        const friendly = toFriendlyRefError(err, refNumber);
        errors.push({
          row: row.rowNumber,
          message: friendly instanceof Error ? friendly.message : 'Insert failed',
        });
      }
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

  const { nameDe, nameEn, instructionsDe, instructionsEn, tipsDe, tipsEn, category, difficulty, ref } =
    req.body || {};
  if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  const nextNameDe = (nameDe ?? existing.name_de ?? '').trim();
  const nextNameEn = (nameEn ?? existing.name_en ?? '').trim();
  const nextInstrDe = (instructionsDe ?? existing.instructions_de ?? '').trim();
  const nextInstrEn = (instructionsEn ?? existing.instructions_en ?? '').trim();
  const nextTipsDe = (tipsDe ?? existing.tips_de ?? '').trim();
  const nextTipsEn = (tipsEn ?? existing.tips_en ?? '').trim();
  if (!resolve(nextNameDe, nextNameEn)) {
    return res.status(400).json({ error: 'At least one of nameDe / nameEn is required' });
  }

  // Keep the current number unless a new one is explicitly provided.
  const nextRef = ref === undefined ? existing.ref : await resolveRef(db, ref, req.params.id);

  let rows;
  try {
    ({ rows } = await db.query(
      `UPDATE exercises
         SET ref = $1, name = $2, name_de = $3, name_en = $4, category = $5, difficulty = $6,
             instructions = $7, instructions_de = $8, instructions_en = $9,
             tips_de = $10, tips_en = $11, updated_at = $12
       WHERE id = $13
       RETURNING *`,
      [
        nextRef,
        resolve(nextNameDe, nextNameEn),
        nextNameDe,
        nextNameEn,
        category ?? existing.category,
        difficulty ?? existing.difficulty,
        resolve(nextInstrDe, nextInstrEn),
        nextInstrDe,
        nextInstrEn,
        nextTipsDe,
        nextTipsEn,
        Date.now(),
        req.params.id,
      ]
    ));
  } catch (err) {
    throw toFriendlyRefError(err, nextRef);
  }
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

  await insertMediaForExercise(db, req.params.id, req.file);
  await db.query('UPDATE exercises SET updated_at = $1 WHERE id = $2', [Date.now(), req.params.id]);

  const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [req.params.id]);
  res.status(201).json({ exercise: await withMedia(rows[0]) });
});

/**
 * POST /api/exercises/media/bulk — upload many files at once; each is auto-assigned
 * to the exercise whose `ref` number matches the file's leading digit run (admin only).
 * Example: "42_front.jpg" and "42-2.mp4" both attach to the exercise with ref 42.
 */
router.post(
  '/media/bulk',
  requireAuth,
  requireAdmin,
  bulkUpload.array('files', MAX_BULK_FILES),
  async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const assigned = [];
    const unmatched = [];
    const touched = new Set();

    for (const file of files) {
      const match = /^(\d+)(?=\D|$)/.exec(file.originalname || '');
      if (!match) {
        unmatched.push({ filename: file.originalname, reason: 'no_leading_number' });
        continue;
      }
      const ref = Number(match[1]);
      const { rows } = await db.query('SELECT id FROM exercises WHERE ref = $1', [ref]);
      if (!rows[0]) {
        unmatched.push({ filename: file.originalname, reason: 'no_exercise_for_number' });
        continue;
      }
      try {
        await insertMediaForExercise(db, rows[0].id, file);
        touched.add(rows[0].id);
        assigned.push({ filename: file.originalname, ref, exerciseId: rows[0].id });
      } catch (err) {
        unmatched.push({
          filename: file.originalname,
          reason: err?.status === 400 ? 'unsupported_type' : 'processing_error',
        });
      }
    }

    if (touched.size > 0) {
      await db.query('UPDATE exercises SET updated_at = $1 WHERE id = ANY($2)', [
        Date.now(),
        [...touched],
      ]);
    }

    res.status(201).json({ assigned, unmatched });
  }
);

/**
 * POST /api/exercises/bulk-delete — delete several exercises and their media at once
 * (admin only). Body: { ids: string[] }.
 */
router.post('/bulk-delete', requireAuth, requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No exercise ids provided' });

  const { rows: mediaRows } = await db.query(
    'SELECT * FROM media WHERE exercise_id = ANY($1)',
    [ids]
  );
  for (const m of mediaRows) await deleteMediaFiles(m);

  // Cascade on media FK removes their rows; delete the exercises themselves.
  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1)', [ids]);
  res.json({ deleted: rowCount });
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
