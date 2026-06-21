import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = join(__dirname, '..', '..', 'uploads');
const IMAGES_DIR = join(UPLOADS_DIR, 'images');
const THUMBS_DIR = join(UPLOADS_DIR, 'thumbnails');
const VIDEOS_DIR = join(UPLOADS_DIR, 'videos');

for (const dir of [IMAGES_DIR, THUMBS_DIR, VIDEOS_DIR]) {
  mkdirSync(dir, { recursive: true });
}

const MAX_IMAGE_WIDTH = 1280;
const THUMB_WIDTH = 320;

/**
 * Process an uploaded image: compress to WebP + generate a thumbnail.
 * Returns relative URLs served under /uploads.
 */
export async function processImage(buffer, originalName) {
  const id = nanoid();
  const fileName = `${id}.webp`;
  const thumbName = `${id}.thumb.webp`;

  await sharp(buffer)
    .rotate()
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(join(IMAGES_DIR, fileName));

  await sharp(buffer)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 70 })
    .toFile(join(THUMBS_DIR, thumbName));

  return {
    mediaType: 'image',
    url: `/uploads/images/${fileName}`,
    thumbnailUrl: `/uploads/thumbnails/${thumbName}`,
    originalName,
  };
}

/**
 * Store an uploaded video as-is (no transcoding to keep deps light).
 */
export async function processVideo(buffer, originalName, mimeType) {
  const id = nanoid();
  const ext = mimeType === 'video/webm' ? 'webm' : 'mp4';
  const fileName = `${id}.${ext}`;
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(VIDEOS_DIR, fileName), buffer);

  return {
    mediaType: 'video',
    url: `/uploads/videos/${fileName}`,
    thumbnailUrl: null,
    originalName,
  };
}

/**
 * Delete the files backing a media row. Best-effort.
 */
export async function deleteMediaFiles(media) {
  const toDelete = [media.url, media.thumbnail_url].filter(Boolean);
  for (const rel of toDelete) {
    try {
      await unlink(join(UPLOADS_DIR, rel.replace(/^\/uploads\//, '')));
    } catch {
      // ignore missing files
    }
  }
}
