import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CSV_EXPORT_COLUMNS } from './csvExport.js';

/**
 * Backend and frontend are separate packages and cannot import from each
 * other, so the CSV column list is duplicated in
 * frontend/src/api/exercises.ts (`CSV_COLUMNS`). This test parses that
 * duplicate out of the source file and asserts it stays byte-for-byte in
 * sync with the backend's `CSV_EXPORT_COLUMNS` — the single source of truth
 * both `parseExercisesCsv` and `exercisesToCsv` are built from.
 */
describe('frontend CSV_COLUMNS stays in sync with backend CSV_EXPORT_COLUMNS', () => {
  it('matches exactly, in order', () => {
    const frontendPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../frontend/src/api/exercises.ts'
    );
    const source = readFileSync(frontendPath, 'utf8');
    const match = source.match(/const CSV_COLUMNS = \[([\s\S]*?)\];/);
    expect(match, 'CSV_COLUMNS array not found in frontend/src/api/exercises.ts').not.toBeNull();

    const frontendColumns = match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.replace(/^['"]|['"]$/g, ''));

    expect(frontendColumns).toEqual(CSV_EXPORT_COLUMNS);
  });
});
