import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { storage, driverFor } from './storage/index.js';

const MAX_IMAGE_WIDTH = 1280;
const THUMB_WIDTH = 320;

/**
 * @typedef {object} ProcessedMedia
 * @property {'image'|'video'} mediaType
 * @property {string} storage        Driver that holds the object (media.storage).
 * @property {string} objectKey
 * @property {string|null} thumbKey
 * @property {string} originalName
 */

/**
 * Compress an uploaded image to WebP and generate a thumbnail.
 *
 * Both variants are produced sequentially rather than in parallel: sharp holds
 * the decoded bitmap in memory, and a 512 MB fly machine has no room for two
 * large decodes at once.
 *
 * @returns {Promise<ProcessedMedia>}
 */
export async function processImage(buffer, originalName) {
  const id = nanoid();
  const objectKey = `img/${id}.webp`;
  const thumbKey = `img/${id}.thumb.webp`;

  const full = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  await storage.put(objectKey, full, 'image/webp');

  const thumb = await sharp(buffer)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  await storage.put(thumbKey, thumb, 'image/webp');

  return { mediaType: 'image', storage: storage.name, objectKey, thumbKey, originalName };
}

/**
 * Store an uploaded video as-is (no transcoding, to keep dependencies light).
 * @returns {Promise<ProcessedMedia>}
 */
export async function processVideo(buffer, originalName, mimeType) {
  const id = nanoid();
  const ext = mimeType === 'video/webm' ? 'webm' : 'mp4';
  const objectKey = `vid/${id}.${ext}`;

  await storage.put(objectKey, buffer, mimeType);

  return { mediaType: 'video', storage: storage.name, objectKey, thumbKey: null, originalName };
}

/**
 * Public URL for a media row.
 *
 * Three generations of rows have to resolve here:
 *  - pre-object-key rows, which only ever had a stored `/uploads/...` path
 *  - local rows, served by this app from UPLOADS_DIR
 *  - object-store rows, served from the CDN base URL
 *
 * @param {string|null} objectKey
 * @param {string} storageName
 * @param {string|null} storedUrl Legacy media.url / media.thumbnail_url.
 */
export function mediaUrl(objectKey, storageName, storedUrl = null) {
  if (!objectKey) return storedUrl;
  const driver = driverFor(storageName);
  if (!driver) return storedUrl;
  return driver.publicUrl(objectKey);
}

/**
 * Delete the objects backing a media row. Best-effort: a missing object is the
 * desired end state. Routed through the row's own driver, not the active one.
 */
export async function deleteMediaFiles(media) {
  const driver = driverFor(media.storage);
  if (!driver) return;

  const keys = [media.object_key, media.thumb_key].filter(Boolean);
  if (keys.length === 0) {
    // Legacy rows predate object keys — recover them from the stored path.
    for (const rel of [media.url, media.thumbnail_url].filter(Boolean)) {
      keys.push(rel.replace(/^\/uploads\//, ''));
    }
  }

  for (const key of keys) {
    try {
      await driver.remove(key);
    } catch {
      // Never let cleanup failures block the delete of the row itself.
    }
  }
}
