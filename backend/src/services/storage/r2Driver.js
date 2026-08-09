import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PRESIGN_TTL_SECONDS = 300;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Required when MEDIA_DRIVER=r2 (or R2 is configured as a fallback driver).`);
  }
  return value;
}

/**
 * S3-compatible driver against Cloudflare R2.
 *
 * Constructing this throws immediately if required config is missing —
 * deliberately: partially configured R2 (e.g. an account id with no key) is
 * itself a bug, and failing at startup surfaces it before an upload does.
 * `storage/index.js` only calls this when R2 config is actually present, so
 * a plain local-only deployment never has to set these variables at all.
 *
 * @returns {import('./index.js').StorageDriver}
 */
export function createR2Driver() {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  const bucket = requireEnv('R2_BUCKET');
  // The bucket's custom domain (e.g. https://media.justtally.org), not the
  // R2 API endpoint — that's what actually serves the object publicly.
  const publicBaseUrl = requireEnv('MEDIA_PUBLIC_BASE_URL').replace(/\/+$/, '');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    name: 'r2',

    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
      );
    },

    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await res.Body.transformToByteArray());
    },

    async remove(key) {
      // DeleteObject on a missing key is not an error in S3-compatible APIs —
      // matches the local driver's "missing object is the desired end state".
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    publicUrl(key) {
      return `${publicBaseUrl}/${key}`;
    },

    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err) {
        if (err?.name === 'NotFound' || err?.$metadata?.httpStatusCode === 404) return false;
        throw err;
      }
    },

    async presignPut(key, contentType) {
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
        { expiresIn: PRESIGN_TTL_SECONDS }
      );
    },
  };
}
