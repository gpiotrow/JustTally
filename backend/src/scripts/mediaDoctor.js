import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import db from '../db/database.js';
import { driverFor } from '../services/storage/index.js';

/** Derived from the key layout in mediaService.js — not guessed. */
function contentTypeFor(key) {
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.webm')) return 'video/webm';
  if (key.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

/** Keys a media row is backed by, recovering legacy rows from their stored URL. */
function keysFor(media) {
  const keys = [media.object_key, media.thumb_key].filter(Boolean);
  if (keys.length > 0) return keys;
  return [media.url, media.thumbnail_url].filter(Boolean).map((u) => u.replace(/^\/uploads\//, ''));
}

/**
 * --report: find media rows whose backing object no longer exists — orphaned
 * DB rows pointing at nothing, e.g. from the pre-fly.io Render filesystem loss,
 * or any other gap between the row and its object. Prints one CSV line per
 * missing object with the exercise's `ref` number, since that's what a bulk
 * re-upload matches files by.
 */
export async function report() {
  const { rows } = await db.query(
    'SELECT id, exercise_id, media_type, storage, object_key, thumb_key, url, thumbnail_url FROM media ORDER BY exercise_id'
  );

  const missing = [];
  for (const m of rows) {
    const driver = driverFor(m.storage);
    if (!driver) {
      missing.push({ media: m, key: null, reason: `unknown_driver:${m.storage}` });
      continue;
    }
    for (const key of keysFor(m)) {
      if (!(await driver.exists(key))) {
        missing.push({ media: m, key, reason: 'object_missing' });
      }
    }
  }

  const exerciseIds = [...new Set(missing.map((r) => r.media.exercise_id))];
  const { rows: exercises } = exerciseIds.length
    ? await db.query('SELECT id, ref, name FROM exercises WHERE id = ANY($1)', [exerciseIds])
    : { rows: [] };
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  console.log('media_id,exercise_ref,exercise_name,storage,key,reason');
  for (const { media, key, reason } of missing) {
    const ex = exerciseById.get(media.exercise_id);
    const name = (ex?.name ?? '').replace(/"/g, '""');
    console.log(`${media.id},${ex?.ref ?? ''},"${name}",${media.storage},${key ?? ''},${reason}`);
  }
  console.error(`\n${missing.length} missing object(s) out of ${rows.length} media row(s).`);
  return missing;
}

/** --prune: delete the DB rows --report flagged. Never touches storage — there is nothing there to touch. */
export async function prune() {
  const missing = await report();
  if (missing.length === 0) {
    console.error('Nothing to prune.');
    return;
  }
  const ids = [...new Set(missing.map((r) => r.media.id))];
  await db.query('DELETE FROM media WHERE id = ANY($1)', [ids]);
  console.error(`Pruned ${ids.length} orphaned media row(s).`);
}

/**
 * --to-r2: move every `storage = 'local'` row onto R2.
 *
 * Defaults to a dry run; pass `apply: true` to actually write. Ordering per
 * row is deliberate and never reordered: upload to R2 → verify it landed →
 * flip the DB row to storage='r2' → only then delete the local file. Any
 * failure before the DB update leaves the row exactly as it was — still
 * local, still serving from the volume — rather than in a state where
 * neither copy is guaranteed good. Rows are processed one at a time, not in
 * parallel, to keep that ordering per row unambiguous and to stay inside
 * R2's request limits on a full-catalog run.
 *
 * Legacy rows without an `object_key` (pre-dates the storage driver) are
 * skipped, not guessed at — recover them via `--report` + re-upload instead.
 */
export async function toR2({ apply = false } = {}) {
  const r2 = driverFor('r2');
  if (!r2) {
    throw new Error(
      'R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, MEDIA_PUBLIC_BASE_URL). Set these before running --to-r2.'
    );
  }
  const local = driverFor('local');

  const { rows } = await db.query("SELECT * FROM media WHERE storage = 'local'");
  console.error(
    `${rows.length} local media row(s) found.${apply ? '' : ' Dry run — pass --apply to actually migrate.'}`
  );

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of rows) {
    const fields = [
      ['object_key', m.object_key],
      ['thumb_key', m.thumb_key],
    ].filter(([, key]) => key);

    if (fields.length === 0) {
      console.error(`skip ${m.id}: no object_key (legacy row) — use --report, then re-upload`);
      skipped += 1;
      continue;
    }

    try {
      const buffers = [];
      for (const [, key] of fields) {
        if (!(await local.exists(key))) throw new Error(`local object missing: ${key}`);
        buffers.push(await local.get(key));
      }

      if (apply) {
        for (let i = 0; i < fields.length; i++) {
          const [, key] = fields[i];
          await r2.put(key, buffers[i], contentTypeFor(key));
        }
        for (const [, key] of fields) {
          if (!(await r2.exists(key))) throw new Error(`upload verification failed for ${key}`);
        }
        await db.query("UPDATE media SET storage = 'r2' WHERE id = $1", [m.id]);
        // Only after the DB row points at r2 does the local copy become deletable.
        for (const [, key] of fields) await local.remove(key);
      }

      console.error(`${apply ? 'migrated' : 'would migrate'} ${m.id} (${m.object_key})`);
      migrated += 1;
    } catch (err) {
      console.error(`FAILED ${m.id}: ${err instanceof Error ? err.message : err}`);
      failed += 1;
    }
  }

  console.error(`\n${migrated} ${apply ? 'migrated' : 'would migrate'}, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  try {
    if (args.includes('--report')) {
      await report();
    } else if (args.includes('--prune')) {
      await prune();
    } else if (args.includes('--to-r2')) {
      await toR2({ apply: args.includes('--apply') });
    } else {
      console.error('Usage: node src/scripts/mediaDoctor.js --report | --prune | --to-r2 [--apply]');
      process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}

// Only run when invoked directly (`node mediaDoctor.js ...`), not when
// report/prune/toR2 are imported for testing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
