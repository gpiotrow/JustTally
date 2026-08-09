import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { processImage, processVideo, mediaUrl, deleteMediaFiles } from './mediaService.js';
import { UPLOADS_DIR } from './storage/index.js';

// A real (small, generated) image is used rather than a mock: this is the
// regression check that the sharp 0.35.x upgrade still decodes/encodes
// correctly, which a mocked sharp call could not catch.
async function makeTestImage() {
  return sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

afterAll(async () => {
  await rm(UPLOADS_DIR, { recursive: true, force: true });
});

describe('processImage', () => {
  let result;
  let buffer;

  beforeAll(async () => {
    buffer = await makeTestImage();
    result = await processImage(buffer, 'test.jpg');
  });

  it('returns image metadata with local storage and both keys', () => {
    expect(result.mediaType).toBe('image');
    expect(result.storage).toBe('local');
    expect(result.objectKey).toMatch(/^img\/.+\.webp$/);
    expect(result.thumbKey).toMatch(/^img\/.+\.thumb\.webp$/);
    expect(result.originalName).toBe('test.jpg');
  });

  it('downscales the full image to the max width and encodes as webp', async () => {
    const path = mediaUrl(result.objectKey, result.storage).replace('/uploads/', '');
    const written = await readFile(`${UPLOADS_DIR}/${path}`);
    const meta = await sharp(written).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1280); // MAX_IMAGE_WIDTH — source was wider, so this must have downscaled
  });

  it('produces a thumbnail at the thumb width', async () => {
    const path = mediaUrl(result.thumbKey, result.storage).replace('/uploads/', '');
    const written = await readFile(`${UPLOADS_DIR}/${path}`);
    const meta = await sharp(written).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(320); // THUMB_WIDTH
  });

  it('does not upscale images narrower than the max width', async () => {
    const small = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    const small_result = await processImage(small, 'small.jpg');

    const path = mediaUrl(small_result.objectKey, small_result.storage).replace('/uploads/', '');
    const written = await readFile(`${UPLOADS_DIR}/${path}`);
    const meta = await sharp(written).metadata();

    expect(meta.width).toBe(100);
  });
});

describe('processVideo', () => {
  it('stores the buffer unmodified and picks the extension from mimeType', async () => {
    const buffer = Buffer.from('fake video bytes');
    const result = await processVideo(buffer, 'clip.webm', 'video/webm');

    expect(result.mediaType).toBe('video');
    expect(result.thumbKey).toBeNull();
    expect(result.objectKey).toMatch(/^vid\/.+\.webm$/);

    const path = mediaUrl(result.objectKey, result.storage).replace('/uploads/', '');
    const written = await readFile(`${UPLOADS_DIR}/${path}`);
    expect(written.equals(buffer)).toBe(true);
  });

  it('defaults to mp4 for non-webm mime types', async () => {
    const result = await processVideo(Buffer.from('x'), 'clip.mov', 'video/quicktime');
    expect(result.objectKey).toMatch(/\.mp4$/);
  });
});

describe('mediaUrl', () => {
  it('resolves an object key through the local driver', () => {
    expect(mediaUrl('img/abc.webp', 'local')).toBe('/uploads/img/abc.webp');
  });

  it('falls back to the stored URL for legacy rows with no object key', () => {
    expect(mediaUrl(null, 'local', '/uploads/legacy.jpg')).toBe('/uploads/legacy.jpg');
  });

  it('falls back to the stored URL when the storage driver is unknown', () => {
    expect(mediaUrl('img/abc.webp', 'r2-not-configured-yet', '/uploads/fallback.jpg')).toBe(
      '/uploads/fallback.jpg'
    );
  });
});

describe('deleteMediaFiles', () => {
  it('removes both the full image and thumbnail objects', async () => {
    const buffer = await makeTestImage();
    const media = await processImage(buffer, 'to-delete.jpg');
    const fullPath = mediaUrl(media.objectKey, media.storage).replace('/uploads/', '');
    const thumbPath = mediaUrl(media.thumbKey, media.storage).replace('/uploads/', '');

    await deleteMediaFiles({ storage: media.storage, object_key: media.objectKey, thumb_key: media.thumbKey });

    await expect(readFile(`${UPLOADS_DIR}/${fullPath}`)).rejects.toThrow();
    await expect(readFile(`${UPLOADS_DIR}/${thumbPath}`)).rejects.toThrow();
  });

  it('is a no-op (not a throw) when the objects are already gone', async () => {
    await expect(
      deleteMediaFiles({ storage: 'local', object_key: 'img/never-existed.webp', thumb_key: null })
    ).resolves.toBeUndefined();
  });
});
