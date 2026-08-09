import { createLocalDriver, UPLOADS_DIR } from './localDriver.js';
import { createR2Driver } from './r2Driver.js';

export { UPLOADS_DIR };

/**
 * @typedef {object} StorageDriver
 * @property {string} name                                          Value written to media.storage.
 * @property {(key: string, body: Buffer, contentType: string) => Promise<void>} put
 * @property {(key: string) => Promise<Buffer>} get
 * @property {(key: string) => Promise<void>} remove                Missing objects are not an error.
 * @property {(key: string) => string} publicUrl
 * @property {(key: string) => Promise<boolean>} exists
 * @property {(key: string, contentType: string) => Promise<string>} presignPut
 */

/** Drivers are created once and reused; each holds a client/connection. */
const drivers = new Map([['local', createLocalDriver()]]);

// R2 is optional: only constructed when its config is actually present, so a
// deployment that has never touched Cloudflare doesn't need R2_* vars set
// just to boot with MEDIA_DRIVER=local. Once ANY R2 var is set, though, this
// is fail-fast on the rest being missing — a half-configured R2 is a bug, not
// a valid "not using R2" state. R2_ACCOUNT_ID (not just MEDIA_DRIVER=r2) also
// triggers this, so the driver stays resolvable for legacy rows after a
// rollback from r2 back to local (see driverFor below).
if (process.env.R2_ACCOUNT_ID || process.env.MEDIA_DRIVER === 'r2') {
  drivers.set('r2', createR2Driver());
}

const ACTIVE = process.env.MEDIA_DRIVER || 'local';

if (!drivers.has(ACTIVE)) {
  throw new Error(
    `Unknown MEDIA_DRIVER "${ACTIVE}" (supported: ${[...drivers.keys()].join(', ')})`
  );
}

/** The driver new uploads are written to. */
export const storage = drivers.get(ACTIVE);

/**
 * Resolve the driver a stored row belongs to.
 *
 * Deletes must go through the driver that wrote the object, not the currently
 * active one — otherwise, once MEDIA_DRIVER flips to r2, deleting a row that
 * still lives on disk would silently do nothing and leak the file forever.
 *
 * @param {string} name Value of media.storage.
 * @returns {StorageDriver | null} null when no driver for `name` is configured.
 */
export function driverFor(name) {
  return drivers.get(name || 'local') ?? null;
}
