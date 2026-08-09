import { createLocalDriver, UPLOADS_DIR } from './localDriver.js';

export { UPLOADS_DIR };

/**
 * @typedef {object} StorageDriver
 * @property {string} name                                          Value written to media.storage.
 * @property {(key: string, body: Buffer, contentType: string) => Promise<void>} put
 * @property {(key: string) => Promise<void>} remove                Missing objects are not an error.
 * @property {(key: string) => string} publicUrl
 * @property {(key: string, contentType: string) => Promise<string>} presignPut
 */

/** Drivers are created once and reused; each holds a client/connection. */
const drivers = new Map([['local', createLocalDriver()]]);

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
