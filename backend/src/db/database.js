import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DATA_DIR, 'just-tally.sqlite');

mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/**
 * Create the schema if it does not exist yet.
 * Tables: users, exercises, media.
 */
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL DEFAULT 'other',
      difficulty   TEXT NOT NULL DEFAULT 'beginner'
                     CHECK (difficulty IN ('beginner','intermediate','advanced')),
      instructions TEXT NOT NULL DEFAULT '',
      created_by   TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS media (
      id            TEXT PRIMARY KEY,
      exercise_id   TEXT NOT NULL,
      media_type    TEXT NOT NULL CHECK (media_type IN ('image','video')),
      url           TEXT NOT NULL,
      thumbnail_url TEXT,
      original_name TEXT,
      size_bytes    INTEGER,
      position      INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_exercise ON media(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises(category);
  `);
}

export default db;
