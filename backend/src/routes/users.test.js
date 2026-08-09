import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const queryMock = vi.fn();
vi.mock('../db/database.js', () => ({ default: { query: (...args) => queryMock(...args) } }));

// requireAuth's own DB-lookup behavior is covered in middleware/auth.test.js;
// here we only need a fixed identity so the route logic can be tested in isolation.
let currentUser = { sub: 'admin-1', role: 'admin' };
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = currentUser;
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  },
}));

const { default: usersRouter } = await import('./users.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
}

const app = buildApp();

beforeEach(() => {
  queryMock.mockReset();
  currentUser = { sub: 'admin-1', role: 'admin' };
});

describe('POST /api/users', () => {
  it('rejects a password shorter than the minimum', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'X', email: 'x@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid role', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'X', email: 'x@example.com', password: 'longenough', role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  it('creates a user with defaults to role "user"', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // no existing user
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', name: 'X', email: 'x@example.com', role: 'user', created_at: 1, disabled_at: null }],
    });

    const res = await request(app)
      .post('/api/users')
      .send({ name: 'X', email: 'x@example.com', password: 'longenough' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
  });
});

describe('DELETE /api/users/:id (soft-delete)', () => {
  it('refuses to let an admin disable their own account', async () => {
    const res = await request(app).delete('/api/users/admin-1');
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('disables the target user and bumps their token_version', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'u2' }] });
    const res = await request(app).delete('/api/users/u2');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/disabled_at/);
    expect(sql).toMatch(/token_version = token_version \+ 1/);
    expect(params).toContain('u2');
  });

  it('404s when the user does not exist or is already disabled', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/users/ghost');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/users/:id/enable', () => {
  it('clears disabled_at and returns the reactivated user', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u2', name: 'X', email: 'x@example.com', role: 'user', created_at: 1, disabled_at: null }],
    });
    const res = await request(app).post('/api/users/u2/enable');

    expect(res.status).toBe(200);
    expect(res.body.user.disabledAt).toBeNull();
  });

  it('404s for an unknown user', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/users/ghost/enable');
    expect(res.status).toBe(404);
  });
});

describe('admin gating', () => {
  it('rejects a non-admin caller before touching the DB', async () => {
    currentUser = { sub: 'user-1', role: 'user' };
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
