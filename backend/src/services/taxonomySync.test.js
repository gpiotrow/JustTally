import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MUSCLE_GROUPS } from './muscles.js';
import { EQUIPMENT_ITEMS } from './equipment.js';
import { GOAL_ITEMS } from './goals.js';
import { CATEGORIES } from './categories.js';
import { TRACKING_MODES } from './tracking.js';
import { MACHINE_SETTINGS } from './machineSettings.js';

/**
 * Backend and frontend are separate packages and cannot import from each
 * other, so every closed vocabulary exists twice. Same reasoning — and same
 * mechanism — as `csvColumnsSync.test.js`: parse the frontend duplicate out of
 * its source file and assert it matches the backend's copy exactly.
 *
 * Drift here is not cosmetic. A code the backend accepts but the frontend does
 * not know renders as a blank chip with no translation; a code the frontend
 * offers but the backend rejects turns into a 400 the user cannot explain.
 */
const FRONTEND_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../frontend/src'
);

/** Extract `export const NAME = [ ... ] as const;` from a TS source file. */
function readFrontendArray(relativePath, name) {
  const source = readFileSync(path.join(FRONTEND_SRC, relativePath), 'utf8');
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  expect(match, `${name} array not found in frontend/src/${relativePath}`).not.toBeNull();

  return match[1]
    .replace(/\/\/.*$/gm, '') // drop trailing line comments before reading literals
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^['"]|['"]$/g, ''));
}

describe('frontend taxonomies stay in sync with the backend allow-lists', () => {
  it.each([
    ['MUSCLE_GROUPS', 'lib/muscles.ts', MUSCLE_GROUPS],
    ['EQUIPMENT_ITEMS', 'lib/equipment.ts', EQUIPMENT_ITEMS],
    ['GOAL_ITEMS', 'lib/goals.ts', GOAL_ITEMS],
    ['CATEGORIES', 'lib/types.ts', CATEGORIES],
    ['TRACKING_MODES', 'lib/tracking.ts', TRACKING_MODES],
    ['MACHINE_SETTINGS', 'lib/machineSettings.ts', MACHINE_SETTINGS],
  ])('%s matches exactly, in order', (name, relativePath, backendList) => {
    expect(readFrontendArray(relativePath, name)).toEqual(backendList);
  });
});
