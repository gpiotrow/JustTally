import 'dotenv/config';
import db from '../db/database.js';

/**
 * Repair workout entries whose `exerciseId` no longer resolves, by re-pointing
 * them at the exercise that now carries their `exerciseRef`.
 *
 * This is the recovery path behind the archive rule, not a routine job. It only
 * has anything to do if an exercise was destroyed while workouts still pointed
 * at it — a catalog wiped and reimported, a delete run straight against the
 * database. It fixes every affected user in one pass, which matters because no
 * single user can see the damage in their own history.
 *
 * Deliberately conservative:
 *  - only entries whose `exerciseId` resolves to nothing are touched
 *  - a rewrite needs an `exerciseRef` that matches exactly one live exercise
 *  - `exerciseName` is left as recorded; it is what the user actually saw
 *  - `updated_at` is not bumped, for the same reason as the backfill: it would
 *    invalidate unsynced offline edits under last-write-wins
 *
 * Usage:
 *   node src/scripts/relinkWorkoutEntries.js --dry-run
 *   node src/scripts/relinkWorkoutEntries.js
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { rows: exercises } = await db.query('SELECT id, ref FROM exercises');
  const liveIds = new Set(exercises.map((e) => e.id));
  const idByRef = new Map();
  for (const e of exercises) {
    if (e.ref != null) idByRef.set(e.ref, e.id);
  }

  const { rows: workouts } = await db.query(
    'SELECT id, user_id, entries FROM workouts WHERE deleted_at IS NULL'
  );

  let workoutsChanged = 0;
  let relinked = 0;
  const unrepairable = [];
  const usersTouched = new Set();

  for (const workout of workouts) {
    const entries = workout.entries ?? [];
    let changed = false;

    const next = entries.map((entry) => {
      if (liveIds.has(entry.exerciseId)) return entry;

      const target = entry.exerciseRef != null ? idByRef.get(entry.exerciseRef) : undefined;
      if (!target) {
        unrepairable.push({
          workoutId: workout.id,
          userId: workout.user_id,
          exerciseName: entry.exerciseName,
          exerciseRef: entry.exerciseRef ?? null,
        });
        return entry;
      }

      changed = true;
      relinked += 1;
      return { ...entry, exerciseId: target };
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
  console.log(`workouts scanned:  ${workouts.length}`);
  console.log(`workouts updated:  ${workoutsChanged} (across ${usersTouched.size} user(s))`);
  console.log(`entries relinked:  ${relinked}`);
  console.log(`entries stranded:  ${unrepairable.length}`);

  if (unrepairable.length > 0) {
    console.log('\nStranded entries (no live exercise for their reference number):');
    for (const u of unrepairable.slice(0, 50)) {
      console.log(
        `  workout ${u.workoutId} (user ${u.userId}): "${u.exerciseName}" ref=${u.exerciseRef ?? '-'}`
      );
    }
    if (unrepairable.length > 50) console.log(`  … and ${unrepairable.length - 50} more`);
  }

  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end().catch(() => {});
  process.exit(1);
});
