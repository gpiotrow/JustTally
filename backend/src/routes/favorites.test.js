import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Same shape-matched mock as the other route tests: handlers are consulted
 * newest-first so a test can override a default from beforeEach.
 */
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
  default: { query: (...args) => queryMock(...args) },
}));

// The authenticated user is whoever `currentUser` names at request time, so a
// single app instance can act as two different people within one test.
let currentUser = { sub: 'user-a', role: 'user' };
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { ...currentUser };
    next();
  },
  requireAdmin: (req, res, next) => next(),
}));

const { default: favoritesRouter } = await import('./favorites.js');

const app = express();
app.use(express.json());
app.use('/api/favorites', favoritesRouter);

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  currentUser = { sub: 'user-a', role: 'user' };
  onQuery(/SELECT id FROM exercises WHERE id = \$1/, () => ({ rows: [{ id: 'ex-1' }] }));
});

describe('GET /api/favorites', () => {
  it('returns only the calling user\'s ids, scoped by user_id', async () => {
    let scopedTo = null;
    onQuery(/SELECT exercise_id FROM favorites WHERE user_id = \$1/, (_sql, params) => {
      scopedTo = params[0];
      return { rows: [{ exercise_id: 'ex-1' }, { exercise_id: 'ex-2' }] };
    });

    const res = await request(app).get('/api/favorites');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseIds: ['ex-1', 'ex-2'] });
    expect(scopedTo).toBe('user-a');
  });

  it('never reads another user\'s favorites — the id comes from the token, not the request', async () => {
    const seenUserIds = [];
    onQuery(/SELECT exercise_id FROM favorites WHERE user_id = \$1/, (_sql, params) => {
      seenUserIds.push(params[0]);
      return { rows: params[0] === 'user-b' ? [{ exercise_id: 'secret-of-b' }] : [] };
    });

    await request(app).get('/api/favorites');
    currentUser = { sub: 'user-b', role: 'user' };
    const asB = await request(app).get('/api/favorites');

    expect(seenUserIds).toEqual(['user-a', 'user-b']);
    // A's request returned nothing; only B ever sees B's row.
    expect(asB.body.exerciseIds).toEqual(['secret-of-b']);
  });
});

describe('PUT /api/favorites/:exerciseId', () => {
  it('inserts scoped to the caller and ignores a repeat', async () => {
    let insertParams = null;
    let insertSql = null;
    onQuery(/INSERT INTO favorites/, (sql, params) => {
      insertSql = sql;
      insertParams = params;
      return { rows: [] };
    });

    const res = await request(app).put('/api/favorites/ex-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ favorite: true });
    expect(insertParams[0]).toBe('user-a');
    expect(insertParams[1]).toBe('ex-1');
    // Idempotency lives in the SQL, so a second PUT cannot duplicate the row
    // or reset created_at (which would silently reorder the favorites list).
    expect(insertSql).toMatch(/ON CONFLICT \(user_id, exercise_id\) DO NOTHING/);
  });

  it('is idempotent: a second PUT still reports success', async () => {
    onQuery(/INSERT INTO favorites/, () => ({ rows: [], rowCount: 0 }));

    const first = await request(app).put('/api/favorites/ex-1');
    const second = await request(app).put('/api/favorites/ex-1');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, favorite: true });
  });

  it('404s for an unknown exercise without writing anything', async () => {
    onQuery(/SELECT id FROM exercises WHERE id = \$1/, () => ({ rows: [] }));
    let inserted = false;
    onQuery(/INSERT INTO favorites/, () => {
      inserted = true;
      return { rows: [] };
    });

    const res = await request(app).put('/api/favorites/ghost');

    expect(res.status).toBe(404);
    expect(inserted).toBe(false);
  });
});

describe('DELETE /api/favorites/:exerciseId', () => {
  it('deletes only the caller\'s own row', async () => {
    let deleteParams = null;
    onQuery(/DELETE FROM favorites/, (_sql, params) => {
      deleteParams = params;
      return { rowCount: 1 };
    });

    const res = await request(app).delete('/api/favorites/ex-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ favorite: false });
    // Both halves of the composite key are bound: without the user_id term this
    // would clear the same favorite for every user who has it.
    expect(deleteParams).toEqual(['user-a', 'ex-1']);
  });

  it('succeeds when there was nothing to delete, so a retry is not an error', async () => {
    onQuery(/DELETE FROM favorites/, () => ({ rowCount: 0 }));

    const res = await request(app).delete('/api/favorites/ex-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, favorite: false });
  });

  it('cannot delete another user\'s favorite by guessing the exercise id', async () => {
    const deletes = [];
    onQuery(/DELETE FROM favorites/, (_sql, params) => {
      deletes.push(params);
      return { rowCount: 0 };
    });

    await request(app).delete('/api/favorites/ex-1');

    expect(deletes).toEqual([['user-a', 'ex-1']]);
    expect(deletes.some(([userId]) => userId !== 'user-a')).toBe(false);
  });
});
