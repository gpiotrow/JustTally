import pg from 'pg';

const { Pool, types } = pg;

// Postgres returns BIGINT (oid 20) as strings by default to avoid precision loss.
// Our timestamps (epoch ms) safely fit in a JS number, so parse them as numbers.
types.setTypeParser(20, (value) => parseInt(value, 10));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Add a Postgres connection string (e.g. a free Neon project) to your environment.'
  );
}

/**
 * Hosted Postgres (Neon and friends) requires TLS, a local container usually
 * offers none. `?sslmode=disable` in the URL opts out; anything else keeps TLS,
 * so the production connection string behaves exactly as before.
 */
function sslOption(url) {
  let mode = null;
  try {
    mode = new URL(url).searchParams.get('sslmode');
  } catch {
    // Not a parseable URL (e.g. a libpq key=value string) — keep TLS on.
  }
  if (mode === 'disable') return false;

  // Certificates are not verified. Neon presents a publicly trusted cert, so
  // this could be tightened to `true` — but that has to be confirmed against
  // the real database first, since a wrong guess breaks every connection.
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString,
  ssl: sslOption(connectionString),
});

/**
 * Create the schema if it does not exist yet.
 * Tables: users, exercises, media, workouts.
 */
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
      created_at    BIGINT NOT NULL,
      updated_at    BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      name_de         TEXT NOT NULL DEFAULT '',
      name_en         TEXT NOT NULL DEFAULT '',
      category        TEXT NOT NULL DEFAULT 'other',
      difficulty      TEXT NOT NULL DEFAULT 'beginner'
                        CHECK (difficulty IN ('beginner','intermediate','advanced')),
      instructions    TEXT NOT NULL DEFAULT '',
      instructions_de TEXT NOT NULL DEFAULT '',
      instructions_en TEXT NOT NULL DEFAULT '',
      created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at      BIGINT NOT NULL,
      updated_at      BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id            TEXT PRIMARY KEY,
      exercise_id   TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      media_type    TEXT NOT NULL CHECK (media_type IN ('image','video')),
      url           TEXT NOT NULL,
      thumbnail_url TEXT,
      original_name TEXT,
      size_bytes    BIGINT,
      position      INTEGER NOT NULL DEFAULT 0,
      created_at    BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_media_exercise ON media(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);

    CREATE TABLE IF NOT EXISTS workouts (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title        TEXT,
      started_at   BIGINT,
      duration_min INTEGER,
      notes        TEXT,
      entries      TEXT NOT NULL DEFAULT '[]',
      date         BIGINT NOT NULL,
      created_at   BIGINT NOT NULL,
      updated_at   BIGINT NOT NULL,
      deleted_at   BIGINT
    );

    CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id);
  `);

  // Idempotent migrations for columns added after the initial release.
  // Bilingual execution tips (separate from instructions).
  await pool.query(`
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tips_de TEXT NOT NULL DEFAULT '';
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tips_en TEXT NOT NULL DEFAULT '';
  `);

  // Storage backend + object keys, added when media moved off the app's own
  // filesystem. Rows written before this keep storage='local' with a NULL
  // object_key and are resolved from their stored url instead.
  await pool.query(`
    ALTER TABLE media ADD COLUMN IF NOT EXISTS storage    TEXT NOT NULL DEFAULT 'local';
    ALTER TABLE media ADD COLUMN IF NOT EXISTS object_key TEXT;
    ALTER TABLE media ADD COLUMN IF NOT EXISTS thumb_key  TEXT;
  `);
  // Rows carrying an object_key derive their URL at read time, so url stays
  // empty for them and now means exactly one thing: a legacy /uploads path.
  await pool.query(`ALTER TABLE media ALTER COLUMN url DROP NOT NULL;`);

  // Human-visible sequential reference number used for filename-based media matching.
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS exercise_ref_seq;`);
  await pool.query(`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS ref INTEGER;`);
  // Backfill any rows still missing a number, then advance the sequence past the max.
  await pool.query(
    `UPDATE exercises SET ref = nextval('exercise_ref_seq') WHERE ref IS NULL;`
  );
  await pool.query(
    `SELECT setval('exercise_ref_seq', GREATEST((SELECT COALESCE(MAX(ref), 0) FROM exercises), 1));`
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_ref ON exercises(ref);`
  );

  // token_version invalidates every JWT issued before it was last bumped
  // (role change, disable, logout-everywhere). disabled_at soft-deletes a
  // user without breaking exercises.created_by / workouts.user_id references.
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at BIGINT;
  `);

  // An exercise a workout points at is archived, never deleted — otherwise the
  // delete silently rewrites other people's training history.
  await pool.query(`
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS archived_at BIGINT;
    CREATE INDEX IF NOT EXISTS idx_exercises_archived ON exercises(archived_at);
  `);

  await migrateWorkoutEntriesToJsonb();

  // Answers "which workouts reference this exercise, and whose?" via the
  // containment operator. Only valid once entries is jsonb.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_workouts_entries
      ON workouts USING GIN (entries jsonb_path_ops);
  `);

  // Spanish as a third content language, plus a "purpose" field distinct from
  // instructions. tips_de/tips_en are dropped: user feedback was that "tips"
  // and "execution instructions" are the same thing — instructions_* now
  // carries what tips_* used to hold.
  await pool.query(`
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS name_es          TEXT NOT NULL DEFAULT '';
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS instructions_es  TEXT NOT NULL DEFAULT '';
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS purpose_de       TEXT NOT NULL DEFAULT '';
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS purpose_en       TEXT NOT NULL DEFAULT '';
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS purpose_es       TEXT NOT NULL DEFAULT '';
    ALTER TABLE exercises DROP COLUMN IF EXISTS tips_de;
    ALTER TABLE exercises DROP COLUMN IF EXISTS tips_en;
  `);
}

/**
 * workouts.entries: text -> jsonb.
 *
 * Every write goes through JSON.stringify() behind isValidEntries(), so in
 * principle every row already holds valid JSON. This does not take that on
 * faith: a single unparseable row would abort the cast with "invalid input
 * syntax" and no indication of which workout is at fault — and this migration
 * runs as the fly.io release command, so that failure blocks the deploy.
 *
 * On failure it therefore locates the offending rows and names them, and lets
 * the whole subtransaction roll back rather than coercing anything to '[]'.
 * Losing a user's logged sets to make a migration pass is the one outcome
 * worse than a failed deploy.
 *
 * Note that jsonb stores objects normalized: keys come back reordered (by
 * length, then bytewise) and whitespace is dropped. Values are untouched, and
 * nothing compares entries by serialized form — the sync resolves on
 * `updated_at` alone — but a byte-for-byte diff of a row before and after will
 * look changed when it is not.
 */
async function migrateWorkoutEntriesToJsonb() {
  await pool.query(`
    DO $$
    DECLARE
      bad_ids text[];
      r record;
    BEGIN
      IF (SELECT data_type FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'workouts'
             AND column_name = 'entries') IS DISTINCT FROM 'text' THEN
        RETURN;  -- already migrated
      END IF;

      -- A text default cannot be carried across the type change.
      ALTER TABLE workouts ALTER COLUMN entries DROP DEFAULT;

      BEGIN
        ALTER TABLE workouts ALTER COLUMN entries TYPE jsonb USING entries::jsonb;
      EXCEPTION WHEN others THEN
        FOR r IN SELECT id, entries FROM workouts LOOP
          BEGIN
            PERFORM r.entries::jsonb;
          EXCEPTION WHEN others THEN
            bad_ids := array_append(bad_ids, r.id);
          END;
        END LOOP;
        RAISE EXCEPTION
          'workouts.entries -> jsonb aborted: % row(s) hold invalid JSON (ids: %). Nothing was modified; repair those rows, then redeploy.',
          coalesce(array_length(bad_ids, 1), 0),
          coalesce(array_to_string(bad_ids[1:20], ', '), '-');
      END;

      ALTER TABLE workouts ALTER COLUMN entries SET DEFAULT '[]'::jsonb;
    END $$;
  `);
}

export default pool;
