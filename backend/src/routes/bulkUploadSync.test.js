import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * `MAX_BULK_FILES` is duplicated in frontend/src/api/exercises.ts, the same way
 * the CSV columns and the taxonomies are. Unlike those, it is a limit rather
 * than a vocabulary, so drift fails loudly and late: the client keeps sending
 * chunks the server rejects wholesale with "Too many files in one upload".
 *
 * The second assertion guards the relationship that actually broke once —
 * strictly below the cap, not merely at or below it: a chunk size *equal* to
 * the cap still round-trips fine, but a cap-sized selection then uploads as
 * exactly one chunk, and onProgress only fires once, at the very end, making
 * the progress counter look frozen for the whole upload.
 */
const FRONTEND_API = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../frontend/src/api/exercises.ts'
);

/** Read `export const NAME = <number>;` out of the frontend API module. */
function readFrontendNumber(source, name) {
  const match = source.match(new RegExp(`export const ${name} = (\\d+);`));
  expect(match, `${name} not found in frontend/src/api/exercises.ts`).not.toBeNull();
  return Number(match[1]);
}

/** Read the backend's own cap without importing the route (it opens a DB pool). */
function backendMaxBulkFiles() {
  const source = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), './exercises.js'),
    'utf8'
  );
  const match = source.match(/const MAX_BULK_FILES = (\d+);/);
  expect(match, 'MAX_BULK_FILES not found in backend/src/routes/exercises.js').not.toBeNull();
  return Number(match[1]);
}

describe('bulk upload limits stay in sync across the stack', () => {
  const frontendSource = readFileSync(FRONTEND_API, 'utf8');

  it('frontend MAX_BULK_FILES matches the backend cap', () => {
    expect(readFrontendNumber(frontendSource, 'MAX_BULK_FILES')).toBe(backendMaxBulkFiles());
  });

  it('frontend chunk size stays strictly below the cap', () => {
    expect(readFrontendNumber(frontendSource, 'UPLOAD_CHUNK_SIZE')).toBeLessThan(
      backendMaxBulkFiles()
    );
  });
});
