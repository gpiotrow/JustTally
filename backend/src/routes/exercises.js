import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import db from '../db/database.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  processImage,
  processVideo,
  deleteMediaFiles,
  mediaUrl,
} from '../services/mediaService.js';
import { parseExercisesCsv } from '../services/csvImport.js';
import { exercisesToCsv } from '../services/csvExport.js';
import { countExerciseUsage, countAggregateExerciseUsage } from '../services/exerciseUsage.js';

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

/** Preferred resolution across three languages: de -> en -> es. */
function resolve(de, en, es) {
  const d = (de || '').trim();
  const e = (en || '').trim();
  const s = (es || '').trim();
  return d || e || s;
}

/**
 * Map a media row to the API shape.
 *
 * `mediaUrl` prefers the object key and only falls back to the stored path for
 * rows written before media moved behind a storage driver.
 */
function serializeMedia(m) {
  return {
    id: m.id,
    mediaType: m.media_type,
    url: mediaUrl(m.object_key, m.storage, m.url),
    thumbnailUrl: mediaUrl(m.thumb_key, m.storage, m.thumbnail_url),
    originalName: m.original_name,
  };
}

/** Expose bilingual + resolved fields for an exercise row with its media. */
function serializeExercise(exercise, media) {
  return {
    id: exercise.id,
    // Human-visible sequential number used for filename-based media matching.
    ref: exercise.ref,
    // Resolved (German-preferred) values for back-compat and sorting.
    name: exercise.name,
    instructions: exercise.instructions,
    // Trilingual source-of-truth fields.
    nameDe: exercise.name_de ?? '',
    nameEn: exercise.name_en ?? '',
    nameEs: exercise.name_es ?? '',
    purposeDe: exercise.purpose_de ?? '',
    purposeEn: exercise.purpose_en ?? '',
    purposeEs: exercise.purpose_es ?? '',
    instructionsDe: exercise.instructions_de ?? '',
    instructionsEn: exercise.instructions_en ?? '',
    instructionsEs: exercise.instructions_es ?? '',
    category: exercise.category,
    difficulty: exercise.difficulty,
    createdAt: exercise.created_at,
    updatedAt: exercise.updated_at,
    // Archived exercises stay readable so past workouts still resolve a name;
    // they are only hidden from the pickable catalog.
    archived: exercise.archived_at != null,
    archivedAt: exercise.archived_at ?? null,
    media: media.map(serializeMedia),
  };
}

/** Attach media to a single exercise row. */
async function withMedia(exercise) {
  const { rows: media } = await db.query(
    'SELECT * FROM media WHERE exercise_id = $1 ORDER BY position, created_at',
    [exercise.id]
  );
  return serializeExercise(exercise, media);
}

/**
 * Batch variant of `withMedia`: two queries regardless of catalog size.
 *
 * Calling `withMedia` per row turned a 500-exercise listing into 501 round
 * trips squeezed through a pool of 10 — several seconds once the database
 * sits in a different region than the app.
 */
