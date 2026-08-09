import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Root of the media tree. On fly.io this points at the mounted volume
 * (UPLOADS_DIR=/data/uploads); locally it defaults to backend/uploads.
 */
export const UPLOADS_DIR =
  process.env.UPLOADS_DIR || join(__dirname, '..', '..', '..', 'uploads');

/**
 * Reject keys that could escape UPLOADS_DIR. Keys are always built server-side,
 * but this is the one place where a key becomes a filesystem path — so it is
 * also the one place where a traversal would land.
 */
function resolvePath(key) {
  if (typeof key !== 'string' || !key || key.includes('..') || key.startsWith('/')) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return join(UPLOADS_DIR, ...key.split('/'));
}

/**
 * Filesystem-backed storage driver.
 * Used for local development and for fly.io volumes (stage 1 of the media plan).
 *
 * @returns {import('./index.js').StorageDriver}
 */
export function createLocalDriver() {
  return {
    name: 'local',

    async put(key, body) {
      const path = resolvePath(key);
      mkdirSync(dirname(path), { recursive: true });
      await writeFile(path, body);
    },

    async remove(key) {
      try {
        await unlink(resolvePath(key));
      } catch (err) {
        // A missing file is the desired end state, not an error.
        if (err?.code !== 'ENOENT') throw err;
      }
    },

    publicUrl(key) {
      return `/uploads/${key}`;
    },

    async presignPut() {
      // Direct-to-storage uploads only make sense against an object store.
      // With the local driver the client uploads through the API instead.
      throw new Error('presignPut is not supported by the local storage driver');
    },
  };
}
