import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

const queryMock = vi.fn();
vi.mock('../db/database.js', () => ({ default: { query: (...args) => queryMock(...args) } }));

const { default: authRouter } = await import('./auth.js');

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
