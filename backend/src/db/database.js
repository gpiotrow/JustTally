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

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
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
}

export default pool;
