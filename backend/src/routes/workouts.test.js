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

const { default: workoutsRouter } = await import('./workouts.js');

const app = express();
app.use(express.json());
app.use('/api/workouts', workoutsRouter);

const validEntry = {
  exerciseId: 'ex-1',
  exerciseName: 'Bench Press',
  sets: [{ reps: 10, weight: 60 }],
};

/** Capture the entries value handed to the INSERT, as the route passes it. */
function captureInsertedEntries() {
  const captured = {};
  onQuery(/INSERT INTO workouts/, (sql, params) => {
    captured.sql = sql;
    captured.entries = params[6];
    return { rows: [] };
  });
  return captured;
}

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  onQuery(/BEGIN|COMMIT|ROLLBACK/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM workouts WHERE id = \$1/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM workouts WHERE user_id/, () => ({ rows: [] }));
});

describe('reading workouts (entries is jsonb)', () => {
  it('returns the array pg already parsed, without re-parsing it', async () => {
    // The bug this guards: JSON.parse() on a jsonb value stringifies the array
    // to '' first and throws, so every read would fail.
    onQuery(/SELECT \* FROM workouts WHERE user_id/, () => ({
      rows: [
        {
          id: 'w1',
          date: 5,
          entries: [validEntry],
          updated_at: 5,
          deleted_at: null,
        },
      ],
    }));

    const res = await request(app).post('/api/workouts/sync').send({ lastSyncedAt: 0 });

    expect(res.status).toBe(200);
    expect(res.body.workouts[0].entries).toEqual([validEntry]);
  });

  it('treats a null entries column as an empty list rather than throwing', async () => {
    onQuery(/SELECT \* FROM workouts WHERE user_id/, () => ({
      rows: [{ id: 'w1', date: 5, entries: null, updated_at: 5, deleted_at: null }],
    }));

    const res = await request(app).post('/api/workouts/sync').send({ lastSyncedAt: 0 });

    expect(res.status).toBe(200);
    expect(res.body.workouts[0].entries).toEqual([]);
  });

  it('separates live workouts from tombstones', async () => {
    onQuery(/SELECT \* FROM workouts WHERE user_id/, () => ({
      rows: [
        { id: 'live', date: 1, entries: [], updated_at: 5, deleted_at: null },
        { id: 'gone', date: 1, entries: [], updated_at: 6, deleted_at: 6 },
      ],
    }));

    const res = await request(app).post('/api/workouts/sync').send({ lastSyncedAt: 0 });

    expect(res.body.workouts.map((w) => w.id)).toEqual(['live']);
    expect(res.body.deletedIds).toEqual(['gone']);
  });
});

