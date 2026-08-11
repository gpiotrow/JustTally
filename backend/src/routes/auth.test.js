import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

const queryMock = vi.fn();
vi.mock('../db/database.js', () => ({ default: { query: (...args) => queryMock(...args) } }));

const { default: authRouter } = await import('./auth.js');
const { signToken } = await import('../middleware/auth.js');

const AUTHED_ROW = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  role: 'user',
  disabled_at: null,
  token_version: 0,
};
const authHeader = `Bearer ${signToken(AUTHED_ROW)}`;

/** requireAuth re-reads the user on every request; that lookup comes first. */
function mockAuthenticatedUser(row = AUTHED_ROW) {
  queryMock.mockResolvedValueOnce({ rows: [row] });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const app = buildApp();

beforeEach(() => {
  queryMock.mockReset();
  process.env.ALLOW_REGISTRATION = 'open';
});

describe('POST /api/auth/register', () => {
  it('is disabled by default (403) when ALLOW_REGISTRATION is off', async () => {
    process.env.ALLOW_REGISTRATION = 'off';
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'x@example.com', password: 'longenough' });

    expect(res.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than the minimum', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'x@example.com', password: 'short' });

    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'dup@example.com', password: 'longenough' });

    expect(res.status).toBe(409);
  });

  it('creates a user and returns a token when allowed', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // no existing user
    queryMock.mockResolvedValueOnce({ rows: [] }); // insert

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'new@example.com', password: 'longenough' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'new@example.com', role: 'user' });
  });
});

describe('POST /api/auth/login', () => {
  it('rejects missing credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown email without leaking whether it exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'whatever1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('rejects a disabled account even with the correct password', async () => {
    const hash = bcrypt.hashSync('correcthorse', 10);
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'disabled@example.com', password_hash: hash, disabled_at: 999, role: 'user' }],
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'disabled@example.com', password: 'correcthorse' });

    expect(res.status).toBe(401);
  });

  it('logs in with correct credentials', async () => {
    const hash = bcrypt.hashSync('correcthorse', 10);
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'u1',
          name: 'Ada',
          email: 'ada@example.com',
          password_hash: hash,
          role: 'user',
          disabled_at: null,
          token_version: 0,
        },
      ],
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'correcthorse' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ id: 'u1', email: 'ada@example.com' });
  });

  it('locks the account out after 5 failed attempts, independent of password correctness', async () => {
    const email = 'bruteforced@example.com';
    const hash = bcrypt.hashSync('realpassword', 10);
    const row = { id: 'u2', email, password_hash: hash, role: 'user', disabled_at: null, token_version: 0 };

    for (let i = 0; i < 5; i++) {
      queryMock.mockResolvedValueOnce({ rows: [row] });
      const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong' });
      expect(res.status).toBe(401);
    }

    // 6th attempt, even with the correct password, must be locked out.
    const res = await request(app).post('/api/auth/login').send({ email, password: 'realpassword' });
    expect(res.status).toBe(429);
  });
});

describe('GET /api/auth/me', () => {
  it('defaults an account created before the preference columns existed', async () => {
    // Rows written before the migration have no unit_preference/sex at all;
    // the client must still receive a usable identity.
    mockAuthenticatedUser();
    queryMock.mockResolvedValueOnce({ rows: [AUTHED_ROW] });

    const res = await request(app).get('/api/auth/me').set('Authorization', authHeader);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'u1', unitPreference: 'kg', sex: null });
  });

  it('returns the stored preferences', async () => {
    const row = { ...AUTHED_ROW, unit_preference: 'lb', sex: 'female' };
    mockAuthenticatedUser(row);
    queryMock.mockResolvedValueOnce({ rows: [row] });

    const res = await request(app).get('/api/auth/me').set('Authorization', authHeader);

    expect(res.body.user).toMatchObject({ unitPreference: 'lb', sex: 'female' });
  });
});

describe('PATCH /api/auth/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).patch('/api/auth/me').send({ unitPreference: 'lb' });
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('updates the unit preference', async () => {
    mockAuthenticatedUser();
    queryMock.mockResolvedValueOnce({ rows: [{ ...AUTHED_ROW, unit_preference: 'lb' }] });

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', authHeader)
      .send({ unitPreference: 'lb' });

    expect(res.status).toBe(200);
    expect(res.body.user.unitPreference).toBe('lb');
  });

  it('only writes the fields that were sent', async () => {
    // Sending just the unit must not blank a previously answered sex.
    mockAuthenticatedUser();
    queryMock.mockResolvedValueOnce({ rows: [{ ...AUTHED_ROW, unit_preference: 'lb' }] });

    await request(app)
      .patch('/api/auth/me')
      .set('Authorization', authHeader)
      .send({ unitPreference: 'lb' });

    const [sql] = queryMock.mock.calls[1];
    expect(sql).toContain('unit_preference');
    expect(sql).not.toContain('sex');
  });

  it('accepts an explicit null sex as withdrawing an earlier answer', async () => {
    mockAuthenticatedUser();
    queryMock.mockResolvedValueOnce({ rows: [{ ...AUTHED_ROW, sex: null }] });

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', authHeader)
      .send({ sex: null });

    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain('sex');
    expect(params[0]).toBeNull();
  });

  it('writes only against the token identity, never a client-supplied id', async () => {
    mockAuthenticatedUser();
    queryMock.mockResolvedValueOnce({ rows: [AUTHED_ROW] });

    await request(app)
      .patch('/api/auth/me')
      .set('Authorization', authHeader)
      .send({ unitPreference: 'lb', id: 'someone-else' });

    const [, params] = queryMock.mock.calls[1];
    expect(params[params.length - 1]).toBe('u1');
  });

  it.each([
    ['an unknown unit', { unitPreference: 'stone' }],
    ['a non-string unit', { unitPreference: 1 }],
    ['an unknown sex', { sex: 'other-value' }],
    ['nothing at all', {}],
  ])('rejects %s with 400 and no write', async (_label, body) => {
    mockAuthenticatedUser();

    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', authHeader)
      .send(body);

    expect(res.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1); // the requireAuth lookup only
  });
});
