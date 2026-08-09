import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Shape-matched query mock, newest handler first — as in the route tests. */
const handlers = [];
const queryMock = vi.fn(async (sql, params) => {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const [pattern, respond] = handlers[i];
    if (pattern.test(sql)) return respond(sql, params);
  }
  throw new Error(`No mock handler for query: ${sql.slice(0, 120)}`);
});
function onQuery(pattern, respond) {
  handlers.push([pattern, respond]);
}

vi.mock('../db/database.js', () => ({
  default: { query: (...args) => queryMock(...args), end: vi.fn() },
}));

const deleteMediaFiles = vi.fn(async () => {});
vi.mock('../services/mediaService.js', () => ({
  deleteMediaFiles: (...args) => deleteMediaFiles(...args),
}));

const { resetCatalog } = await import('./resetCatalog.js');

/** Register the two usage queries with a per-exercise workout count. */
function mockUsage(workoutsById, aggregate = { workouts: 0, users: 0 }) {
  onQuery(/FROM unnest\(\$1::text\[\]\) AS x\(id\)/, (_sql, [ids]) => ({
    rows: ids.map((id) => ({
      exercise_id: id,
      workouts: workoutsById[id] ?? 0,
      users: workoutsById[id] ? 1 : 0,
    })),
  }));
  onQuery(/COUNT\(DISTINCT w\.id\)::int/, () => ({ rows: [aggregate] }));
}

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  deleteMediaFiles.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  onQuery(/SELECT id, ref, name FROM exercises/, () => ({
    rows: [
      { id: 'ex-free', ref: 1, name: 'Unbenutzt' },
      { id: 'ex-used', ref: 2, name: 'In Trainings' },
    ],
  }));
  onQuery(/SELECT \* FROM media WHERE exercise_id = ANY/, () => ({
    rows: [
      { id: 'm1', exercise_id: 'ex-free', storage: 'local', object_key: 'img/a.webp' },
      { id: 'm2', exercise_id: 'ex-used', storage: 'r2', object_key: 'img/b.webp' },
    ],
  }));
  onQuery(/COUNT\(\*\)::int AS n FROM favorites/, () => ({ rows: [{ n: 3 }] }));
});

describe('dry run', () => {
  it('writes nothing at all', async () => {
    mockUsage({ 'ex-used': 2 }, { workouts: 2, users: 1 });

    const result = await resetCatalog();

    expect(result).toMatchObject({ deleted: 0, archived: 0, wouldDelete: 1, wouldArchive: 1 });
    const wrote = queryMock.mock.calls.some(([sql]) => /DELETE FROM|UPDATE /.test(sql));
    expect(wrote).toBe(false);
    expect(deleteMediaFiles).not.toHaveBeenCalled();
  });

  it('reports the same split the real run would apply', async () => {
    mockUsage({ 'ex-used': 5 }, { workouts: 5, users: 3 });

    const result = await resetCatalog({ apply: false });

    expect(result.wouldDelete).toBe(1); // ex-free
    expect(result.wouldArchive).toBe(1); // ex-used, protected by I3
  });
});

describe('--apply without --with-workouts — invariant I3', () => {
  it('archives referenced exercises and deletes only the rest', async () => {
    mockUsage({ 'ex-used': 2 }, { workouts: 2, users: 1 });
    let archivedIds = null;
    let deletedIds = null;
    onQuery(/UPDATE exercises SET archived_at/, (_sql, params) => {
      archivedIds = params[1];
      return { rowCount: 1 };
    });
    onQuery(/DELETE FROM exercises/, (_sql, [ids]) => {
      deletedIds = ids;
      return { rowCount: ids.length };
    });

    const result = await resetCatalog({ apply: true });

    expect(archivedIds).toEqual(['ex-used']);
    expect(deletedIds).toEqual(['ex-free']);
    expect(result).toMatchObject({ deleted: 1, archived: 1 });
  });

  it('leaves the media of an archived exercise alone', async () => {
    mockUsage({ 'ex-used': 2 }, { workouts: 2, users: 1 });
    onQuery(/UPDATE exercises SET archived_at/, () => ({ rowCount: 1 }));
    onQuery(/DELETE FROM exercises/, (_sql, [ids]) => ({ rowCount: ids.length }));

    const result = await resetCatalog({ apply: true });

    // Only ex-free's media may go; ex-used survives, so its objects must too.
    expect(deleteMediaFiles).toHaveBeenCalledTimes(1);
    expect(deleteMediaFiles.mock.calls[0][0]).toMatchObject({ id: 'm1', exercise_id: 'ex-free' });
    expect(result.mediaRemoved).toBe(1);
  });

  it('never tombstones a workout unless asked to', async () => {
    mockUsage({ 'ex-used': 2 }, { workouts: 2, users: 1 });
    onQuery(/UPDATE exercises SET archived_at/, () => ({ rowCount: 1 }));
    onQuery(/DELETE FROM exercises/, (_sql, [ids]) => ({ rowCount: ids.length }));

    await resetCatalog({ apply: true });

    const touchedWorkouts = queryMock.mock.calls.some(([sql]) => /UPDATE workouts/.test(sql));
    expect(touchedWorkouts).toBe(false);
  });
});

