import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ENV_KEYS = [
  'MEDIA_DRIVER',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'MEDIA_PUBLIC_BASE_URL',
];
const originalEnv = {};

beforeEach(() => {
  for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

/**
 * These import `./index.js` fresh per test via `vi.resetModules()`, since its
 * driver set is decided once at module-load time from env vars — the whole
 * point under test.
 */
describe('storage/index — driver selection at load time', () => {
  it('defaults to local with no MEDIA_DRIVER and no R2 config, no throw', async () => {
    const { storage, driverFor } = await import('./index.js');
    expect(storage.name).toBe('local');
    expect(driverFor('r2')).toBeNull();
  });

  it('does not require R2_* vars just to boot with MEDIA_DRIVER=local', async () => {
    process.env.MEDIA_DRIVER = 'local';
    await expect(import('./index.js')).resolves.toBeDefined();
  });

  it('activates r2 when MEDIA_DRIVER=r2 and full config is present', async () => {
    process.env.MEDIA_DRIVER = 'r2';
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.justtally.org';

    const { storage, driverFor } = await import('./index.js');
    expect(storage.name).toBe('r2');
    expect(driverFor('local')).not.toBeNull(); // still resolvable for legacy rows
  });

  it('fails fast when MEDIA_DRIVER=r2 but R2 config is incomplete', async () => {
    process.env.MEDIA_DRIVER = 'r2';
    process.env.R2_ACCOUNT_ID = 'acct';
    // missing the rest

    await expect(import('./index.js')).rejects.toThrow(/R2_ACCESS_KEY_ID/);
  });

  it('keeps r2 resolvable for legacy rows when active driver rolls back to local', async () => {
    // Simulates: MEDIA_DRIVER flipped back to local after an R2 migration,
    // but R2 credentials are still configured so old r2 rows can still be
    // deleted through their own driver instead of silently no-op'ing.
    process.env.MEDIA_DRIVER = 'local';
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'bucket';
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.justtally.org';

    const { storage, driverFor } = await import('./index.js');
    expect(storage.name).toBe('local');
    expect(driverFor('r2')).not.toBeNull();
  });

  it('rejects an unknown MEDIA_DRIVER', async () => {
    process.env.MEDIA_DRIVER = 'dropbox';
    await expect(import('./index.js')).rejects.toThrow(/Unknown MEDIA_DRIVER/);
  });
});