async function withMediaMany(exercises) {
  if (exercises.length === 0) return [];

  const { rows: media } = await db.query(
    'SELECT * FROM media WHERE exercise_id = ANY($1) ORDER BY position, created_at',
    [exercises.map((e) => e.id)]
  );

  const byExercise = new Map();
  for (const m of media) {
    const list = byExercise.get(m.exercise_id);
    if (list) list.push(m);
    else byExercise.set(m.exercise_id, [m]);
  }

  return exercises.map((e) => serializeExercise(e, byExercise.get(e.id) ?? []));
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

  // url / thumbnail_url stay NULL: rows with an object_key resolve their URL at
  // read time, so a stored absolute URL would only go stale.
  await runner.query(
    `INSERT INTO media
       (id, exercise_id, media_type, storage, object_key, thumb_key,
        original_name, size_bytes, position, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      exerciseId,
      processed.mediaType,
      processed.storage,
      processed.objectKey,
      processed.thumbKey,
      processed.originalName,
      file.size,
      maxPos + 1,
      now,
    ]
  );
  return id;
}

/**
 * GET /api/exercises — list exercises with media (any authenticated user).
 * Supports ?category=, ?since= (epoch ms) for incremental sync, and
 * ?includeArchived=1 for the admin catalog view.
 *
 * Archived exercises are hidden by default but always included in a `since`
 * sync: a client that already holds one has to be told it was archived, and
 * a filtered-out row is indistinguishable from an unchanged one.
 */
router.get('/', requireAuth, async (req, res) => {
  const { category, since, includeArchived } = req.query;

  const conditions = [];
  const params = [];
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (since !== undefined) {
    params.push(Number(since) || 0);
    conditions.push(`updated_at > $${params.length}`);
  }
  const wantsArchived =
    since !== undefined || includeArchived === '1' || includeArchived === 'true';
  if (!wantsArchived) conditions.push('archived_at IS NULL');

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query(`SELECT * FROM exercises ${where} ORDER BY name`, params);

  res.json({ exercises: await withMediaMany(rows), serverTime: Date.now() });
});

/**
 * GET /api/exercises/export.csv — the whole catalog, including archived
 * exercises, in the exact import shape with `ref` filled in (admin only).
 *
 * Registered before `/:id`: Express matches routes in order, and without this
 * placement `/:id` would swallow this path with `id = "export.csv"`.
 *
 * A filled `ref` is the point — re-importing the export matches every row by
 * number instead of guessing from the name, so `export → edit → mode=replace`
 * is an exact round trip.
 */
router.get('/export.csv', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query(
    `SELECT ref, category, difficulty,
            name_de, purpose_de, instructions_de,
            name_en, purpose_en, instructions_en,
            name_es, purpose_es, instructions_es
       FROM exercises ORDER BY ref`
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="just-tally-exercises.csv"');
  res.send(exercisesToCsv(rows));
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
  const {
    nameDe,
    nameEn,
    nameEs,
    purposeDe,
    purposeEn,
    purposeEs,
    instructionsDe,
    instructionsEn,
    instructionsEs,
    category,
    difficulty,
    ref,
  } = req.body || {};
  if (!resolve(nameDe, nameEn, nameEs)) {
    return res.status(400).json({ error: 'At least one of nameDe / nameEn / nameEs is required' });
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
         (id, ref, name, name_de, name_en, name_es, category, difficulty,
          instructions, instructions_de, instructions_en, instructions_es,
          purpose_de, purpose_en, purpose_es,
          created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        id,
        refNumber,
        resolve(nameDe, nameEn, nameEs),
        (nameDe || '').trim(),
        (nameEn || '').trim(),
        (nameEs || '').trim(),
        category || 'other',
        difficulty || 'beginner',
        resolve(instructionsDe, instructionsEn, instructionsEs),
        (instructionsDe || '').trim(),
        (instructionsEn || '').trim(),
        (instructionsEs || '').trim(),
        (purposeDe || '').trim(),
        (purposeEn || '').trim(),
        (purposeEs || '').trim(),
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

const VALID_IMPORT_MODES = ['merge', 'upsert', 'replace'];

/**
 * `mode` replaces the old `overwrite` boolean with three explicit behaviors;
 * `overwrite=true` is kept working as an alias for `upsert` so existing
 * integrations do not break.
 *   merge   — insert new rows, skip rows that match an existing exercise
 *   upsert  — insert new rows, update matched rows in place
 *   replace — upsert, plus: any existing exercise absent from the CSV is archived
 */
function resolveImportMode(body) {
  const raw = String(body?.mode ?? '').trim().toLowerCase();
  if (VALID_IMPORT_MODES.includes(raw)) return raw;
  return body?.overwrite === 'true' ? 'upsert' : 'merge';
}

/**
 * POST /api/exercises/import — bulk-import exercises from a CSV file (admin only).
 * `mode`: merge (default) | upsert | replace — see `resolveImportMode`.
 * `dryRun=true`: compute and return the same counts without writing anything,
 * so `mode=replace` — which can archive a large slice of the catalog in one
 * request — is previewed before it runs, not just reported after.
 */
router.post('/import', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const isCsv =
    req.file.mimetype === 'text/csv' ||
    req.file.mimetype === 'application/vnd.ms-excel' ||
    /\.csv$/i.test(req.file.originalname || '');
  if (!isCsv) return res.status(400).json({ error: 'Only CSV files are allowed' });

  const mode = resolveImportMode(req.body);
  const doUpdate = mode !== 'merge'; // upsert and replace both update matched rows
  const dryRun = req.query.dryRun === '1' || req.body?.dryRun === 'true';

  let parsed;
  try {
    parsed = parseExercisesCsv(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid CSV' });
  }

  // Existing rows, to detect duplicates up front and (in upsert/replace mode) find
  // the exercise a CSV row refers to, rather than discovering it mid-transaction.
  // Archived rows are included in matching: a CSV row bringing one back should
  // reclaim its own ref/id, not collide with it as if it were a new exercise.
  const { rows: existingRows } = await db.query(
    'SELECT id, name_de, name_en, name_es, ref, archived_at FROM exercises'
  );
  const byId = new Map(existingRows.map((r) => [r.id, r]));
  const byRef = new Map();
  const byName = new Map();
  for (const r of existingRows) {
    if (r.ref != null) byRef.set(r.ref, r);
    if (r.name_de) byName.set(r.name_de.trim().toLowerCase(), r);
    if (r.name_en) byName.set(r.name_en.trim().toLowerCase(), r);
    if (r.name_es) byName.set(r.name_es.trim().toLowerCase(), r);
  }

  /** Find the existing exercise a CSV row refers to: by ref first, else by any name. */
  function findExistingMatch(row) {
    if (row.ref != null && byRef.has(row.ref)) return byRef.get(row.ref);
    if (row.nameDe && byName.has(row.nameDe.toLowerCase())) return byName.get(row.nameDe.toLowerCase());
    if (row.nameEn && byName.has(row.nameEn.toLowerCase())) return byName.get(row.nameEn.toLowerCase());
    if (row.nameEs && byName.has(row.nameEs.toLowerCase())) return byName.get(row.nameEs.toLowerCase());
    return null;
  }

  const errors = [...parsed.errors];
  const toInsert = [];
  const toUpdate = [];
  const usedRefsInBatch = new Set();
  const reservedNames = new Set(); // names about to be inserted, to catch intra-file duplicates
  const matchedIdsInBatch = new Set();
  let skipped = 0;
  for (const row of parsed.rows) {
    const existing = findExistingMatch(row);
    if (existing) {
      if (!doUpdate || matchedIdsInBatch.has(existing.id)) {
        skipped += 1;
        continue;
      }
      matchedIdsInBatch.add(existing.id);
      toUpdate.push({ row, existingId: existing.id });
      continue;
    }

    const keys = [row.nameDe, row.nameEn, row.nameEs].filter(Boolean).map((n) => n.toLowerCase());
    if (keys.some((k) => reservedNames.has(k))) {
      skipped += 1; // duplicate within this file
      continue;
    }
    // A colliding explicit ref is a per-row error, not a batch-ending failure —
    // mirrors how duplicate names are skipped rather than aborting the import.
    if (row.ref != null) {
      if (byRef.has(row.ref) || usedRefsInBatch.has(row.ref)) {
        errors.push({ row: row.rowNumber, message: `Reference number ${row.ref} is already in use` });
        continue;
      }
      usedRefsInBatch.add(row.ref);
    }
    keys.forEach((k) => reservedNames.add(k));
    toInsert.push(row);
  }

  // mode=replace only: existing, still-active exercises absent from this CSV.
  // Already-archived ones are excluded — archiving them again would be a
  // no-op, and counting them here would overstate what this import changes.
  const toArchive =
    mode === 'replace'
      ? existingRows.filter((r) => !matchedIdsInBatch.has(r.id) && r.archived_at === null)
      : [];

  if (dryRun) {
    const archiveIds = toArchive.map((r) => r.id);
    const perExercise = archiveIds.length ? await countExerciseUsage(db, archiveIds) : new Map();
    const archivedInUse = archiveIds.filter((id) => perExercise.get(id).workouts > 0).length;
    const aggregate = archiveIds.length
      ? await countAggregateExerciseUsage(db, archiveIds)
      : { workouts: 0, users: 0 };

    return res.json({
      dryRun: true,
      mode,
      imported: toInsert.length,
      updated: toUpdate.length,
      skipped,
      archived: toArchive.length,
      archivedInUse,
      archivedAffectedUsers: aggregate.users,
      errors,
    });
  }

  const createdIds = [];
  const updatedIds = [];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();
    for (const row of toInsert) {
      await client.query('SAVEPOINT row_insert');
      let refNumber;
      try {
        const id = nanoid();
        const name = row.nameDe || row.nameEn || row.nameEs;
        const instructions = row.instructionsDe || row.instructionsEn || row.instructionsEs;
        refNumber = await resolveRef(client, row.ref);
        await client.query(
          `INSERT INTO exercises
             (id, ref, name, name_de, name_en, name_es, category, difficulty,
              instructions, instructions_de, instructions_en, instructions_es,
              purpose_de, purpose_en, purpose_es,
              created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            id,
            refNumber,
            name,
            row.nameDe,
            row.nameEn,
            row.nameEs,
            row.category,
            row.difficulty,
            instructions,
            row.instructionsDe,
            row.instructionsEn,
            row.instructionsEs,
            row.purposeDe,
            row.purposeEn,
            row.purposeEs,
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
    for (const { row, existingId } of toUpdate) {
      await client.query('SAVEPOINT row_update');
      let refNumber;
      try {
        const name = row.nameDe || row.nameEn || row.nameEs;
        const instructions = row.instructionsDe || row.instructionsEn || row.instructionsEs;
        refNumber =
          row.ref != null ? await resolveRef(client, row.ref, existingId) : byId.get(existingId).ref;
        // archived_at is cleared: a row present in the imported catalog is part
        // of the catalog again. Without this an overwrite import would update an
        // archived exercise and leave it invisible, with nothing to explain why.
        await client.query(
          `UPDATE exercises
             SET ref = $1, name = $2, name_de = $3, name_en = $4, name_es = $5, category = $6, difficulty = $7,
                 instructions = $8, instructions_de = $9, instructions_en = $10, instructions_es = $11,
                 purpose_de = $12, purpose_en = $13, purpose_es = $14,
                 updated_at = $15, archived_at = NULL
           WHERE id = $16`,
          [
            refNumber,
            name,
            row.nameDe,
            row.nameEn,
            row.nameEs,
            row.category,
            row.difficulty,
            instructions,
            row.instructionsDe,
            row.instructionsEn,
            row.instructionsEs,
            row.purposeDe,
            row.purposeEn,
            row.purposeEs,
            now,
            existingId,
          ]
        );
        await client.query('RELEASE SAVEPOINT row_update');
        updatedIds.push(existingId);
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT row_update');
        const friendly = toFriendlyRefError(err, refNumber);
        errors.push({
          row: row.rowNumber,
          message: friendly instanceof Error ? friendly.message : 'Update failed',
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

  // Runs after commit, not inside the transaction: it is a separate concern
  // (I3, not import correctness) and countExerciseUsage needs to see the
  // import's own writes — an exercise the CSV just re-added must not be
  // archived a moment later for looking "untouched".
  let archivedCount = 0;
  let archivedAffectedUsers = 0;
  if (mode === 'replace' && toArchive.length > 0) {
    const archiveIds = toArchive.map((r) => r.id);
    archivedCount = await archiveExercises(archiveIds);
    archivedAffectedUsers = (await countAggregateExerciseUsage(db, archiveIds)).users;
  }

  // Re-read in one query: the previous per-id loop cost two round trips per
  // imported row, which on a full-catalog import dwarfed the import itself.
  const touchedIds = [...createdIds, ...updatedIds];
  const { rows: touchedRows } = touchedIds.length
    ? await db.query('SELECT * FROM exercises WHERE id = ANY($1) ORDER BY name', [touchedIds])
    : { rows: [] };
  const exercises = await withMediaMany(touchedRows);

  res.status(201).json({
    dryRun: false,
    mode,
    imported: createdIds.length,
    updated: updatedIds.length,
    skipped,
    archived: archivedCount,
    archivedAffectedUsers,
    errors,
    exercises,
  });
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

  const {
    nameDe,
    nameEn,
    nameEs,
    purposeDe,
    purposeEn,
    purposeEs,
    instructionsDe,
    instructionsEn,
    instructionsEs,
    category,
    difficulty,
    ref,
  } = req.body || {};
  if (difficulty && !VALID_DIFFICULTY.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty' });
  }

  const nextNameDe = (nameDe ?? existing.name_de ?? '').trim();
  const nextNameEn = (nameEn ?? existing.name_en ?? '').trim();
  const nextNameEs = (nameEs ?? existing.name_es ?? '').trim();
  const nextInstrDe = (instructionsDe ?? existing.instructions_de ?? '').trim();
  const nextInstrEn = (instructionsEn ?? existing.instructions_en ?? '').trim();
  const nextInstrEs = (instructionsEs ?? existing.instructions_es ?? '').trim();
  const nextPurposeDe = (purposeDe ?? existing.purpose_de ?? '').trim();
  const nextPurposeEn = (purposeEn ?? existing.purpose_en ?? '').trim();
  const nextPurposeEs = (purposeEs ?? existing.purpose_es ?? '').trim();
  if (!resolve(nextNameDe, nextNameEn, nextNameEs)) {
    return res.status(400).json({ error: 'At least one of nameDe / nameEn / nameEs is required' });
  }

  // Keep the current number unless a new one is explicitly provided.
  const nextRef = ref === undefined ? existing.ref : await resolveRef(db, ref, req.params.id);

  let rows;
  try {
    ({ rows } = await db.query(
      `UPDATE exercises
         SET ref = $1, name = $2, name_de = $3, name_en = $4, name_es = $5, category = $6, difficulty = $7,
             instructions = $8, instructions_de = $9, instructions_en = $10, instructions_es = $11,
             purpose_de = $12, purpose_en = $13, purpose_es = $14, updated_at = $15
       WHERE id = $16
       RETURNING *`,
      [
        nextRef,
        resolve(nextNameDe, nextNameEn, nextNameEs),
        nextNameDe,
        nextNameEn,
        nextNameEs,
        category ?? existing.category,
        difficulty ?? existing.difficulty,
        resolve(nextInstrDe, nextInstrEn, nextInstrEs),
        nextInstrDe,
        nextInstrEn,
        nextInstrEs,
        nextPurposeDe,
        nextPurposeEn,
        nextPurposeEs,
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
 * Remove an exercise for good, including its media objects.
 * Only ever called for exercises no live workout references.
 */
async function hardDeleteExercises(ids) {
  const { rows: mediaRows } = await db.query('SELECT * FROM media WHERE exercise_id = ANY($1)', [
    ids,
  ]);
  for (const m of mediaRows) await deleteMediaFiles(m);
  // The media FK cascades; this clears their rows along with the exercises.
  const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1)', [ids]);
  return rowCount;
}

/**
 * Archive exercises in place. `updated_at` moves too, otherwise clients syncing
 * with `?since=` would never be told and would keep offering them.
 */
async function archiveExercises(ids) {
  const now = Date.now();
  const { rowCount } = await db.query(
    `UPDATE exercises SET archived_at = $1, updated_at = $1
      WHERE id = ANY($2) AND archived_at IS NULL`,
    [now, ids]
  );
  return rowCount;
}

/**
 * DELETE /api/exercises/:id — remove an exercise (admin only).
 *
 * Invariant I3: an exercise some workout still points at is archived, not
 * deleted. Deleting it would blank the exercise name in every set that
 * references it — including in other people's history, which the admin cannot
 * see from here. Unreferenced exercises are deleted outright, media included.
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { rows: existingRows } = await db.query('SELECT * FROM exercises WHERE id = $1', [
    req.params.id,
  ]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const usage = (await countExerciseUsage(db, [existing.id])).get(existing.id);

  if (usage.workouts > 0) {
    await archiveExercises([existing.id]);
    return res.json({ ok: true, archived: true, deleted: false, usage });
  }

  await hardDeleteExercises([existing.id]);
  res.json({ ok: true, archived: false, deleted: true, usage });
});

/**
 * POST /api/exercises/:id/unarchive — return an archived exercise to the
 * catalog (admin only).
 */
router.post('/:id/unarchive', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query(
    `UPDATE exercises SET archived_at = NULL, updated_at = $1 WHERE id = $2 RETURNING *`,
    [Date.now(), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Exercise not found' });
  res.json({ exercise: await withMedia(rows[0]) });
});

/**
 * GET /api/exercises/:id/usage — how many workouts and users reference this
 * exercise (admin only). Lets the UI warn before a destructive action instead
 * of reporting the consequence afterwards.
 */
router.get('/:id/usage', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await db.query('SELECT id FROM exercises WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Exercise not found' });
  const usage = (await countExerciseUsage(db, [req.params.id])).get(req.params.id);
  res.json({ usage });
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
 * With `overwrite=true` in the form body, an exercise's existing media is deleted the
 * first time a file in this request matches it, so re-uploading replaces rather than
 * adds to its media.
 */
router.post(
  '/media/bulk',
  requireAuth,
  requireAdmin,
  bulkUpload.array('files', MAX_BULK_FILES),
  async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const overwrite = req.body?.overwrite === 'true';

    const assigned = [];
    const unmatched = [];
    const touched = new Set();
    const clearedExerciseIds = new Set();

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
      const exerciseId = rows[0].id;
      if (overwrite && !clearedExerciseIds.has(exerciseId)) {
        const { rows: mediaRows } = await db.query('SELECT * FROM media WHERE exercise_id = $1', [
          exerciseId,
        ]);
        for (const m of mediaRows) await deleteMediaFiles(m);
        await db.query('DELETE FROM media WHERE exercise_id = $1', [exerciseId]);
        clearedExerciseIds.add(exerciseId);
      }
      try {
        await insertMediaForExercise(db, exerciseId, file);
        touched.add(exerciseId);
        assigned.push({ filename: file.originalname, ref, exerciseId });
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

    res.status(201).json({ assigned, unmatched, clearedExerciseIds: [...clearedExerciseIds] });
  }
);

/**
 * POST /api/exercises/bulk-delete — remove several exercises at once (admin only).
 * Body: { ids: string[] }.
 *
 * Same rule as the single delete (I3), applied per exercise: referenced ones are
 * archived, the rest deleted. A mixed selection is therefore normal, which is why
 * the response reports both counts rather than one total.
 */
router.post('/bulk-delete', requireAuth, requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No exercise ids provided' });

  // Restrict to ids that actually exist, so the counts reported back describe
  // real work rather than echoing whatever the client sent.
  const { rows: existing } = await db.query('SELECT id FROM exercises WHERE id = ANY($1)', [ids]);
  const existingIds = existing.map((r) => r.id);
  if (existingIds.length === 0) return res.json({ archived: 0, deleted: 0 });

  const usage = await countExerciseUsage(db, existingIds);
  const toArchive = existingIds.filter((id) => usage.get(id).workouts > 0);
  const toDelete = existingIds.filter((id) => usage.get(id).workouts === 0);

  const archived = toArchive.length ? await archiveExercises(toArchive) : 0;
  const deleted = toDelete.length ? await hardDeleteExercises(toDelete) : 0;

  res.json({ archived, deleted });
});

/**
 * PUT /api/exercises/:id/media/order — persist a new media display order
 * (admin only), for drag-and-drop reordering / choosing the cover image.
 * Body: `{ mediaIds: string[] }` — must be exactly the exercise's current
 * media ids, reordered; `position` is taken from array index.
 */
router.put('/:id/media/order', requireAuth, requireAdmin, async (req, res) => {
  const { rows: exRows } = await db.query('SELECT id FROM exercises WHERE id = $1', [
    req.params.id,
  ]);
  if (!exRows[0]) return res.status(404).json({ error: 'Exercise not found' });

  const mediaIds = Array.isArray(req.body?.mediaIds) ? req.body.mediaIds : null;
  if (!mediaIds || mediaIds.length === 0 || mediaIds.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'mediaIds must be a non-empty array of strings' });
  }

  // The endpoint only reorders — it must not become a way to add or drop media
  // by omission, so the id set has to match exactly, not just be a subset.
  const { rows: currentMedia } = await db.query('SELECT id FROM media WHERE exercise_id = $1', [
    req.params.id,
  ]);
  const currentIds = new Set(currentMedia.map((m) => m.id));
  const providedIds = new Set(mediaIds);
  const sameSet =
    currentIds.size === providedIds.size && [...currentIds].every((id) => providedIds.has(id));
  if (!sameSet) {
    return res
      .status(400)
      .json({ error: "mediaIds must contain exactly this exercise's current media, reordered" });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < mediaIds.length; i++) {
      await client.query('UPDATE media SET position = $1 WHERE id = $2', [i, mediaIds[i]]);
    }
    await client.query('UPDATE exercises SET updated_at = $1 WHERE id = $2', [
      Date.now(),
      req.params.id,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [req.params.id]);
  res.json({ exercise: await withMedia(rows[0]) });
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
