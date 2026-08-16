import { describe, it, expect } from 'vitest';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { MUSCLE_GROUPS } from '../lib/muscles';
import { EQUIPMENT_ITEMS } from '../lib/equipment';
import { GOAL_ITEMS } from '../lib/goals';
import { CATEGORIES } from '../lib/types';

/**
 * Taxonomy labels are looked up dynamically — `t(\`muscle.${code}\` as TKey)` —
 * and that `as TKey` cast is exactly what makes this test necessary: it hides a
 * missing key from the compiler. `en`/`es` are typed `Record<TKey, string>`, so
 * TypeScript already guarantees the three languages carry identical key sets;
 * what it cannot guarantee is that a newly added taxonomy code brought its
 * `muscle.*` / `equipment.*` / `goal.*` / `category.*` label along.
 *
 * Without this, adding a code ships a chip labelled with its raw key.
 */
const LANGUAGES = { de, en, es } as const;

const TAXONOMIES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['muscle', MUSCLE_GROUPS],
  ['equipment', EQUIPMENT_ITEMS],
  ['goal', GOAL_ITEMS],
  ['category', CATEGORIES],
];

describe('every taxonomy code has a label in every language', () => {
  for (const [prefix, codes] of TAXONOMIES) {
    for (const [langName, dict] of Object.entries(LANGUAGES)) {
      it(`${prefix}.* is complete in ${langName}`, () => {
        const missing = codes.filter((code) => !(`${prefix}.${code}` in dict));
        expect(missing, `missing ${prefix}.* keys in ${langName}.ts`).toEqual([]);
      });
    }
  }

  it('has no label without a matching code', () => {
    // Catches the reverse drift: a code removed from a taxonomy but its label
    // left behind, which then quietly rots.
    const orphans: string[] = [];
    for (const [prefix, codes] of TAXONOMIES) {
      const known = new Set<string>(codes);
      for (const key of Object.keys(de)) {
        if (key.startsWith(`${prefix}.`) && !known.has(key.slice(prefix.length + 1))) {
          orphans.push(key);
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});