describe('writing workouts', () => {
  it('sends entries as a JSON string with an explicit ::jsonb cast', async () => {
    // Handed the array itself, pg would encode a Postgres array literal instead
    // of JSON — hence stringify on the way out and a cast on the way in.
    const captured = captureInsertedEntries();

    await request(app)
      .post('/api/workouts/sync')
      .send({ upserts: [{ id: 'w1', updatedAt: 10, date: 10, entries: [validEntry] }] });

    expect(typeof captured.entries).toBe('string');
    expect(JSON.parse(captured.entries)).toEqual([validEntry]);
    expect(captured.sql).toMatch(/\$7::jsonb/);
  });

  it('persists exerciseRef alongside the id', async () => {
    const captured = captureInsertedEntries();
    const entry = { ...validEntry, exerciseRef: 42 };

    await request(app)
      .post('/api/workouts/sync')
      .send({ upserts: [{ id: 'w1', updatedAt: 10, date: 10, entries: [entry] }] });

    expect(JSON.parse(captured.entries)[0].exerciseRef).toBe(42);
  });

  it('accepts entries without exerciseRef, so older clients keep syncing', async () => {
    const captured = captureInsertedEntries();

    await request(app)
      .post('/api/workouts/sync')
      .send({ upserts: [{ id: 'w1', updatedAt: 10, date: 10, entries: [validEntry] }] });

    expect(captured.entries).toBeDefined();
  });

  it.each([
    ['a non-integer', 1.5],
    ['zero', 0],
    ['a negative number', -3],
    ['a string', '42'],
  ])('rejects %s as exerciseRef rather than storing it', async (_label, ref) => {
    const captured = captureInsertedEntries();

    await request(app)
      .post('/api/workouts/sync')
      .send({
        upserts: [
          { id: 'w1', updatedAt: 10, date: 10, entries: [{ ...validEntry, exerciseRef: ref }] },
        ],
      });

    // A bad ref would mislead the re-link script, so the session is skipped.
    expect(captured.entries).toBeUndefined();
  });

  it('persists the set execution fields', async () => {
    const captured = captureInsertedEntries();
    const entry = {
      ...validEntry,
      sets: [
        { reps: 10, weight: 40, type: 'warmup', done: true, completedAt: 1786400000000 },
        { reps: 8, weight: 80, type: 'working', done: true, rpe: 8.5 },
        { reps: 6, weight: 62.5, type: 'drop', done: false },
      ],
    };

    await request(app)
      .post('/api/workouts/sync')
      .send({ upserts: [{ id: 'w1', updatedAt: 10, date: 10, entries: [entry] }] });

    expect(JSON.parse(captured.entries)[0].sets).toEqual(entry.sets);
  });

  it('persists groupId and plannedExerciseId', async () => {
    const captured = captureInsertedEntries();
    const entry = { ...validEntry, groupId: 'g1', plannedExerciseId: 'planned-1' };

    await request(app)
      .post('/api/workouts/sync')
      .send({ upserts: [{ id: 'w1', updatedAt: 10, date: 10, entries: [entry] }] });

    const stored = JSON.parse(captured.entries)[0];
    expect(stored.groupId).toBe('g1');
    expect(stored.plannedExerciseId).toBe('planned-1');
  });

  it.each([
    ['a non-string groupId', { groupId: 42 }],
    ['a non-string plannedExerciseId', { plannedExerciseId: 42 }],
  ])('rejects %s rather than storing it', async (_label, patch) => {
    const captured = captureInsertedEntries();

    await request(app)
      .post('/api/workouts/sync')
      .send({
        upserts: [{ id: 'w1', updatedAt: 10, date: 10, entries: [{ ...validEntry, ...patch }] }],
      });

    expect(captured.entries).toBeUndefined();
  });

  it('accepts sets with only reps, so older clients keep syncing', async () => {
    const captured = captureInsertedEntries();

    await request(app)
      .post('/api/workouts/sync')
      .send({
        upserts: [
          { id: 'w1', updatedAt: 10, date: 10, entries: [{ ...validEntry, sets: [{ reps: 5 }] }] },
        ],
      });

    expect(captured.entries).toBeDefined();
  });

  it.each([
    ['an unknown set type', { reps: 5, type: 'warmupp' }],
    ['a non-string set type', { reps: 5, type: 1 }],
    ['a non-boolean done', { reps: 5, done: 'yes' }],
    ['a non-numeric weight', { reps: 5, weight: '60' }],
    ['a non-numeric completedAt', { reps: 5, completedAt: 'now' }],
    ['a zero completedAt', { reps: 5, completedAt: 0 }],
    ['an rpe below the scale', { reps: 5, rpe: 4.5 }],
    ['an rpe above the scale', { reps: 5, rpe: 10.5 }],
    ['an rpe off the half-step grid', { reps: 5, rpe: 8.3 }],
    ['a non-numeric rpe', { reps: 5, rpe: 'hard' }],
  ])('rejects %s rather than storing it', async (_label, set) => {
    const captured = captureInsertedEntries();

    await request(app)
      .post('/api/workouts/sync')
      .send({
        upserts: [
          { id: 'w1', updatedAt: 10, date: 10, entries: [{ ...validEntry, sets: [set] }] },
        ],
      });

    // Malformed values would skew the statistics these fields exist to feed,
    // and would do it silently — so the session is skipped instead.
    expect(captured.entries).toBeUndefined();
  });

  it('ignores a stale write whose updatedAt predates the stored row', async () => {
    onQuery(/SELECT \* FROM workouts WHERE id = \$1/, () => ({
      rows: [{ id: 'w1', updated_at: 100, entries: [] }],
    }));
    const captured = captureInsertedEntries();
    onQuery(/UPDATE workouts/, () => {
      throw new Error('stale write must not reach the database');
    });

    const res = await request(app)
      .post('/api/workouts/sync')
      .send({ upserts: [{ id: 'w1', updatedAt: 50, date: 50, entries: [validEntry] }] });

    expect(res.status).toBe(200);
    expect(captured.entries).toBeUndefined();
  });

  it('rejects a non-array upserts payload', async () => {
    const res = await request(app).post('/api/workouts/sync').send({ upserts: 'nope' });
    expect(res.status).toBe(400);
  });
});