describe('--apply --with-workouts', () => {
  it('tombstones the workouts, then deletes every exercise', async () => {
    mockUsage({ 'ex-used': 2 }, { workouts: 2, users: 1 });
    let workoutSql = null;
    onQuery(/UPDATE workouts/, (sql) => {
      workoutSql = sql;
      return { rowCount: 2 };
    });
    let deletedIds = null;
    onQuery(/DELETE FROM exercises/, (_sql, [ids]) => {
      deletedIds = ids;
      return { rowCount: ids.length };
    });

    const result = await resetCatalog({ apply: true, withWorkouts: true });

    // Tombstone, not DELETE: a hard delete would leave clients holding local
    // copies that the next sync would push straight back.
    expect(workoutSql).toMatch(/SET deleted_at = \$2/);
    expect(queryMock.mock.calls.some(([sql]) => /DELETE FROM workouts/.test(sql))).toBe(false);

    expect(deletedIds).toEqual(['ex-free', 'ex-used']);
    expect(result).toMatchObject({ deleted: 2, archived: 0, workoutsTombstoned: 2 });
  });

  it('removes the media of every exercise, each through its own driver', async () => {
    mockUsage({ 'ex-used': 2 }, { workouts: 2, users: 1 });
    onQuery(/UPDATE workouts/, () => ({ rowCount: 2 }));
    onQuery(/DELETE FROM exercises/, (_sql, [ids]) => ({ rowCount: ids.length }));

    const result = await resetCatalog({ apply: true, withWorkouts: true });

    expect(result.mediaRemoved).toBe(2);
    // deleteMediaFiles routes each row through the driver named on the row, so
    // an r2-backed row is not deleted via whatever driver happens to be active.
    const storages = deleteMediaFiles.mock.calls.map(([m]) => m.storage);
    expect(storages).toEqual(['local', 'r2']);
  });

  it('deletes objects before rows, so nothing is orphaned invisibly in storage', async () => {
    mockUsage({}, { workouts: 0, users: 0 });
    onQuery(/UPDATE workouts/, () => ({ rowCount: 0 }));
    const order = [];
    deleteMediaFiles.mockImplementation(async () => {
      order.push('media');
    });
    onQuery(/DELETE FROM exercises/, (_sql, [ids]) => {
      order.push('rows');
      return { rowCount: ids.length };
    });

    await resetCatalog({ apply: true, withWorkouts: true });

    expect(order[order.length - 1]).toBe('rows');
    expect(order.filter((o) => o === 'media').length).toBe(2);
  });
});

describe('empty catalog', () => {
  it('does nothing and reports nothing to do', async () => {
    onQuery(/SELECT id, ref, name FROM exercises/, () => ({ rows: [] }));

    const result = await resetCatalog({ apply: true, withWorkouts: true });

    expect(result).toMatchObject({ deleted: 0, archived: 0 });
    expect(deleteMediaFiles).not.toHaveBeenCalled();
    const wrote = queryMock.mock.calls.some(([sql]) => /DELETE|UPDATE/.test(sql));
    expect(wrote).toBe(false);
  });
});
