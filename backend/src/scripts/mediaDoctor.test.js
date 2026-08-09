import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../db/database.js', () => ({ default: { query: (...args) => queryMock(...args), end: vi.fn() } }));

const localDriver = {
  name: 'local',
  exists: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
};
const r2Driver = {
  name: 'r2',
  exists: vi.fn(),
  put: vi.fn(),
};
vi.mock('../services/storage/index.js', () => ({
  driverFor: (name) => (name === 'local' ? localDriver : name === 'r2' ? r2Driver : null),
}));

const { report, prune, toR2 } = await import('./mediaDoctor.js');

let logs;
beforeEach(() => {
  queryMock.mockReset();
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((s) => logs.push(s));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.values(localDriver).forEach((fn) => typeof fn?.mockReset === 'function' && fn.mockReset());
  Object.values(r2Driver).forEach((fn) => typeof fn?.mockReset === 'function' && fn.mockReset());
  localDriver.name = 'local';
  r2Driver.name = 'r2';
});

const mediaRow = (overrides = {}) => ({
  id: 'm1',
  exercise_id: 'ex1',
  media_type: 'image',
  storage: 'local',
  object_key: 'img/m1.webp',
  thumb_key: 'img/m1.thumb.webp',
  url: null,
  thumbnail_url: null,
  ...overrides,
});

describe('report', () => {
  it('lists a row whose object no longer exists on disk', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow()] }); // media
    localDriver.exists.mockResolvedValue(false);
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'ex1', ref: 42, name: 'Bench Press' }] }); // exercises

    const missing = await report();

    expect(missing).toHaveLength(2); // object_key + thumb_key both missing
    expect(logs.some((l) => l.includes('42') && l.includes('Bench Press'))).toBe(true);
  });

  it('reports nothing when every object exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow()] });
    localDriver.exists.mockResolvedValue(true);
    queryMock.mockResolvedValueOnce({ rows: [] });

    const missing = await report();

    expect(missing).toHaveLength(0);
  });

  it('flags a row whose storage driver is not configured', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow({ storage: 'r2-not-configured' })] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const missing = await report();

    expect(missing).toHaveLength(1);
    expect(missing[0].reason).toMatch(/unknown_driver/);
  });

  it('recovers keys for legacy rows from the stored url', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [mediaRow({ object_key: null, thumb_key: null, url: '/uploads/legacy/old.jpg' })],
    });
    localDriver.exists.mockResolvedValue(false);
    queryMock.mockResolvedValueOnce({ rows: [] });

    const missing = await report();

    expect(missing).toHaveLength(1);
    expect(missing[0].key).toBe('legacy/old.jpg');
  });
});

describe('prune', () => {
  it('deletes exactly the rows report flagged, nothing else', async () => {
    localDriver.exists.mockResolvedValue(false);
    let deletedIds = null;
    queryMock
      .mockResolvedValueOnce({ rows: [mediaRow(), mediaRow({ id: 'm2' })] }) // report(): media
      .mockResolvedValueOnce({ rows: [] }) // report(): exercises
      .mockImplementationOnce(async (sql, params) => {
        deletedIds = params[0];
        return { rowCount: 2 };
      });

    await prune();

    expect(new Set(deletedIds)).toEqual(new Set(['m1', 'm2']));
  });

  it('does not touch the database when nothing is missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow()] });
    localDriver.exists.mockResolvedValue(true);

    await prune();

    // report() skips the exercises lookup too when nothing is missing —
    // just the one media SELECT, no DELETE.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe('toR2', () => {
  it('throws if R2 is not configured', async () => {
    const originalDriverFor = r2Driver.name;
    // Simulate "not configured" by having driverFor return null for r2 —
    // reuse the mocked module's behavior via a local override.
    const mod = await import('../services/storage/index.js');
    const spy = vi.spyOn(mod, 'driverFor').mockImplementation((name) => (name === 'r2' ? null : localDriver));

    await expect(toR2({ apply: false })).rejects.toThrow(/R2 is not configured/);

    spy.mockRestore();
    r2Driver.name = originalDriverFor;
  });

  it('dry run touches neither R2 nor the local filesystem nor the DB row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow()] });
    localDriver.exists.mockResolvedValue(true);
    localDriver.get.mockResolvedValue(Buffer.from('bytes'));

    await toR2({ apply: false });

    expect(r2Driver.put).not.toHaveBeenCalled();
    expect(localDriver.remove).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1); // only the initial SELECT
  });

  it('apply: uploads, verifies, updates the DB row, then removes the local copy — in that order', async () => {
    const order = [];
    localDriver.exists.mockResolvedValue(true);
    localDriver.get.mockResolvedValue(Buffer.from('bytes'));
    localDriver.remove.mockImplementation(async () => order.push('local-remove'));
    r2Driver.put.mockImplementation(async () => order.push('put'));
    r2Driver.exists.mockImplementation(async () => {
      order.push('verify');
      return true;
    });
    // A single dispatcher, not stacked "Once" handlers: the initial SELECT
    // and the later UPDATE both go through db.query, and the ordering under
    // test depends on exactly when the UPDATE fires relative to put/verify/remove.
    queryMock.mockImplementation(async (sql) => {
      if (/^SELECT \* FROM media WHERE storage/.test(sql)) return { rows: [mediaRow()] };
      if (/UPDATE media SET storage/.test(sql)) {
        order.push('db-update');
        return { rows: [] };
      }
      return { rows: [] };
    });

    await toR2({ apply: true });

    expect(order).toEqual(['put', 'put', 'verify', 'verify', 'db-update', 'local-remove', 'local-remove']);
  });

  it('never updates the DB or deletes the local file if the local object is missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow()] });
    localDriver.exists.mockResolvedValue(false);

    await toR2({ apply: true });

    expect(r2Driver.put).not.toHaveBeenCalled();
    expect(localDriver.remove).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1); // only the initial SELECT, no UPDATE
  });

  it('never deletes the local file if upload verification fails', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow()] });
    localDriver.exists.mockResolvedValue(true);
    localDriver.get.mockResolvedValue(Buffer.from('bytes'));
    r2Driver.put.mockResolvedValue(undefined);
    r2Driver.exists.mockResolvedValue(false); // verification fails

    await toR2({ apply: true });

    expect(localDriver.remove).not.toHaveBeenCalled();
    expect(queryMock).toHaveBeenCalledTimes(1); // no UPDATE ran
  });

  it('skips legacy rows with no object_key instead of guessing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [mediaRow({ object_key: null, thumb_key: null })] });

    await toR2({ apply: true });

    expect(localDriver.get).not.toHaveBeenCalled();
    expect(r2Driver.put).not.toHaveBeenCalled();
  });
});
