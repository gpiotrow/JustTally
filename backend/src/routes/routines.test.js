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
  requireAdmin: (req, res, next) => next(),
}));

const { default: routinesRouter } = await import('./routines.js');

const app = express();
app.use(express.json());
app.use('/api/routines', routinesRouter);

const validExercise = {
  exerciseId: 'ex-1',
  exerciseName: 'Bench Press',
  alternatives: [],
  targetSets: 3,
};

const validRoutine = {
  id: 'r1',
  name: 'Push Day',
  weeks: [
    { id: 'w1', days: [{ id: 'd1', name: 'Day A', exercises: [validExercise] }] },
  ],
};

/** Capture the weeks value handed to the INSERT, as the route passes it. */
function captureInsertedWeeks() {
  const captured = {};
  onQuery(/INSERT INTO routines/, (sql, params) => {
    captured.sql = sql;
    captured.weeks = params[4];
    return { rows: [] };
  });
  return captured;
}

/** Every exercise id referenced by the payload counts as existing, unless told otherwise. */
function allExercisesExist() {
  onQuery(/SELECT id FROM exercises WHERE id = ANY/, (_sql, params) => ({
    rows: params[0].map((id) => ({ id })),
  }));
}

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  onQuery(/BEGIN|COMMIT|ROLLBACK/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM routines WHERE id = \$1/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM routines WHERE user_id/, () => ({ rows: [] }));
});

describe('POST /api/routines/sync', () => {
  it('persists a valid routine whose exercises all exist', async () => {
    allExercisesExist();
    const captured = captureInsertedWeeks();

    const res = await request(app)
      .post('/api/routines/sync')
      .send({ upserts: [{ ...validRoutine, updatedAt: 10 }] });

    expect(res.status).toBe(200);
    expect(JSON.parse(captured.weeks)).toEqual(validRoutine.weeks);
  });

  it('rejects a routine whose exercise does not exist, rather than storing it', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = ANY/, () => ({ rows: [] })); // nothing exists
    const captured = captureInsertedWeeks();

    await request(app)
      .post('/api/routines/sync')
      .send({ upserts: [{ ...validRoutine, updatedAt: 10 }] });

    // A dangling reference would fail to instantiate into a workout later —
    // caught here instead of discovered then.
    expect(captured.weeks).toBeUndefined();
  });

  it('rejects a routine whose alternative exercise does not exist', async () => {
    // Only the primary exercise exists; the alternative does not.
    onQuery(/SELECT id FROM exercises WHERE id = ANY/, () => ({ rows: [{ id: 'ex-1' }] }));
    const captured = captureInsertedWeeks();
    const routine = {
      ...validRoutine,
      weeks: [
        {
          id: 'w1',
          days: [
            {
              id: 'd1',
              name: 'Day A',
              exercises: [
                {
                  ...validExercise,
                  alternatives: [{ exerciseId: 'ex-missing', exerciseName: 'Ghost' }],
                },
              ],
            },
          ],
        },
      ],
    };

    await request(app)
      .post('/api/routines/sync')
      .send({ upserts: [{ ...routine, updatedAt: 10 }] });

    expect(captured.weeks).toBeUndefined();
  });

  it.each([
    ['a non-string name', { name: 42 }],
    ['a non-array weeks', { weeks: 'nope' }],
    ['a week with a non-array days', { weeks: [{ id: 'w1', days: 'nope' }] }],
    [
      'a day with a non-array exercises',
      { weeks: [{ id: 'w1', days: [{ id: 'd1', name: 'A', exercises: 'nope' }] }] },
    ],
    [
      'an exercise with a zero targetSets',
      {
        weeks: [
          {
            id: 'w1',
            days: [{ id: 'd1', name: 'A', exercises: [{ ...validExercise, targetSets: 0 }] }],
          },
        ],
      },
    ],
    [
      'an exercise with a non-array alternatives',
      {
        weeks: [
          {
            id: 'w1',
            days: [
              { id: 'd1', name: 'A', exercises: [{ ...validExercise, alternatives: 'nope' }] },
            ],
          },
        ],
      },
    ],
    [
      'an exercise with an out-of-range targetRpe',
      {
        weeks: [
          {
            id: 'w1',
            days: [{ id: 'd1', name: 'A', exercises: [{ ...validExercise, targetRpe: 11 }] }],
          },
        ],
      },
    ],
  ])('rejects %s rather than storing it', async (_label, patch) => {
    allExercisesExist();
    const captured = captureInsertedWeeks();

    await request(app)
      .post('/api/routines/sync')
      .send({ upserts: [{ ...validRoutine, ...patch, updatedAt: 10 }] });

    expect(captured.weeks).toBeUndefined();
  });

  it('ignores a stale write whose updatedAt predates the stored row', async () => {
    allExercisesExist();
    onQuery(/SELECT \* FROM routines WHERE id = \$1/, () => ({
      rows: [{ id: 'r1', updated_at: 100, weeks: [] }],
    }));
    const captured = captureInsertedWeeks();
    onQuery(/UPDATE routines/, () => {
      throw new Error('stale write must not reach the database');
    });

    const res = await request(app)
      .post('/api/routines/sync')
      .send({ upserts: [{ ...validRoutine, updatedAt: 50 }] });

    expect(res.status).toBe(200);
    expect(captured.weeks).toBeUndefined();
  });

  it('deletes a routine when the tombstone is newer than the stored row', async () => {
    onQuery(/SELECT \* FROM routines WHERE id = \$1/, () => ({
      rows: [{ id: 'r1', updated_at: 10 }],
    }));
    const deleteCalls = [];
    onQuery(/UPDATE routines SET deleted_at/, (sql, params) => {
      deleteCalls.push(params);
      return { rows: [] };
    });

    const res = await request(app)
      .post('/api/routines/sync')
      .send({ deletes: [{ id: 'r1', deletedAt: 20 }] });

    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
  });

  it('ignores a delete tombstone older than the stored row', async () => {
    onQuery(/SELECT \* FROM routines WHERE id = \$1/, () => ({
      rows: [{ id: 'r1', updated_at: 100 }],
    }));
    onQuery(/UPDATE routines SET deleted_at/, () => {
      throw new Error('stale delete must not reach the database');
    });

    const res = await request(app)
      .post('/api/routines/sync')
      .send({ deletes: [{ id: 'r1', deletedAt: 20 }] });

    expect(res.status).toBe(200);
  });

  it('rejects a non-array upserts payload', async () => {
    const res = await request(app).post('/api/routines/sync').send({ upserts: 'nope' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-array deletes payload', async () => {
    const res = await request(app).post('/api/routines/sync').send({ deletes: 'nope' });
    expect(res.status).toBe(400);
  });

  it('returns routines updated since lastSyncedAt, split into upserts and deletedIds', async () => {
    onQuery(/SELECT \* FROM routines WHERE user_id/, () => ({
      rows: [
        { id: 'r1', name: 'Push', description: null, weeks: [], updated_at: 30, deleted_at: null },
        { id: 'r2', name: 'Pull', weeks: [], updated_at: 40, deleted_at: 40 },
      ],
    }));

    const res = await request(app)
      .post('/api/routines/sync')
      .send({ lastSyncedAt: 10 });

    expect(res.status).toBe(200);
    expect(res.body.routines).toEqual([
      { id: 'r1', name: 'Push', description: undefined, weeks: [], updatedAt: 30 },
    ]);
    expect(res.body.deletedIds).toEqual(['r2']);
  });
});
