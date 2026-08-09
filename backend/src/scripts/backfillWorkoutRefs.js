import 'dotenv/config';
import db from '../db/database.js';

/**
 * Stamp `exerciseRef` onto workout entries recorded before the client started
 * writing it, across every user.
 *
 * Why this matters: `exerciseId` is the only link an entry has to its exercise.
 * If that link is ever broken — a delete that slipped past the archive rule, a
 * catalog rebuilt from scratch — the entry is orphaned and the set data reads as
 * an exercise that no longer exists. `exerciseRef` is the second, human-meaningful
 * handle that `relinkWorkoutEntries.js` can repair from.
 *
 * `updated_at` is deliberately left alone. Bumping it would push every workout
 * past the `lastSyncedAt` of clients holding unsynced offline edits, and the
 * sync resolves last-write-wins by that timestamp — those edits would be
 * discarded as stale. A recovery aid must not cost anyone a logged session, and
 * nothing in the app reads `exerciseRef` on the way in; only recovery does.
 *
 * Usage:
 *   node src/scripts/backfillWorkoutRefs.js --dry-run
 *   node src/scripts/backfillWorkoutRefs.js
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { rows: exercises } = await db.query('SELECT id, ref FROM exercises');
  const refById = new Map(exercises.map((e) => [e.id, e.ref]));

  const { rows: workouts } = await db.query(
    'SELECT id, user_id, entries FROM workouts WHERE deleted_at IS NULL'
  );

  let workoutsChanged = 0;
  let entriesStamped = 0;
  let entriesUnresolved = 0;
  const usersTouched = new Set();

  for (const workout of workouts) {
    const entries = workout.entries ?? [];
    let changed = false;

    const next = entries.map((entry) => {
      if (entry.exerciseRef !== undefined) return entry;
      const ref = refById.get(entry.exerciseId);
      if (ref == null) {
        entriesUnresolved += 1;
        return entry;
      }
      changed = true;
      entriesStamped += 1;
      return { ...entry, exerciseRef: ref };
    });

    if (!changed) continue;
    workoutsChanged += 1;
    usersTouched.add(workout.user_id);

    if (!dryRun) {
      await db.query('UPDATE workouts SET entries = $1::jsonb WHERE id = $2', [
        JSON.stringify(next),
        workout.id,
      ]);
    }
  }

  console.log(dryRun ? '— dry run, nothing written —' : '— applied —');
  console.log(`workouts scanned:    ${workouts.length}`);
  console.log(`workouts updated:    ${workoutsChanged} (across ${usersTouched.size} user(s))`);
  console.log(`entries stamped:     ${entriesStamped}`);
  console.log(`entries unresolved:  ${entriesUnresolved} (exercise id no longer exists)`);

  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
