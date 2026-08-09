import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import db from '../db/database.js';
import { deleteMediaFiles } from '../services/mediaService.js';
import { countAggregateExerciseUsage, countExerciseUsage } from '../services/exerciseUsage.js';

/**
 * Empty the exercise catalog — media objects included — so the first real
 * import starts from nothing instead of on top of the sample data.
 *
 * Dry run by default, like `mediaDoctor.js`: nothing is written without
 * `--apply`. The dry run reports the same numbers the real run will act on,
 * including how many people's training history is involved, because that is
 * the part an operator cannot see from the catalog itself.
 *
 * Invariant I3 still holds: an exercise a live workout points at is archived,
 * not deleted, since deleting it would blank the exercise name in someone
 * else's history. `--with-workouts` is the escape hatch for exactly the
 * situation this script exists for — the workouts are test data too — and it
 * tombstones those workouts first, after which nothing references the
 * exercises and they can go for good.
 */

/** Workouts (not tombstoned) that reference any of these exercises. */
const REFERENCING_WORKOUTS_PREDICATE = `
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM unnest($1::text[]) AS eid
     WHERE entries @> jsonb_build_array(jsonb_build_object('exerciseId', eid))
  )`;

export async function resetCatalog({ apply = false, withWorkouts = false } = {}) {
  const { rows: exercises } = await db.query('SELECT id, ref, name FROM exercises ORDER BY ref');
  if (exercises.length === 0) {
    console.error('Catalog is already empty — nothing to do.');
    return { deleted: 0, archived: 0, mediaRemoved: 0, workoutsTombstoned: 0 };
  }

  const ids = exercises.map((e) => e.id);

  const { rows: mediaRows } = await db.query('SELECT * FROM media WHERE exercise_id = ANY($1)', [
    ids,
  ]);
  const { rows: favoriteRows } = await db.query(
    'SELECT COUNT(*)::int AS n FROM favorites WHERE exercise_id = ANY($1)',
    [ids]
  );
  const perExercise = await countExerciseUsage(db, ids);
  const aggregate = await countAggregateExerciseUsage(db, ids);

  const referencedIds = new Set(
    exercises.filter((e) => perExercise.get(e.id).workouts > 0).map((e) => e.id)
  );
  // With --with-workouts every exercise ends up unreferenced, so everything goes.
  const willDelete = withWorkouts ? exercises : exercises.filter((e) => !referencedIds.has(e.id));
  const willArchive = withWorkouts ? [] : exercises.filter((e) => referencedIds.has(e.id));

  console.error(
    `${exercises.length} exercise(s), ${mediaRows.length} media row(s), ${favoriteRows[0].n} favorite(s).`
  );
  if (aggregate.workouts > 0) {
    console.error(
      `${aggregate.workouts} live workout(s) from ${aggregate.users} user(s) reference this catalog.`
    );
    console.error(
      withWorkouts
        ? '  --with-workouts: those workouts will be marked deleted, then every exercise removed.'
        : `  ${willArchive.length} exercise(s) will be ARCHIVED instead of deleted (invariant I3).` +
            ' Pass --with-workouts to remove them and their workouts as well.'
    );
  }
  console.error(
    `\n${apply ? 'Deleting' : 'Would delete'} ${willDelete.length}, ` +
      `${apply ? 'archiving' : 'would archive'} ${willArchive.length}.` +
      (apply ? '' : ' Dry run — pass --apply to actually write.')
  );

  if (!apply) {
    return {
      deleted: 0,
      archived: 0,
      mediaRemoved: 0,
      workoutsTombstoned: 0,
      wouldDelete: willDelete.length,
      wouldArchive: willArchive.length,
    };
  }

  let workoutsTombstoned = 0;
  if (withWorkouts) {
    // Tombstoned, not removed outright. A hard delete would leave every client
    // holding a local copy the server no longer knows about — and the sync
    // pushes local sessions as upserts, so the next sync would put them all
    // straight back. A tombstone is what actually reaches the devices.
    const now = Date.now();
    const { rowCount } = await db.query(
      `UPDATE workouts SET deleted_at = $2, updated_at = $2 WHERE ${REFERENCING_WORKOUTS_PREDICATE}`,
      [ids, now]
    );
    workoutsTombstoned = rowCount;
    console.error(`Marked ${workoutsTombstoned} workout(s) deleted.`);
  }

  const deleteIds = willDelete.map((e) => e.id);

  // Objects first, rows second. The reverse order can leave objects in storage
  // that nothing points at any more — invisible, and nothing looks for them.
  // This way a failure leaves rows pointing at missing objects instead, which
  // `mediaDoctor.js --report` finds and `--prune` cleans up.
  let mediaRemoved = 0;
  const deleteIdSet = new Set(deleteIds);
  for (const m of mediaRows) {
    if (!deleteIdSet.has(m.exercise_id)) continue; // archived exercises keep their media
    await deleteMediaFiles(m);
    mediaRemoved += 1;
  }

  let archived = 0;
  if (willArchive.length > 0) {
    const now = Date.now();
    const { rowCount } = await db.query(
      `UPDATE exercises SET archived_at = $1, updated_at = $1
        WHERE id = ANY($2) AND archived_at IS NULL`,
      [now, willArchive.map((e) => e.id)]
    );
    archived = rowCount;
  }

  let deleted = 0;
  if (deleteIds.length > 0) {
    // media and favorites cascade off the exercise rows.
    const { rowCount } = await db.query('DELETE FROM exercises WHERE id = ANY($1)', [deleteIds]);
    deleted = rowCount;
  }

  console.error(
    `\nDeleted ${deleted} exercise(s), archived ${archived}, removed ${mediaRemoved} media object set(s).`
  );
  return { deleted, archived, mediaRemoved, workoutsTombstoned };
}

const USAGE = `Usage: node src/scripts/resetCatalog.js [--apply] [--with-workouts]

  (no flags)        dry run — report what would change, write nothing
  --apply           actually delete
  --with-workouts   also tombstone workouts referencing these exercises,
                    so referenced exercises are deleted rather than archived`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.error(USAGE);
    return;
  }
  if (args.length === 0) console.error(`${USAGE}\n\nNo flags given — running a dry run.\n`);
  try {
    await resetCatalog({
      apply: args.includes('--apply'),
      withWorkouts: args.includes('--with-workouts'),
    });
  } finally {
    await db.end();
  }
}

// Only when invoked directly, so the export stays importable for tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
