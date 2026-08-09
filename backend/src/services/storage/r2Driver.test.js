import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn(async () => 'https://presigned.example/put');

vi.mock('@aws-sdk/client-s3', () => {
  class FakeS3Client {
    send(...args) {
      return sendMock(...args);
    }
  }
  class Command {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    S3Client: FakeS3Client,
    PutObjectCommand: class extends Command {
      name = 'PutObjectCommand';
    },
    DeleteObjectCommand: class extends Command {
      name = 'DeleteObjectCommand';
    },
    HeadObjectCommand: class extends Command {
      name = 'HeadObjectCommand';
    },
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args) => getSignedUrlMock(...args),
}));

const { createR2Driver } = await import('./r2Driver.js');

const REQUIRED_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'MEDIA_PUBLIC_BASE_URL',
];

function setFullConfig() {
  process.env.R2_ACCOUNT_ID = 'acct-123';
  process.env.R2_ACCESS_KEY_ID = 'key-id';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_BUCKET = 'justtally-media';
  process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.justtally.org/';
}

function clearConfig() {
  for (const v of REQUIRED_VARS) delete process.env[v];
}

beforeEach(() => {
  clearConfig();
  sendMock.mockReset();
  getSignedUrlMock.mockClear();
});
afterEach(() => {
  clearConfig();
});

describe('createR2Driver — fail-fast config', () => {
  it.each(REQUIRED_VARS)('throws when %s is missing', (missingVar) => {
    setFullConfig();
    delete process.env[missingVar];
    expect(() => createR2Driver()).toThrow(new RegExp(missingVar));
  });

  it('constructs successfully with full config', () => {
    setFullConfig();
    expect(() => createR2Driver()).not.toThrow();
  });
});

describe('createR2Driver — driver behavior', () => {
  beforeEach(setFullConfig);

  it('strips a trailing slash from MEDIA_PUBLIC_BASE_URL before joining the key', () => {
    const driver = createR2Driver();
    expect(driver.publicUrl('img/abc.webp')).toBe('https://media.justtally.org/img/abc.webp');
  });

  it('put() sends a PutObjectCommand with bucket, key, body and content type', async () => {
    const driver = createR2Driver();
    const body = Buffer.from('fake image bytes');
    sendMock.mockResolvedValueOnce({});

    await driver.put('img/abc.webp', body, 'image/webp');

    expect(sendMock).toHaveBeenCalledOnce();
    const command = sendMock.mock.calls[0][0];
    expect(command.name).toBe('PutObjectCommand');
    expect(command.input).toMatchObject({
      Bucket: 'justtally-media',
      Key: 'img/abc.webp',
      Body: body,
      ContentType: 'image/webp',
    });
  });

  it('remove() sends a DeleteObjectCommand for the given key', async () => {
    const driver = createR2Driver();
    sendMock.mockResolvedValueOnce({});

    await driver.remove('img/gone.webp');

    const command = sendMock.mock.calls[0][0];
    expect(command.name).toBe('DeleteObjectCommand');
    expect(command.input).toMatchObject({ Bucket: 'justtally-media', Key: 'img/gone.webp' });
  });

  it('exists() returns true when HeadObject succeeds', async () => {
    const driver = createR2Driver();
    sendMock.mockResolvedValueOnce({ ContentLength: 1234 });

    await expect(driver.exists('img/abc.webp')).resolves.toBe(true);
  });

  it('exists() returns false, not throw, when the object is missing', async () => {
    const driver = createR2Driver();
    sendMock.mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });

    await expect(driver.exists('img/missing.webp')).resolves.toBe(false);
  });

  it('exists() propagates errors that are not "not found"', async () => {
    const driver = createR2Driver();
    sendMock.mockRejectedValueOnce(new Error('network blip'));

    await expect(driver.exists('img/abc.webp')).rejects.toThrow('network blip');
  });

  it('presignPut() returns a time-limited URL from the presigner', async () => {
    const driver = createR2Driver();

    const url = await driver.presignPut('img/new.webp', 'image/webp');

    expect(url).toBe('https://presigned.example/put');
    expect(getSignedUrlMock).toHaveBeenCalledOnce();
    const [, command, options] = getSignedUrlMock.mock.calls[0];
    expect(command.input).toMatchObject({
      Bucket: 'justtally-media',
      Key: 'img/new.webp',
      ContentType: 'image/webp',
    });
    expect(options.expiresIn).toBe(300);
  });
});
