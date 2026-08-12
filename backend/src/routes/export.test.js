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

vi.mock('../db/database.js', () => ({
  default: { query: (...args) => queryMock(...args) },
}));
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { sub: 'user-1', role: 'user' };
    next();
  },
}));

const { default: exportRouter } = await import('./export.js');

const app = express();
app.use(express.json());
app.use('/api/export', exportRouter);

beforeEach(() => {
  handlers.length = 0;
  queryMock.mockClear();
  onQuery(/SELECT unit_preference FROM users/, () => ({ rows: [{ unit_preference: 'kg' }] }));
  onQuery(/SELECT \* FROM workouts WHERE user_id/, () => ({ rows: [] }));
  onQuery(/SELECT \* FROM routines WHERE user_id/, () => ({ rows: [] }));
});

describe('GET /api/export', () => {
  it('returns an empty, well-formed export for an account with no data', async () => {
    const res = await request(app).get('/api/export');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      format: 'justtally-export/v1',
      exportedAt: expect.any(Number),
      displayUnit: 'kg',
      exercises: [],
      routines: [],
      bodyWeights: [],
      sessions: [],
    });
  });

  it('sets a download-ready content-disposition header', async () => {
    const res = await request(app).get('/api/export');
    expect(res.headers['content-disposition']).toContain('just-tally-export.json');
  });

  it('carries the account unit preference into displayUnit', async () => {
    onQuery(/SELECT unit_preference FROM users/, () => ({ rows: [{ unit_preference: 'lb' }] }));
    const res = await request(app).get('/api/export');
    expect(res.body.displayUnit).toBe('lb');
  });

  it('excludes soft-deleted workouts and routines', async () => {
    // Both queries already filter `deleted_at IS NULL` in SQL; this asserts
    // the route doesn't re-fetch or override that with a broader query.
    const res = await request(app).get('/api/export');
    const workoutsCall = queryMock.mock.calls.find(([sql]) => /FROM workouts WHERE user_id/.test(sql));
    const routinesCall = queryMock.mock.calls.find(([sql]) => /FROM routines WHERE user_id/.test(sql));
    expect(workoutsCall[0]).toMatch(/deleted_at IS NULL/);
    expect(routinesCall[0]).toMatch(/deleted_at IS NULL/);
    expect(res.status).toBe(200);
  });

  it('includes sessions and the exercises they reference', async () => {
    onQuery(/SELECT \* FROM workouts WHERE user_id/, () => ({
      rows: [
        {
          id: 's1',
          date: 1000,
          title: 'Push A',
          started_at: null,
          duration_min: null,
          notes: null,
          entries: [{ exerciseId: 'ex-1', exerciseName: 'Bench Press', sets: [{ reps: 5, weight: 60 }] }],
          updated_at: 1000,
        },
      ],
    }));
    onQuery(/SELECT id, ref, name FROM exercises WHERE id = ANY/, (_sql, params) => ({
      rows: params[0].map((id) => ({ id, ref: 1, name: 'Bench Press' })),
    }));

    const res = await request(app).get('/api/export');
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].entries[0].exerciseId).toBe('ex-1');
    expect(res.body.exercises).toEqual([{ id: 'ex-1', ref: 1, name: 'Bench Press' }]);
  });

  it('is scoped to the authenticated user', async () => {
    await request(app).get('/api/export');
    const workoutsCall = queryMock.mock.calls.find(([sql]) => /FROM workouts WHERE user_id/.test(sql));
    expect(workoutsCall[1]).toEqual(['user-1']);
  });
});
