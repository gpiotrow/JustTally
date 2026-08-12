import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const handlers = [];
const queryMock = vi.fn(async (sql, params) => {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const [pattern, respond] = handlers[i];
    if (pattern.test(sql)) return respond(sql, params);
  }
  return { rows: [] };
});
function onQuery(pattern, respond) {
  handlers.push([pattern, respond]);
}

const client = {
  query: (...args) => queryMock(...args),
  release: vi.fn(),
};
vi.mock('../db/database.js', () => ({
  default: {
    query: (...args) => queryMock(...args),
    connect: async () => client,
  },
}));
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { sub: 'user-1', role: 'user' };
    next();
  },
}));

const { default: bodyWeightsRouter } = await import('./bodyWeights.js');

const app = express();
app.use(express.json());
app.use('/api/body-weights', bodyWeightsRouter);

const validEntry = { id: 'bw1', date: 1_700_000_000_000, kg: 82.4, updatedAt: 10 };

/** Capture the values handed to the INSERT, as the route passes them. */
function captureInsert() {
  const captured = {};
  onQuery(/INSERT INTO body_weights/, (sql, params) => {
    captured.sql = sql;
    captured.params = params;
    return { rows: [] };
  });
  return captured;
}

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  onQuery(/BEGIN|COMMIT|ROLLBACK/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM body_weights WHERE id = \$1/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM body_weights WHERE user_id/, () => ({ rows: [] }));
});

describe('POST /api/body-weights/sync', () => {
  it('persists a valid entry', async () => {
    const captured = captureInsert();
    const res = await request(app)
      .post('/api/body-weights/sync')
      .send({ upserts: [validEntry] });

    expect(res.status).toBe(200);
    expect(captured.params).toEqual(['bw1', 'user-1', validEntry.date, 82.4, expect.any(Number), 10]);
  });

  it.each([
    ['a non-string id', { ...validEntry, id: 42 }],
    ['a missing date', { ...validEntry, date: undefined }],
    ['a zero date', { ...validEntry, date: 0 }],
    ['a non-number kg', { ...validEntry, kg: '82.4' }],
    ['a zero kg', { ...validEntry, kg: 0 }],
    ['a negative kg', { ...validEntry, kg: -5 }],
  ])('rejects %s, storing nothing', async (_label, entry) => {
    const captured = captureInsert();
    await request(app)
      .post('/api/body-weights/sync')
      .send({ upserts: [entry] });
    expect(captured.params).toBeUndefined();
  });

  it('ignores a stale write older than what is already stored', async () => {
    onQuery(/SELECT \* FROM body_weights WHERE id = \$1/, () => ({
      rows: [{ id: 'bw1', user_id: 'user-1', date: 1, kg: 80, updated_at: 999 }],
    }));
    const res = await request(app)
      .post('/api/body-weights/sync')
      .send({ upserts: [{ ...validEntry, updatedAt: 5 }] });
    expect(res.status).toBe(200);
    // No UPDATE/INSERT beyond the lookups — the stale write is silently ignored.
    const writeCalls = queryMock.mock.calls.filter(([sql]) => /UPDATE|INSERT/.test(sql));
    expect(writeCalls).toEqual([]);
  });

  it('deletes an existing entry via tombstone', async () => {
    onQuery(/SELECT \* FROM body_weights WHERE id = \$1/, () => ({
      rows: [{ id: 'bw1', user_id: 'user-1', date: 1, kg: 80, updated_at: 5 }],
    }));
    const updateCalls = [];
    onQuery(/UPDATE body_weights SET deleted_at/, (sql, params) => {
      updateCalls.push(params);
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/body-weights/sync')
      .send({ deletes: [{ id: 'bw1', deletedAt: 20 }] });

    expect(res.status).toBe(200);
    expect(updateCalls).toEqual([[20, 20, 'bw1', 'user-1']]);
  });

  it('is scoped to the authenticated user', async () => {
    onQuery(/SELECT \* FROM body_weights WHERE user_id/, (_sql, params) => {
      expect(params[0]).toBe('user-1');
      return { rows: [] };
    });
    await request(app).post('/api/body-weights/sync').send({});
  });

  it('returns changed rows since lastSyncedAt, split into upserts and deletes', async () => {
    onQuery(/SELECT \* FROM body_weights WHERE user_id/, () => ({
      rows: [
        { id: 'bw1', date: 1, kg: 80, updated_at: 50, deleted_at: null },
        { id: 'bw2', date: 2, kg: 81, updated_at: 60, deleted_at: 60 },
      ],
    }));
    const res = await request(app).post('/api/body-weights/sync').send({ lastSyncedAt: 10 });
    expect(res.body.bodyWeights).toEqual([{ id: 'bw1', date: 1, kg: 80, updatedAt: 50 }]);
    expect(res.body.deletedIds).toEqual(['bw2']);
  });
});
