import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import db from '../db/database.js';
import { readMuscleList } from '../services/muscles.js';

/**
 * A plausible primary muscle group per coarse `category` (§ 2.4).
 *
 * This is a **starting point, not an answer.** `category` carries roughly an
 * eighth of the information the taxonomy wants: "legs" cannot distinguish a
 * squat from a calf raise, and "arms" covers two muscles that are never
 * trained by the same movement. The mapping is therefore deliberately
 * conservative — it fills in what a category genuinely implies and leaves
 * secondary groups empty for a human to add via CSV or the admin form.
 *
 * `cardio` and `other` map to nothing at all: guessing there would put load
 * on a muscle nobody trained, which is worse for a heatmap than a blank.
 */
export const CATEGORY_TO_PRIMARY = {
  chest: ['chest'],
  back: ['lats'],
  legs: ['quads', 'hamstrings', 'glutes'],
  shoulders: ['front_delts', 'side_delts'],
  arms: ['biceps', 'triceps'],
  core: ['abs'],
  cardio: [],
  other: [],
};

/**
 * Backfill `muscles_primary` from `category` for exercises that have none.
 *
 * Only ever touches rows whose primary list is still empty — an exercise
 * someone has already classified by hand is never overwritten by a guess,
 * which is what makes running this twice harmless.
 *
 * @param {{ apply?: boolean }} options `apply: false` (the default) reports
 *   what it would do and writes nothing.
 */
export async function backfill({ apply = false } = {}) {
  const { rows } = await db.query(
    'SELECT id, ref, name, category, muscles_primary FROM exercises ORDER BY ref'
  );

  let updated = 0;
  let skippedClassified = 0;
  let skippedNoMapping = 0;

  console.log('exercise_ref,exercise_name,category,muscles_primary');

  for (const row of rows) {
    if (readMuscleList(row.muscles_primary).length > 0) {
      skippedClassified += 1;
      continue;
    }

    const primary = CATEGORY_TO_PRIMARY[row.category] ?? [];
    if (primary.length === 0) {
      skippedNoMapping += 1;
      continue;
    }

    const name = (row.name ?? '').replace(/"/g, '""');
    console.log(`${row.ref ?? ''},"${name}",${row.category},"${primary.join(',')}"`);

    if (apply) {
      await db.query('UPDATE exercises SET muscles_primary = $1::jsonb, updated_at = $2 WHERE id = $3', [
        JSON.stringify(primary),
        Date.now(),
        row.id,
      ]);
    }
    updated += 1;
  }

  console.error(
    `\n${updated} ${apply ? 'updated' : 'would update'}, ` +
      `${skippedClassified} already classified, ` +
      `${skippedNoMapping} without a category mapping (cardio/other/unknown).`
  );
  console.error(
    'Secondary muscles are never guessed — maintain them via the CSV export/import or the admin form.'
  );

  return { updated, skippedClassified, skippedNoMapping };
}

async function main() {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--report')) {
      await backfill({ apply: false });
    } else if (args.includes('--apply')) {
      await backfill({ apply: true });
    } else {
      console.error('Usage: node src/scripts/backfillMuscles.js --report | --apply');
      process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}

// Only run when invoked directly, not when `backfill` is imported for testing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
